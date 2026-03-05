/**
 * 移动端云端备份服务
 * 使用 Capacitor Preferences 存储云端备份配置
 * WebDAV: 使用 HTTP 客户端实现真正的 WebDAV 协议
 * iCloud Drive: iOS 使用 Capacitor Filesystem，Android 禁用
 */

import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { CapacitorHttp, HttpResponse } from '@capacitor/core'
import type {
  CloudStorageConfig,
  CloudBackupInfo,
  CloudBackupResult,
  CloudRestoreResult,
  CloudFileInfo
} from '@shared/types/cloud-backup'

const STORAGE_KEYS = {
  CONFIGS: 'cloud_backup_configs'
}

const WEBDAV_BACKUP_DIR = '/AI-Gist-Backup'

export class MobileCloudBackupService {
  private static instance: MobileCloudBackupService

  private constructor() { }

  static getInstance(): MobileCloudBackupService {
    if (!MobileCloudBackupService.instance) {
      MobileCloudBackupService.instance = new MobileCloudBackupService()
    }
    return MobileCloudBackupService.instance
  }

  /**
   * 检查 iCloud 是否可用（仅 iOS）
   */
  async isICloudAvailable(): Promise<{ available: boolean; reason?: string }> {
    const platform = Capacitor.getPlatform()

    if (platform === 'android') {
      return {
        available: false,
        reason: 'Android 平台暂不支持 iCloud Drive'
      }
    }

    if (platform === 'ios') {
      // iOS 平台检查 iCloud 容器是否可用
      try {
        // 尝试访问 iCloud 目录
        await Filesystem.readdir({
          path: '',
          directory: Directory.Library
        })
        return { available: true }
      } catch (error) {
        return {
          available: false,
          reason: 'iCloud Drive 未启用或不可访问'
        }
      }
    }

    return {
      available: false,
      reason: '不支持的平台'
    }
  }

  /**
   * 获取所有存储配置
   */
  async getStorageConfigs(): Promise<CloudStorageConfig[]> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.CONFIGS })
      if (!value) return []
      return JSON.parse(value)
    } catch (error) {
      console.error('获取存储配置失败:', error)
      return []
    }
  }

  /**
   * 添加存储配置
   */
  async addStorageConfig(config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
    success: boolean
    config?: CloudStorageConfig
    error?: string
  }> {
    try {
      // 如果是 iCloud 配置，检查平台支持
      if (config.type === 'icloud') {
        const icloudCheck = await this.isICloudAvailable()
        if (!icloudCheck.available) {
          return {
            success: false,
            error: icloudCheck.reason || 'iCloud 不可用'
          }
        }
      }

      const configs = await this.getStorageConfigs()

      const newConfig: CloudStorageConfig = {
        ...config,
        id: this.generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      configs.push(newConfig)
      await Preferences.set({
        key: STORAGE_KEYS.CONFIGS,
        value: JSON.stringify(configs)
      })

      return { success: true, config: newConfig }
    } catch (error) {
      console.error('添加存储配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加失败'
      }
    }
  }

  /**
   * 更新存储配置
   */
  async updateStorageConfig(id: string, updates: Partial<CloudStorageConfig>): Promise<{
    success: boolean
    config?: CloudStorageConfig
    error?: string
  }> {
    try {
      const configs = await this.getStorageConfigs()
      const index = configs.findIndex(c => c.id === id)

      if (index === -1) {
        return { success: false, error: '配置不存在' }
      }

      const updatedConfig = {
        ...configs[index],
        ...updates,
        id,
        updatedAt: new Date().toISOString()
      }

      configs[index] = updatedConfig
      await Preferences.set({
        key: STORAGE_KEYS.CONFIGS,
        value: JSON.stringify(configs)
      })

      return { success: true, config: updatedConfig }
    } catch (error) {
      console.error('更新存储配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新失败'
      }
    }
  }

  /**
   * 删除存储配置
   */
  async deleteStorageConfig(id: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      const configs = await this.getStorageConfigs()
      const filtered = configs.filter(c => c.id !== id)

      await Preferences.set({
        key: STORAGE_KEYS.CONFIGS,
        value: JSON.stringify(filtered)
      })

      return { success: true }
    } catch (error) {
      console.error('删除存储配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除失败'
      }
    }
  }

  /**
   * 测试存储连接
   */
  async testStorageConnection(config: CloudStorageConfig): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      if (config.type === 'webdav') {
        return await this.testWebDAVConnection(config as any)
      } else if (config.type === 'icloud') {
        return await this.testICloudConnection(config as any)
      }

      return { success: false, error: '不支持的存储类型' }
    } catch (error) {
      console.error('测试连接失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '测试失败'
      }
    }
  }

  /**
   * 测试 WebDAV 连接
   */
  private async testWebDAVConnection(config: any): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      if (!config.url || !config.username || !config.password) {
        return { success: false, error: 'WebDAV 配置不完整' }
      }

      // 使用 PROPFIND 方法测试连接
      const response = await CapacitorHttp.request({
        url: config.url,
        method: 'PROPFIND',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Depth': '0'
        }
      })

      if (response.status >= 200 && response.status < 300) {
        return { success: true }
      }

      return {
        success: false,
        error: `连接失败: HTTP ${response.status}`
      }
    } catch (error) {
      console.error('WebDAV 连接测试失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  /**
   * 测试 iCloud 连接
   */
  private async testICloudConnection(config: any): Promise<{
    success: boolean
    error?: string
  }> {
    const icloudCheck = await this.isICloudAvailable()
    if (!icloudCheck.available) {
      return {
        success: false,
        error: icloudCheck.reason
      }
    }

    if (!config.path) {
      return { success: false, error: 'iCloud 路径不能为空' }
    }

    return { success: true }
  }

  /**
   * 获取云端备份列表
   */
  async getCloudBackupList(storageId: string): Promise<CloudBackupInfo[]> {
    try {
      const configs = await this.getStorageConfigs()
      const config = configs.find(c => c.id === storageId)

      if (!config) {
        throw new Error('存储配置不存在')
      }

      if (config.type === 'webdav') {
        return await this.listWebDAVBackups(config as any)
      } else if (config.type === 'icloud') {
        return await this.listICloudBackups(config as any)
      }

      return []
    } catch (error) {
      console.error('获取备份列表失败:', error)
      throw error
    }
  }

  /**
   * 列出 WebDAV 备份
   */
  private async listWebDAVBackups(config: any): Promise<CloudBackupInfo[]> {
    try {
      const url = `${config.url}${WEBDAV_BACKUP_DIR}`

      console.log('列出 WebDAV 备份，URL:', url)

      // 使用 PROPFIND 列出目录内容
      const response = await CapacitorHttp.request({
        url,
        method: 'PROPFIND',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      })

      console.log('WebDAV PROPFIND 响应状态:', response.status)

      if (response.status === 404) {
        // 目录不存在，尝试创建
        console.log('备份目录不存在，尝试创建...')
        await this.createWebDAVDirectory(config, WEBDAV_BACKUP_DIR)
        return []
      }

      if (response.status !== 207) {
        console.error('WebDAV PROPFIND 失败，状态码:', response.status)
        return []
      }

      // 解析 WebDAV 响应
      const files = this.parseWebDAVResponse(response.data)
      console.log('解析到的文件:', files)

      const backups: CloudBackupInfo[] = []

      // 过滤出备份文件
      const backupFiles = files.filter(file =>
        file.name.endsWith('.json') && file.name.startsWith('backup-')
      )

      console.log('找到备份文件数量:', backupFiles.length)

      // 读取每个备份文件的元数据
      for (const file of backupFiles) {
        try {
          // 构建完整的文件 URL
          // file.path 是相对路径或绝对路径，需要正确拼接
          let fileUrl: string
          if (file.path.startsWith('http')) {
            // 已经是完整 URL
            fileUrl = file.path
          } else if (file.path.startsWith('/')) {
            // 绝对路径，需要提取 config.url 的协议和域名部分
            const urlObj = new URL(config.url)
            fileUrl = `${urlObj.protocol}//${urlObj.host}${file.path}`
          } else {
            // 相对路径
            fileUrl = `${config.url}${WEBDAV_BACKUP_DIR}/${file.path}`
          }

          console.log('读取备份文件:', fileUrl)

          const fileResponse = await CapacitorHttp.request({
            url: fileUrl,
            method: 'GET',
            headers: {
              'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
            }
          })

          if (fileResponse.status === 200) {
            console.log('文件响应数据类型:', typeof fileResponse.data)
            console.log('文件响应数据长度:', fileResponse.data?.length)

            // CapacitorHttp 可能返回字符串或对象
            let backupData
            let actualSize = 0

            if (typeof fileResponse.data === 'string') {
              actualSize = new Blob([fileResponse.data]).size
              backupData = JSON.parse(fileResponse.data)
            } else if (typeof fileResponse.data === 'object') {
              const jsonString = JSON.stringify(fileResponse.data)
              actualSize = new Blob([jsonString]).size
              backupData = fileResponse.data
            } else {
              console.warn('未知的响应数据类型:', typeof fileResponse.data)
              continue
            }

            console.log('实际文件大小:', actualSize, 'bytes')

            backups.push({
              id: backupData.id,
              name: backupData.name,
              description: backupData.description,
              createdAt: backupData.createdAt,
              size: actualSize, // 使用实际读取的文件大小
              cloudPath: file.path,
              storageId: config.id
            })
            console.log('成功读取备份:', backupData.name)
          } else {
            console.warn('读取备份文件失败，状态码:', fileResponse.status)
          }
        } catch (error) {
          console.warn('解析备份文件失败:', file.name, error)
          console.error('错误详情:', error)
        }
      }

      console.log('最终备份列表数量:', backups.length)

      return backups.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch (error) {
      console.error('列出 WebDAV 备份失败:', error)
      throw error
    }
  }

  /**
   * 列出 iCloud 备份
   */
  private async listICloudBackups(config: any): Promise<CloudBackupInfo[]> {
    try {
      const icloudCheck = await this.isICloudAvailable()
      if (!icloudCheck.available) {
        throw new Error(icloudCheck.reason)
      }

      const dirPath = config.path || 'AI-Gist-Backup'

      // 确保目录存在
      try {
        await Filesystem.mkdir({
          path: dirPath,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (error) {
        // 目录可能已存在，忽略错误
        console.log('创建 iCloud 目录:', error)
      }

      // 读取 iCloud 目录
      let result
      try {
        result = await Filesystem.readdir({
          path: dirPath,
          directory: Directory.Documents
        })
      } catch (error) {
        // 目录为空或不存在
        console.log('读取 iCloud 目录失败:', error)
        return []
      }

      const backups: CloudBackupInfo[] = []

      for (const file of result.files) {
        if (file.name && file.name.endsWith('.json') && file.name.startsWith('backup-')) {
          try {
            // 读取备份文件
            const fileResult = await Filesystem.readFile({
              path: `${dirPath}/${file.name}`,
              directory: Directory.Documents,
              encoding: Encoding.UTF8
            })

            const backupData = JSON.parse(fileResult.data as string)
            backups.push({
              id: backupData.id,
              name: backupData.name,
              description: backupData.description,
              createdAt: backupData.createdAt,
              size: file.size || 0,
              cloudPath: `${dirPath}/${file.name}`,
              storageId: config.id
            })
          } catch (error) {
            console.warn('解析 iCloud 备份文件失败:', file.name, error)
          }
        }
      }

      return backups.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch (error) {
      console.error('列出 iCloud 备份失败:', error)
      throw error
    }
  }

  /**
   * 解析 WebDAV PROPFIND 响应
   */
  private parseWebDAVResponse(xmlData: string): CloudFileInfo[] {
    const files: CloudFileInfo[] = []

    try {
      // 简单的 XML 解析
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlData, 'text/xml')

      // 尝试不同的命名空间
      let responses = doc.getElementsByTagName('d:response')
      if (responses.length === 0) {
        responses = doc.getElementsByTagName('D:response')
      }
      if (responses.length === 0) {
        responses = doc.getElementsByTagName('response')
      }

      console.log('WebDAV 响应数量:', responses.length)

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i]

        // 获取 href
        let hrefElement = response.getElementsByTagName('d:href')[0] ||
          response.getElementsByTagName('D:href')[0] ||
          response.getElementsByTagName('href')[0]

        if (!hrefElement) continue

        const href = hrefElement.textContent || ''
        console.log('处理文件:', href)

        // 获取 propstat
        let propstat = response.getElementsByTagName('d:propstat')[0] ||
          response.getElementsByTagName('D:propstat')[0] ||
          response.getElementsByTagName('propstat')[0]

        if (!propstat) continue

        // 获取 prop
        let prop = propstat.getElementsByTagName('d:prop')[0] ||
          propstat.getElementsByTagName('D:prop')[0] ||
          propstat.getElementsByTagName('prop')[0]

        if (!prop) continue

        // 检查是否是目录
        let resourcetype = prop.getElementsByTagName('d:resourcetype')[0] ||
          prop.getElementsByTagName('D:resourcetype')[0] ||
          prop.getElementsByTagName('resourcetype')[0]

        let isDirectory = false
        if (resourcetype) {
          const collection = resourcetype.getElementsByTagName('d:collection')[0] ||
            resourcetype.getElementsByTagName('D:collection')[0] ||
            resourcetype.getElementsByTagName('collection')[0]
          isDirectory = !!collection
        }

        // 提取文件名（需要在获取大小之前，因为日志需要用到）
        const name = decodeURIComponent(href.split('/').filter(Boolean).pop() || '')

        // 获取文件大小
        let contentlength = prop.getElementsByTagName('d:getcontentlength')[0] ||
          prop.getElementsByTagName('D:getcontentlength')[0] ||
          prop.getElementsByTagName('getcontentlength')[0] ||
          prop.getElementsByTagName('lp1:getcontentlength')[0] ||
          prop.getElementsByTagName('lp2:getcontentlength')[0]

        let size = 0
        if (contentlength && contentlength.textContent) {
          size = parseInt(contentlength.textContent, 10)
          console.log('从 XML 解析文件大小:', name, size)
        }

        // 获取修改时间
        let lastmodified = prop.getElementsByTagName('d:getlastmodified')[0] ||
          prop.getElementsByTagName('D:getlastmodified')[0] ||
          prop.getElementsByTagName('getlastmodified')[0]
        const modifiedAt = lastmodified ? (lastmodified.textContent || '') : new Date().toISOString()

        // 跳过目录本身和空文件名
        if (name && !isDirectory && !href.endsWith(WEBDAV_BACKUP_DIR + '/')) {
          console.log('添加文件:', name, 'size:', size)
          files.push({
            name,
            path: href,
            size,
            isDirectory,
            modifiedAt
          })
        }
      }

      console.log('解析到的文件数量:', files.length)
    } catch (error) {
      console.error('解析 WebDAV 响应失败:', error)
    }

    return files
  }

  /**
   * 创建云端备份
   */
  async createCloudBackup(
    storageId: string,
    data: any,
    description?: string
  ): Promise<CloudBackupResult> {
    try {
      const configs = await this.getStorageConfigs()
      const config = configs.find(c => c.id === storageId)

      if (!config) {
        return {
          success: false,
          message: '存储配置不存在',
          error: '存储配置不存在'
        }
      }

      const backupId = this.generateId()
      const timestamp = new Date().toISOString()
      const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`

      const backupData = {
        id: backupId,
        name: backupName,
        description: description || '移动端云端备份',
        createdAt: timestamp,
        data
      }

      const jsonString = JSON.stringify(backupData, null, 2)
      const fileName = `${backupName}.json`

      if (config.type === 'webdav') {
        return await this.createWebDAVBackup(config as any, fileName, jsonString, backupData)
      } else if (config.type === 'icloud') {
        return await this.createICloudBackup(config as any, fileName, jsonString, backupData)
      }

      return {
        success: false,
        message: '不支持的存储类型',
        error: '不支持的存储类型'
      }
    } catch (error) {
      console.error('创建云端备份失败:', error)
      return {
        success: false,
        message: '创建云端备份失败',
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 创建 WebDAV 备份
   */
  private async createWebDAVBackup(
    config: any,
    fileName: string,
    jsonString: string,
    backupData: any
  ): Promise<CloudBackupResult> {
    try {
      // 确保备份目录存在
      await this.createWebDAVDirectory(config, WEBDAV_BACKUP_DIR)
      console.log('创建 WebDAV 备份，文件名:', fileName)


      // 上传备份文件
      const fileUrl = `${config.url}${WEBDAV_BACKUP_DIR}/${fileName}`
      console.log('上传到 URL:', fileUrl)
      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Content-Type': 'application/json'
        },
        data: jsonString
      })


      console.log('上传响应状态:', response.status)
      if (response.status >= 200 && response.status < 300) {
        const backupInfo: CloudBackupInfo = {
          id: backupData.id,
          name: backupData.name,
          description: backupData.description,
          createdAt: backupData.createdAt,
          size: new Blob([jsonString]).size,
          cloudPath: `${WEBDAV_BACKUP_DIR}/${fileName}`,
          storageId: config.id
        }

        console.log('备份创建成功:', backupInfo)

        return {
          success: true,
          message: '云端备份创建成功',
          backupInfo
        }
      }

      return {
        success: false,
        message: '上传备份失败',
        error: `HTTP ${response.status}`
      }
    } catch (error) {
      console.error('创建 WebDAV 备份失败:', error)
      throw error
    }
  }

  /**
   * 创建 iCloud 备份
   */
  private async createICloudBackup(
    config: any,
    fileName: string,
    jsonString: string,
    backupData: any
  ): Promise<CloudBackupResult> {
    try {
      const icloudCheck = await this.isICloudAvailable()
      if (!icloudCheck.available) {
        return {
          success: false,
          message: icloudCheck.reason || 'iCloud 不可用',
          error: icloudCheck.reason
        }
      }

      const dirPath = config.path || 'AI-Gist-Backup'

      // 确保目录存在
      try {
        await Filesystem.mkdir({
          path: dirPath,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (error) {
        // 目录可能已存在，忽略错误
      }

      // 写入备份文件
      await Filesystem.writeFile({
        path: `${dirPath}/${fileName}`,
        data: jsonString,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })

      const backupInfo: CloudBackupInfo = {
        id: backupData.id,
        name: backupData.name,
        description: backupData.description,
        createdAt: backupData.createdAt,
        size: new Blob([jsonString]).size,
        cloudPath: `${dirPath}/${fileName}`,
        storageId: config.id
      }

      return {
        success: true,
        message: '云端备份创建成功',
        backupInfo
      }
    } catch (error) {
      console.error('创建 iCloud 备份失败:', error)
      throw error
    }
  }

  /**
   * 创建 WebDAV 目录
   */
  private async createWebDAVDirectory(config: any, dirPath: string): Promise<void> {
    try {
      const url = `${config.url}${dirPath}`
      console.log('创建 WebDAV 目录:', url)
      const response = await CapacitorHttp.request({
        url,
        method: 'MKCOL',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
        }
      })
      console.log('创建目录响应状态:', response.status)
    } catch (error: any) {
      // 目录可能已存在（405 Method Not Allowed 或 409 Conflict）
      if (error.status === 405 || error.status === 409) {
        console.log('目录已存在')
      } else {
        console.log('创建 WebDAV 目录失败:', error)
      }
    }
  }
  /**
   * 恢复云端备份
   */
  async restoreCloudBackup(storageId: string, backupId: string): Promise<CloudRestoreResult> {
    try {
      const configs = await this.getStorageConfigs()
      const config = configs.find(c => c.id === storageId)

      if (!config) {
        return {
          success: false,
          message: '存储配置不存在',
          error: '存储配置不存在'
        }
      }

      if (config.type === 'webdav') {
        return await this.restoreWebDAVBackup(config as any, backupId)
      } else if (config.type === 'icloud') {
        return await this.restoreICloudBackup(config as any, backupId)
      }

      return {
        success: false,
        message: '不支持的存储类型',
        error: '不支持的存储类型'
      }
    } catch (error) {
      console.error('恢复云端备份失败:', error)
      return {
        success: false,
        message: '恢复云端备份失败',
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 恢复 WebDAV 备份
   */
  private async restoreWebDAVBackup(config: any, backupId: string): Promise<CloudRestoreResult> {
    try {
      // 获取备份列表找到对应的备份
      const backups = await this.listWebDAVBackups(config)
      const backup = backups.find(b => b.id === backupId)

      if (!backup || !backup.cloudPath) {
        return {
          success: false,
          message: '备份不存在',
          error: '备份不存在'
        }
      }

      // 下载备份文件
      // backup.cloudPath 是相对路径或绝对路径，需要正确拼接
      let fileUrl: string
      if (backup.cloudPath.startsWith('http')) {
        fileUrl = backup.cloudPath
      } else if (backup.cloudPath.startsWith('/')) {
        const urlObj = new URL(config.url)
        fileUrl = `${urlObj.protocol}//${urlObj.host}${backup.cloudPath}`
      } else {
        fileUrl = `${config.url}/${backup.cloudPath}`
      }

      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
        }
      })

      if (response.status !== 200) {
        return {
          success: false,
          message: '下载备份失败',
          error: `HTTP ${response.status}`
        }
      }

      // CapacitorHttp 可能返回字符串或对象
      let backupData
      if (typeof response.data === 'string') {
        backupData = JSON.parse(response.data)
      } else if (typeof response.data === 'object') {
        backupData = response.data
      } else {
        return {
          success: false,
          message: '响应数据格式错误',
          error: '响应数据格式错误'
        }
      }

      return {
        success: true,
        message: '云端备份恢复成功',
        backupInfo: {
          ...backup,
          data: backupData.data
        }
      }
    } catch (error) {
      console.error('恢复 WebDAV 备份失败:', error)
      throw error
    }
  }

  /**
   * 恢复 iCloud 备份
   */
  private async restoreICloudBackup(config: any, backupId: string): Promise<CloudRestoreResult> {
    try {
      const icloudCheck = await this.isICloudAvailable()
      if (!icloudCheck.available) {
        return {
          success: false,
          message: icloudCheck.reason || 'iCloud 不可用',
          error: icloudCheck.reason
        }
      }

      // 获取备份列表找到对应的备份
      const backups = await this.listICloudBackups(config)
      const backup = backups.find(b => b.id === backupId)

      if (!backup || !backup.cloudPath) {
        return {
          success: false,
          message: '备份不存在',
          error: '备份不存在'
        }
      }

      // 读取备份文件
      const result = await Filesystem.readFile({
        path: backup.cloudPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })

      const backupData = JSON.parse(result.data as string)

      return {
        success: true,
        message: '云端备份恢复成功',
        backupInfo: {
          ...backup,
          data: backupData.data
        }
      }
    } catch (error) {
      console.error('恢复 iCloud 备份失败:', error)
      throw error
    }
  }

  /**
   * 删除云端备份
   */
  async deleteCloudBackup(storageId: string, backupId: string): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      const configs = await this.getStorageConfigs()
      const config = configs.find(c => c.id === storageId)

      if (!config) {
        return { success: false, error: '存储配置不存在' }
      }

      if (config.type === 'webdav') {
        return await this.deleteWebDAVBackup(config as any, backupId)
      } else if (config.type === 'icloud') {
        return await this.deleteICloudBackup(config as any, backupId)
      }

      return { success: false, error: '不支持的存储类型' }
    } catch (error) {
      console.error('删除云端备份失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除失败'
      }
    }
  }

  /**
   * 删除 WebDAV 备份
   */
  private async deleteWebDAVBackup(config: any, backupId: string): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      // 获取备份列表找到对应的备份
      const backups = await this.listWebDAVBackups(config)
      const backup = backups.find(b => b.id === backupId)

      if (!backup || !backup.cloudPath) {
        return { success: false, error: '备份不存在' }
      }

      // 删除文件
      // backup.cloudPath 是相对路径或绝对路径，需要正确拼接
      let fileUrl: string
      if (backup.cloudPath.startsWith('http')) {
        fileUrl = backup.cloudPath
      } else if (backup.cloudPath.startsWith('/')) {
        const urlObj = new URL(config.url)
        fileUrl = `${urlObj.protocol}//${urlObj.host}${backup.cloudPath}`
      } else {
        fileUrl = `${config.url}/${backup.cloudPath}`
      }

      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
        }
      })

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          message: '云端备份删除成功'
        }
      }

      return {
        success: false,
        error: `删除失败: HTTP ${response.status}`
      }
    } catch (error) {
      console.error('删除 WebDAV 备份失败:', error)
      throw error
    }
  }

  /**
   * 删除 iCloud 备份
   */
  private async deleteICloudBackup(config: any, backupId: string): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      const icloudCheck = await this.isICloudAvailable()
      if (!icloudCheck.available) {
        return {
          success: false,
          error: icloudCheck.reason
        }
      }

      // 获取备份列表找到对应的备份
      const backups = await this.listICloudBackups(config)
      const backup = backups.find(b => b.id === backupId)

      if (!backup || !backup.cloudPath) {
        return { success: false, error: '备份不存在' }
      }

      // 删除文件
      await Filesystem.deleteFile({
        path: backup.cloudPath,
        directory: Directory.Documents
      })

      return {
        success: true,
        message: '云端备份删除成功'
      }
    } catch (error) {
      console.error('删除 iCloud 备份失败:', error)
      throw error
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

export const mobileCloudBackupService = MobileCloudBackupService.getInstance()
