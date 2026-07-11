/**
 * 移动端云端备份服务
 * 使用 Capacitor Preferences 存储云端备份配置
 * WebDAV: 使用 HTTP 客户端实现真正的 WebDAV 协议
 * iCloud Drive: iOS 使用 Capacitor Filesystem，Android 禁用
 */

import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { CapacitorHttp } from '@capacitor/core'
import WebDav from '@renderer/capacitor-bridge/webdav-native'
import type {
  CloudStorageConfig,
  CloudBackupInfo,
  CloudBackupCreateOptions,
  CloudBackupResult,
  CloudRestoreResult,
  CloudFileInfo
} from '@shared/types/cloud-backup'
import {
  CLOUD_BACKUP_DIR,
  CLOUD_SYNC_MANIFEST_BACKUP_FILE,
  CLOUD_SYNC_MANIFEST_FILE,
  getCloudSyncSnapshotFileName,
  getCloudSyncSnapshotPath,
  getCloudSyncSnapshotRevisionFromFileName,
  getCloudSyncSnapshotsDirectoryPath,
  getCloudSyncSnapshotsDirectoryRelativePath,
  getCloudSyncV2DirectoryPath,
  getCloudBackupDirectoryPath,
  getCloudBackupFilePath,
  getCloudSyncManifestBackupPath,
  getCloudSyncManifestPath,
  isCloudBackupFileName,
  joinCloudPath,
  normalizeCloudPath
} from '@shared/cloud-backup-paths'
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest'
import {
  assertValidCloudSyncManifest,
  createCloudSyncManifestRevisionConflictError,
  doesCloudSyncManifestMatchExpectedRevision,
  getCloudSyncManifestRevision,
  readCloudSyncManifestWithFallback
} from '@shared/cloud-sync-manifest'
import type { CloudSyncSnapshot } from '@shared/cloud-sync-engine'
import type { CloudSyncRemoteSnapshotInfo } from '@shared/cloud-sync-snapshots'
import {
  assertValidCloudSyncSnapshotFile,
  createCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots'
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity'
import type {
  CloudSyncV2ObjectStorageAdapter,
  CloudSyncV2ObjectWriteOptions,
  CloudSyncV2ObjectWriteResult,
  CloudSyncV2StoredObject,
  CloudSyncV2StoredObjectInfo
} from '@shared/cloud-sync-v2-repository'

const STORAGE_KEYS = {
  CONFIGS: 'cloud_backup_configs'
}

const WEBDAV_REQUEST_TIMEOUT_MS = 30_000
const CLOUD_BACKUP_DEBUG_STORAGE_KEY = 'ai-gist.debug.cloud-backup'
const CLOUD_SYNC_V2_ARTIFACT_DIRECTORIES = [
  'commits',
  'checkpoints',
  'deltas',
  'blobs',
  'quarantine'
] as const

export class MobileCloudBackupService {
  private static instance: MobileCloudBackupService

  private constructor() {
    // Singleton service.
  }

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
      this.debugLog('获取存储配置失败:', error)
      throw new Error(`获取存储配置失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private async getStorageConfigOrThrow(storageId: string): Promise<CloudStorageConfig> {
    const configs = await this.getStorageConfigs()
    const config = configs.find(c => c.id === storageId)
    if (!config) {
      throw new Error('存储配置不存在')
    }
    return config
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
      this.debugLog('添加存储配置失败:', error)
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
      this.debugLog('更新存储配置失败:', error)
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
      this.debugLog('删除存储配置失败:', error)
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
      this.debugLog('测试连接失败:', error)
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

      // 使用 OPTIONS 测试连接（Android CapacitorHttp 不支持 PROPFIND）
      const response = await CapacitorHttp.request({
        url: this.normalizeBaseUrl(config.url),
        method: 'OPTIONS',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
        }
      })

      // 401/403 → 凭据错误；2xx / 多数 WebDAV 服务会返回 200
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: '认证失败，请检查用户名和密码' }
      }

      if (response.status >= 200 && response.status < 300) {
        return { success: true }
      }

      return {
        success: false,
        error: `连接失败: HTTP ${response.status}`
      }
    } catch (error) {
      this.debugLog('WebDAV 连接测试失败:', error)
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
      this.debugLog('获取备份列表失败:', error)
      throw error
    }
  }

  /**
   * 获取云同步 manifest。文件不存在时返回空 manifest，表示首次同步。
   */
  async getCloudSyncManifest(storageId: string): Promise<CloudSyncManifest> {
    const config = await this.getStorageConfigOrThrow(storageId)

    if (config.type === 'webdav') {
      return this.getWebDAVSyncManifest(config as any)
    }

    if (config.type === 'icloud') {
      return this.getICloudSyncManifest(config as any)
    }

    throw new Error('不支持的存储类型')
  }

  /**
   * 保存云同步 manifest。
   */
  async saveCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions = {}
  ): Promise<CloudSyncManifestSaveResult> {
    try {
      const config = await this.getStorageConfigOrThrow(storageId)
      const normalizedManifest = assertValidCloudSyncManifest({
        ...manifest,
        updatedAt: new Date().toISOString()
      })

      if (config.type === 'webdav') {
        await this.saveWebDAVSyncManifest(config as any, normalizedManifest, options)
        return { success: true }
      }

      if (config.type === 'icloud') {
        await this.saveICloudSyncManifest(config as any, normalizedManifest, options)
        return { success: true }
      }

      return { success: false, error: '不支持的存储类型' }
    } catch (error) {
      if (this.isCloudSyncRevisionConflictError(error)) {
        return {
          success: false,
          conflict: true,
          currentRevision: await this.tryReadCloudSyncManifestRevision(storageId),
          error: error instanceof Error ? error.message : '云同步 manifest 已被其他设备更新'
        }
      }

      this.debugLog('保存云同步 manifest 失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存云同步 manifest 失败'
      }
    }
  }

  async listCloudSyncSnapshots(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]> {
    const config = await this.getStorageConfigOrThrow(storageId)

    if (config.type === 'webdav') {
      return this.listWebDAVSyncSnapshots(config as any)
    }

    if (config.type === 'icloud') {
      return this.listICloudSyncSnapshots(config as any)
    }

    return []
  }

  async readCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    const config = await this.getStorageConfigOrThrow(storageId)

    if (config.type === 'webdav') {
      return this.readWebDAVSyncSnapshot(config as any, snapshot)
    }

    if (config.type === 'icloud') {
      return this.readICloudSyncSnapshot(config as any, snapshot)
    }

    throw new Error('不支持的存储类型')
  }

  async saveCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncSnapshot
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getStorageConfigOrThrow(storageId)
      const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot)

      if (config.type === 'webdav') {
        await this.saveWebDAVSyncSnapshot(config as any, normalizedSnapshot)
        return { success: true }
      }

      if (config.type === 'icloud') {
        await this.saveICloudSyncSnapshot(config as any, normalizedSnapshot)
        return { success: true }
      }

      return { success: false, error: '不支持的存储类型' }
    } catch (error) {
      this.debugLog('保存云同步快照失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存云同步快照失败'
      }
    }
  }

  async readCloudSyncV2Object(
    storageId: string,
    path: string
  ): Promise<CloudSyncV2StoredObject | null> {
    const config = await this.getStorageConfigOrThrow(storageId)
    const canonicalPath = this.normalizeCloudSyncV2ObjectPath(path)

    if (config.type === 'webdav') {
      const response = await CapacitorHttp.request({
        url: this.buildWebDAVUrlFromCloudPath(config as any, canonicalPath),
        method: 'GET',
        responseType: 'arraybuffer',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${(config as any).username}:${(config as any).password}`)
        }
      })
      if (response.status === 404) {
        return null
      }
      if (response.status !== 200) {
        throw new Error(`读取 sync-v2 对象失败（HTTP ${response.status}）`)
      }
      return {
        data: await this.decodeBinaryResponse(response.data),
        etag: this.getResponseHeader(response, 'etag')
      }
    }

    if (config.type === 'icloud') {
      await this.assertICloudAvailable()
      try {
        const result = await Filesystem.readFile({
          path: this.getICloudSyncV2ObjectPath(config as any, canonicalPath),
          directory: Directory.Documents
        })
        return { data: await this.decodeBinaryResponse(result.data) }
      } catch (error) {
        if (this.isNotFoundError(error)) {
          return null
        }
        throw error
      }
    }

    throw new Error('不支持的存储类型')
  }

  async writeCloudSyncV2Object(
    storageId: string,
    path: string,
    data: Uint8Array,
    options: CloudSyncV2ObjectWriteOptions = {}
  ): Promise<CloudSyncV2ObjectWriteResult> {
    if (!(data instanceof Uint8Array)) {
      throw new Error('sync-v2 对象内容必须是 Uint8Array')
    }
    this.assertValidCloudSyncV2WriteOptions(options)
    const config = await this.getStorageConfigOrThrow(storageId)
    const canonicalPath = this.normalizeCloudSyncV2ObjectPath(path)

    if (config.type === 'webdav') {
      const parentPath = canonicalPath.slice(0, canonicalPath.lastIndexOf('/'))
      await this.ensureWebDAVBackupDirectory(config as any)
      await this.ensureWebDAVDirectoryPath(config as any, parentPath)
      const conditionalHeaders: Record<string, string> = {}
      if (options.ifAbsent) {
        conditionalHeaders['If-None-Match'] = '*'
      } else if (options.expectedEtag !== undefined) {
        conditionalHeaders['If-Match'] = this.normalizeIfMatchHeaderValue(options.expectedEtag)
      }
      const response = await CapacitorHttp.request({
        url: this.buildWebDAVUrlFromCloudPath(config as any, canonicalPath),
        method: 'PUT',
        data: this.encodeBase64(data),
        dataType: 'file',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${(config as any).username}:${(config as any).password}`),
          'Content-Type': 'application/octet-stream',
          ...conditionalHeaders
        }
      })
      if (response.status === 412 ||
          ((options.ifAbsent || options.expectedEtag !== undefined) && [400, 405, 409, 428, 501].includes(response.status))) {
        return {
          status: 'precondition_failed',
          etag: this.getResponseHeader(response, 'etag')
        }
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`写入 sync-v2 对象失败（HTTP ${response.status}）`)
      }
      return { status: 'written', etag: this.getResponseHeader(response, 'etag') }
    }

    if (config.type === 'icloud') {
      await this.assertICloudAvailable()
      // Capacitor Filesystem has no atomic create-only or compare-and-swap
      // primitive. Refuse conditional writes instead of emulating them with a
      // racy read-then-write sequence that could overwrite another device.
      if (options.ifAbsent || options.expectedEtag !== undefined) {
        return { status: 'precondition_failed' }
      }
      const localPath = this.getICloudSyncV2ObjectPath(config as any, canonicalPath)
      await this.ensureICloudDirectory(localPath.slice(0, localPath.lastIndexOf('/')))
      await Filesystem.writeFile({
        path: localPath,
        data: this.encodeBase64(data),
        directory: Directory.Documents
      })
      return { status: 'written' }
    }

    throw new Error('不支持的存储类型')
  }

  async listCloudSyncV2Objects(
    storageId: string,
    prefix: string
  ): Promise<CloudSyncV2StoredObjectInfo[]> {
    const config = await this.getStorageConfigOrThrow(storageId)
    const canonicalPrefix = this.normalizeCloudSyncV2ObjectPath(prefix)

    if (config.type === 'webdav') {
      return this.listWebDAVSyncV2Objects(config as any, canonicalPrefix)
    }
    if (config.type === 'icloud') {
      await this.assertICloudAvailable()
      return this.listICloudSyncV2Objects(config as any, canonicalPrefix)
    }
    return []
  }

  async deleteCloudSyncV2Object(storageId: string, path: string): Promise<void> {
    const config = await this.getStorageConfigOrThrow(storageId)
    const canonicalPath = this.normalizeCloudSyncV2ObjectPath(path)

    if (config.type === 'webdav') {
      const response = await CapacitorHttp.request({
        url: this.buildWebDAVUrlFromCloudPath(config as any, canonicalPath),
        method: 'DELETE',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${(config as any).username}:${(config as any).password}`)
        }
      })
      if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
        throw new Error(`删除 sync-v2 对象失败（HTTP ${response.status}）`)
      }
      return
    }

    if (config.type === 'icloud') {
      await this.assertICloudAvailable()
      try {
        await Filesystem.deleteFile({
          path: this.getICloudSyncV2ObjectPath(config as any, canonicalPath),
          directory: Directory.Documents
        })
      } catch (error) {
        if (!this.isNotFoundError(error)) {
          throw error
        }
      }
      return
    }

    throw new Error('不支持的存储类型')
  }

  createCloudSyncV2ObjectStorageAdapter(storageId: string): CloudSyncV2ObjectStorageAdapter {
    return {
      read: path => this.readCloudSyncV2Object(storageId, path),
      write: (path, data, options) => this.writeCloudSyncV2Object(storageId, path, data, options),
      delete: path => this.deleteCloudSyncV2Object(storageId, path),
      list: prefix => this.listCloudSyncV2Objects(storageId, prefix)
    }
  }

  /**
   * 列出 WebDAV 备份
   * Android：使用自定义原生插件（OkHttp），绕过 HttpURLConnection 的方法白名单和 CORS 限制
   * iOS/桌面：使用 CapacitorHttp（原生层，支持 PROPFIND）
   */
  private async listWebDAVBackups(config: any): Promise<CloudBackupInfo[]> {
    try {
      const standardBackups = await this.discoverWebDAVBackupsViaPropfind(
        config,
        this.getWebDAVBackupBaseUrl(config),
        'standard'
      )
      const legacyBackups = this.isWebDAVUrlAtBackupDir(config.url)
        ? []
        : await this.discoverWebDAVBackupsViaPropfind(config, this.normalizeBaseUrl(config.url), 'legacy')

      return this.dedupeBackups([...standardBackups, ...legacyBackups])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (error) {
      this.debugLog('列出 WebDAV 备份失败:', error)
      throw error
    }
  }

  /**
   * 通过 PROPFIND 发现 WebDAV 目录中的备份文件并读取元数据
   * Android：使用自定义原生插件（OkHttp），支持 PROPFIND 且不受 CORS 限制
   * iOS/桌面：使用 CapacitorHttp（原生层，同样不受 CORS 限制，且 iOS 不在 HttpURLConnection 白名单限制下）
   */
  private async discoverWebDAVBackupsViaPropfind(
    config: any,
    baseUrl: string,
    layout: 'standard' | 'legacy'
  ): Promise<CloudBackupInfo[]> {
    const platform = Capacitor.getPlatform()

    let xmlData: string
    let status: number

    if (platform === 'android') {
      // Android：通过 OkHttp 原生插件执行 PROPFIND
      // CapacitorHttp 底层 HttpURLConnection 白名单不含 PROPFIND，fetch() 受 CORS 限制
      // OkHttp 原生请求支持任意方法且绕过 CORS
      const response = await WebDav.propfind({
        url: baseUrl,
        username: config.username,
        password: config.password,
        depth: 1,
        ...this.getWebDAVRequestTimeoutOptions()
      })
      status = response.status
      xmlData = response.body
    } else {
      // iOS / 桌面：CapacitorHttp 原生请求，支持 PROPFIND
      const response = await CapacitorHttp.request({
        url: baseUrl,
        method: 'PROPFIND',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      })
      status = response.status
      xmlData = response.data
    }

    if (status === 404) {
      return []
    }

    if (status !== 207) {
      this.debugLog('WebDAV PROPFIND 失败，状态码:', status)
      return []
    }

    const files = this.parseWebDAVResponse(xmlData, baseUrl)
    const backupFiles = files.filter(file => isCloudBackupFileName(file.name))

    const backups: CloudBackupInfo[] = []
    for (const file of backupFiles) {
      try {
        const fileUrl = this.joinUrlPath(baseUrl, file.path)

        const fileResponse = await CapacitorHttp.request({
          url: fileUrl,
          method: 'GET',
          ...this.getWebDAVRequestTimeoutOptions(),
          headers: {
            'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
          }
        })

        if (fileResponse.status === 200) {
          let backupData
          let checksum: string | undefined
          let actualSize = 0

          if (typeof fileResponse.data === 'string') {
            actualSize = new Blob([fileResponse.data]).size
            const parsed = parseBackupPayload(JSON.parse(fileResponse.data))
            backupData = parsed.payload
            checksum = parsed.checksum
          } else if (typeof fileResponse.data === 'object') {
            const jsonString = JSON.stringify(fileResponse.data)
            actualSize = new Blob([jsonString]).size
            const parsed = parseBackupPayload(fileResponse.data)
            backupData = parsed.payload
            checksum = parsed.checksum
          } else {
            continue
          }

          backups.push({
            id: backupData.id,
            name: backupData.name,
            description: backupData.description,
            createdAt: backupData.createdAt,
            size: actualSize,
            cloudPath: layout === 'standard'
              ? getCloudBackupFilePath(file.name)
              : joinCloudPath(file.name),
            storageId: config.id,
            checksum,
            backupType: backupData.backupType,
            trigger: backupData.trigger,
            deviceId: backupData.deviceId,
            dataChecksum: backupData.dataChecksum
          })
        } else {
          this.debugLog('读取备份文件失败，状态码:', fileResponse.status, file.name)
        }
      } catch (error) {
        this.debugLog('解析备份文件失败:', file.name, error)
      }
    }

    return backups
  }

  private async getWebDAVSyncManifest(config: any): Promise<CloudSyncManifest> {
    return readCloudSyncManifestWithFallback({
      readPrimary: () => this.readWebDAVSyncManifestFile(config, getCloudSyncManifestPath()),
      readBackup: () => this.readWebDAVSyncManifestFile(config, getCloudSyncManifestBackupPath()),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    })
  }

  private async readWebDAVSyncManifestFile(config: any, cloudPath: string): Promise<CloudSyncManifest> {
    return (await this.readWebDAVSyncManifestFileWithMeta(config, cloudPath)).manifest
  }

  private async readWebDAVSyncManifestFileWithMeta(
    config: any,
    cloudPath: string
  ): Promise<{ manifest: CloudSyncManifest; etag?: string }> {
    const response = await CapacitorHttp.request({
      url: this.buildWebDAVUrlFromCloudPath(config, cloudPath),
      method: 'GET',
      ...this.getWebDAVRequestTimeoutOptions(),
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
      }
    })

    if (response.status === 404) {
      throw new Error(`云同步 manifest 不存在（HTTP ${response.status}）`)
    }

    if (response.status !== 200) {
      throw new Error(`读取云同步 manifest 失败（HTTP ${response.status}）`)
    }

    const data = typeof response.data === 'string'
      ? JSON.parse(response.data)
      : response.data
    return {
      manifest: assertValidCloudSyncManifest(data),
      etag: this.getResponseHeader(response, 'etag')
    }
  }

  private async saveWebDAVSyncManifest(
    config: any,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions
  ): Promise<void> {
    await this.ensureWebDAVBackupDirectory(config)

    const primaryPath = getCloudSyncManifestPath()
    const backupPath = getCloudSyncManifestBackupPath()

    if (options.expectedRevision === undefined) {
      await this.writeWebDAVSyncManifestFile(config, backupPath, manifest)
      await this.writeWebDAVSyncManifestFile(config, primaryPath, manifest)
      return
    }

    const primaryState = await this.tryReadWebDAVSyncManifestFileWithMeta(config, primaryPath)
    let currentManifest = primaryState?.manifest

    if (!currentManifest) {
      try {
        currentManifest = await this.readWebDAVSyncManifestFile(config, backupPath)
      } catch (error) {
        if (!this.isNotFoundError(error)) {
          throw error
        }
      }
    }

    currentManifest = currentManifest || assertValidCloudSyncManifest({})
    this.assertExpectedCloudSyncRevision(currentManifest, options.expectedRevision)

    await this.writeWebDAVSyncManifestFile(config, primaryPath, manifest, {
      ifMatch: primaryState?.etag,
      ifNoneMatch: !primaryState && !currentManifest.latestSnapshot
    })
    await this.writeWebDAVSyncManifestFile(config, backupPath, manifest)
  }

  private async writeWebDAVSyncManifestFile(
    config: any,
    cloudPath: string,
    manifest: CloudSyncManifest,
    options: { ifMatch?: string; ifNoneMatch?: boolean } = {}
  ): Promise<void> {
    const conditionalHeaders: Record<string, string> = {}
    if (options.ifMatch) {
      conditionalHeaders['If-Match'] = this.normalizeIfMatchHeaderValue(options.ifMatch)
    }
    if (options.ifNoneMatch) {
      conditionalHeaders['If-None-Match'] = '*'
    }

    const response = await CapacitorHttp.request({
      url: this.buildWebDAVUrlFromCloudPath(config, cloudPath),
      method: 'PUT',
      ...this.getWebDAVRequestTimeoutOptions(),
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
        'Content-Type': 'application/json',
        ...conditionalHeaders
      },
      data: JSON.stringify(manifest, null, 2)
    })

    if (response.status === 412) {
      throw createCloudSyncManifestRevisionConflictError(undefined, undefined)
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`保存云同步 manifest 失败（HTTP ${response.status}）`)
    }
  }

  private normalizeIfMatchHeaderValue(etag: string): string {
    const value = String(etag || '').trim()
    if (!value || value === '*' || value.startsWith('"') || value.startsWith('W/"')) {
      return value
    }

    return `"${value.replace(/^"+|"+$/g, '')}"`
  }

  private async listWebDAVSyncSnapshots(config: any): Promise<CloudSyncRemoteSnapshotInfo[]> {
    const files = await this.listWebDAVFilesViaPropfind(config, getCloudSyncSnapshotsDirectoryPath())
    return files
      .filter(file => !file.isDirectory)
      .flatMap<CloudSyncRemoteSnapshotInfo>(file => {
        const revision = getCloudSyncSnapshotRevisionFromFileName(file.name)
        if (!revision) {
          return []
        }

        return [{
          revision,
          path: getCloudSyncSnapshotPath(revision),
          modifiedAt: file.modifiedAt,
          size: file.size
        }]
      })
  }

  private async readWebDAVSyncSnapshot(
    config: any,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    const snapshotInfo = this.normalizeCloudSyncSnapshotReference(snapshot, revision => getCloudSyncSnapshotPath(revision))
    const response = await CapacitorHttp.request({
      url: this.buildWebDAVUrlFromCloudPath(config, snapshotInfo.path),
      method: 'GET',
      ...this.getWebDAVRequestTimeoutOptions(),
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
      }
    })

    if (response.status === 404) {
      throw new Error(`云同步快照不存在（HTTP ${response.status}）`)
    }

    if (response.status !== 200) {
      throw new Error(`读取云同步快照失败（HTTP ${response.status}）`)
    }

    const data = typeof response.data === 'string'
      ? JSON.parse(response.data)
      : response.data
    return assertValidCloudSyncSnapshotFile(data)
  }

  private async saveWebDAVSyncSnapshot(config: any, snapshot: CloudSyncSnapshot): Promise<void> {
    await this.ensureWebDAVBackupDirectory(config)
    await this.ensureWebDAVDirectoryPath(config, getCloudSyncSnapshotsDirectoryPath())

    const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot)
    const snapshotPath = getCloudSyncSnapshotPath(normalizedSnapshot.revision)
    const response = await CapacitorHttp.request({
      url: this.buildWebDAVUrlFromCloudPath(config, snapshotPath),
      method: 'PUT',
      ...this.getWebDAVRequestTimeoutOptions(),
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
        'Content-Type': 'application/json',
        'If-None-Match': '*'
      },
      data: JSON.stringify(createCloudSyncSnapshotFile(normalizedSnapshot), null, 2)
    })

    if (response.status === 412) {
      const existingSnapshot = await this.readWebDAVSyncSnapshot(config, {
        revision: normalizedSnapshot.revision,
        path: snapshotPath
      })
      if (this.isSameCloudSyncSnapshot(existingSnapshot, normalizedSnapshot)) {
        return
      }
      throw new Error(`云同步快照 ${normalizedSnapshot.revision} 已存在但内容不一致`)
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`保存云同步快照失败（HTTP ${response.status}）`)
    }
  }

  private async listWebDAVFilesViaPropfind(config: any, cloudPath: string): Promise<CloudFileInfo[]> {
    const baseUrl = this.buildWebDAVUrlFromCloudPath(config, cloudPath)
    const platform = Capacitor.getPlatform()
    let xmlData: string
    let status: number

    if (platform === 'android') {
      const response = await WebDav.propfind({
        url: baseUrl,
        username: config.username,
        password: config.password,
        depth: 1,
        ...this.getWebDAVRequestTimeoutOptions()
      })
      status = response.status
      xmlData = response.body
    } else {
      const response = await CapacitorHttp.request({
        url: baseUrl,
        method: 'PROPFIND',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      })
      status = response.status
      xmlData = response.data
    }

    if (status === 404) {
      return []
    }

    if (status !== 207) {
      throw new Error(`列出 WebDAV 文件失败（HTTP ${status}）`)
    }

    return this.parseWebDAVResponse(xmlData, baseUrl)
  }

  private async tryReadWebDAVSyncManifestFileWithMeta(
    config: any,
    cloudPath: string
  ): Promise<{ manifest: CloudSyncManifest; etag?: string } | null> {
    try {
      return await this.readWebDAVSyncManifestFileWithMeta(config, cloudPath)
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null
      }
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

      const dirPath = config.path || CLOUD_BACKUP_DIR

      // 检查目录是否存在
      let dirExists = false
      try {
        await Filesystem.stat({
          path: dirPath,
          directory: Directory.Documents
        })
        dirExists = true
        this.debugLog('iCloud 目录已存在:', dirPath)
      } catch (error) {
        this.debugLog('iCloud 目录不存在，需要创建:', dirPath)
      }

      // 只在目录不存在时创建
      if (!dirExists) {
        try {
          await Filesystem.mkdir({
            path: dirPath,
            directory: Directory.Documents,
            recursive: true
          })
          this.debugLog('iCloud 目录创建成功:', dirPath)
        } catch (error: any) {
          this.debugLog('创建 iCloud 目录失败:', error)
          // 如果创建失败，可能是权限问题或其他错误
          throw new Error(`无法创建 iCloud 目录: ${error.message || error}`)
        }
      }

      // 读取 iCloud 目录
      let result
      try {
        result = await Filesystem.readdir({
          path: dirPath,
          directory: Directory.Documents
        })
        this.debugLog('读取 iCloud 目录成功，文件数量:', result.files.length)
      } catch (error: any) {
        this.debugLog('读取 iCloud 目录失败:', error)
        // 如果目录为空或刚创建，返回空数组
        return []
      }

      const backups: CloudBackupInfo[] = []

      for (const file of result.files) {
        if (file.name && isCloudBackupFileName(file.name)) {
          try {
            // 读取备份文件
            const fileResult = await Filesystem.readFile({
              path: `${dirPath}/${file.name}`,
              directory: Directory.Documents,
              encoding: Encoding.UTF8
            })

            const parsedBackup = parseBackupPayload(JSON.parse(fileResult.data as string))
            const backupData = parsedBackup.payload
            backups.push({
              id: backupData.id,
              name: backupData.name,
              description: backupData.description,
              createdAt: backupData.createdAt,
              size: file.size || 0,
              cloudPath: `${dirPath}/${file.name}`,
              storageId: config.id,
              checksum: parsedBackup.checksum,
              backupType: backupData.backupType,
              trigger: backupData.trigger,
              deviceId: backupData.deviceId,
              dataChecksum: backupData.dataChecksum
            })
          } catch (error) {
            this.debugLog('解析 iCloud 备份文件失败:', file.name, error)
          }
        }
      }

      this.debugLog('iCloud 备份列表加载完成，数量:', backups.length)

      return backups.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch (error) {
      this.debugLog('列出 iCloud 备份失败:', error)
      throw error
    }
  }

  private async getICloudSyncManifest(config: any): Promise<CloudSyncManifest> {
    const icloudCheck = await this.isICloudAvailable()
    if (!icloudCheck.available) {
      throw new Error(icloudCheck.reason || 'iCloud 不可用')
    }

    const dirPath = config.path || CLOUD_BACKUP_DIR
    await this.ensureICloudDirectory(dirPath)

    return readCloudSyncManifestWithFallback({
      readPrimary: () => this.readICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_FILE),
      readBackup: () => this.readICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_BACKUP_FILE),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    })
  }

  private async readICloudSyncManifestFile(dirPath: string, fileName: string): Promise<CloudSyncManifest> {
    const result = await Filesystem.readFile({
      path: `${dirPath}/${fileName}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })

    return assertValidCloudSyncManifest(JSON.parse(result.data as string))
  }

  private async saveICloudSyncManifest(
    config: any,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions
  ): Promise<void> {
    const icloudCheck = await this.isICloudAvailable()
    if (!icloudCheck.available) {
      throw new Error(icloudCheck.reason || 'iCloud 不可用')
    }

    const dirPath = config.path || CLOUD_BACKUP_DIR
    await this.ensureICloudDirectory(dirPath)

    if (options.expectedRevision === undefined) {
      await this.writeICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_BACKUP_FILE, manifest)
      await this.writeICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_FILE, manifest)
      return
    }

    const currentManifest = await readCloudSyncManifestWithFallback({
      readPrimary: () => this.readICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_FILE),
      readBackup: () => this.readICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_BACKUP_FILE),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    })
    this.assertExpectedCloudSyncRevision(currentManifest, options.expectedRevision)

    await this.writeICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_FILE, manifest)
    await this.writeICloudSyncManifestFile(dirPath, CLOUD_SYNC_MANIFEST_BACKUP_FILE, manifest)
  }

  private async writeICloudSyncManifestFile(
    dirPath: string,
    fileName: string,
    manifest: CloudSyncManifest
  ): Promise<void> {
    await Filesystem.writeFile({
      path: `${dirPath}/${fileName}`,
      data: JSON.stringify(manifest, null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })
  }

  private async listICloudSyncSnapshots(config: any): Promise<CloudSyncRemoteSnapshotInfo[]> {
    const icloudCheck = await this.isICloudAvailable()
    if (!icloudCheck.available) {
      throw new Error(icloudCheck.reason || 'iCloud 不可用')
    }

    const dirPath = config.path || CLOUD_BACKUP_DIR
    const snapshotsDir = this.getICloudSyncSnapshotsDirectoryPath(dirPath)
    try {
      const result = await Filesystem.readdir({
        path: snapshotsDir,
        directory: Directory.Documents
      })

      return (result.files || [])
        .map((file: any) => typeof file === 'string' ? file : file.name)
        .filter((name: unknown): name is string => typeof name === 'string')
        .map(name => {
          const revision = getCloudSyncSnapshotRevisionFromFileName(name)
          if (!revision) {
            return null
          }

          return {
            revision,
            path: this.getICloudSyncSnapshotPath(dirPath, revision)
          }
        })
        .filter((info): info is CloudSyncRemoteSnapshotInfo => !!info)
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return []
      }
      throw error
    }
  }

  private async readICloudSyncSnapshot(
    config: any,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    const dirPath = config.path || CLOUD_BACKUP_DIR
    const snapshotInfo = this.normalizeCloudSyncSnapshotReference(
      snapshot,
      revision => this.getICloudSyncSnapshotPath(dirPath, revision)
    )
    const result = await Filesystem.readFile({
      path: snapshotInfo.path,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })

    return assertValidCloudSyncSnapshotFile(JSON.parse(result.data as string))
  }

  private async saveICloudSyncSnapshot(config: any, snapshot: CloudSyncSnapshot): Promise<void> {
    const icloudCheck = await this.isICloudAvailable()
    if (!icloudCheck.available) {
      throw new Error(icloudCheck.reason || 'iCloud 不可用')
    }

    const dirPath = config.path || CLOUD_BACKUP_DIR
    const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot)
    const snapshotPath = this.getICloudSyncSnapshotPath(dirPath, normalizedSnapshot.revision)
    await this.ensureICloudDirectory(this.getICloudSyncSnapshotsDirectoryPath(dirPath))

    try {
      const existingSnapshot = await this.readICloudSyncSnapshot(config, {
        revision: normalizedSnapshot.revision,
        path: snapshotPath
      })
      if (this.isSameCloudSyncSnapshot(existingSnapshot, normalizedSnapshot)) {
        return
      }
      throw new Error(`云同步快照 ${normalizedSnapshot.revision} 已存在但内容不一致`)
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error
      }
    }

    await Filesystem.writeFile({
      path: snapshotPath,
      data: JSON.stringify(createCloudSyncSnapshotFile(normalizedSnapshot), null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })
  }

  private async ensureICloudDirectory(dirPath: string): Promise<void> {
    try {
      await Filesystem.stat({
        path: dirPath,
        directory: Directory.Documents
      })
    } catch {
      await Filesystem.mkdir({
        path: dirPath,
        directory: Directory.Documents,
        recursive: true
      })
    }
  }

  /**
   * 解析 WebDAV PROPFIND 响应
   * @param xmlData XML 响应数据
   * @param baseUrl WebDAV 服务器基础 URL
   */
  private parseWebDAVResponse(xmlData: string, baseUrl: string): CloudFileInfo[] {
    const files: CloudFileInfo[] = []

    try {
      // 从 baseUrl 中提取路径前缀，用于后续路径标准化
      let baseUrlPath = ''
      try {
        const urlObj = new URL(baseUrl)
        baseUrlPath = urlObj.pathname
        // 移除末尾的斜杠
        if (baseUrlPath.endsWith('/')) {
          baseUrlPath = baseUrlPath.slice(0, -1)
        }
      } catch (e) {
        this.debugLog('解析 baseUrl 失败:', baseUrl)
      }

      this.debugLog('baseUrl:', baseUrl)
      this.debugLog('baseUrl 路径前缀:', baseUrlPath)

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

      this.debugLog('WebDAV 响应数量:', responses.length)

      for (const response of Array.from(responses)) {
        // 获取 href
        const hrefElement = response.getElementsByTagName('d:href')[0] ||
          response.getElementsByTagName('D:href')[0] ||
          response.getElementsByTagName('href')[0]

        if (!hrefElement) continue

        const href = hrefElement.textContent || ''
        this.debugLog('处理文件 href:', href)

        // 获取 propstat
        const propstat = response.getElementsByTagName('d:propstat')[0] ||
          response.getElementsByTagName('D:propstat')[0] ||
          response.getElementsByTagName('propstat')[0]

        if (!propstat) continue

        // 获取 prop
        const prop = propstat.getElementsByTagName('d:prop')[0] ||
          propstat.getElementsByTagName('D:prop')[0] ||
          propstat.getElementsByTagName('prop')[0]

        if (!prop) continue

        // 检查是否是目录
        const resourcetype = prop.getElementsByTagName('d:resourcetype')[0] ||
          prop.getElementsByTagName('D:resourcetype')[0] ||
          prop.getElementsByTagName('resourcetype')[0]

        let isDirectory = false
        if (resourcetype) {
          const collection = resourcetype.getElementsByTagName('d:collection')[0] ||
            resourcetype.getElementsByTagName('D:collection')[0] ||
            resourcetype.getElementsByTagName('collection')[0]
          isDirectory = !!collection
        }

        // 标准化路径：提取相对于 baseUrl 的路径
        let normalizedPath = href

        // 如果是完整 URL，提取路径部分
        if (href.startsWith('http://') || href.startsWith('https://')) {
          try {
            const hrefUrl = new URL(href)
            normalizedPath = hrefUrl.pathname
          } catch (e) {
            this.debugLog('解析 href URL 失败:', href)
          }
        }

        // 确保路径以 / 开头
        if (!normalizedPath.startsWith('/')) {
          normalizedPath = '/' + normalizedPath
        }

        // URL 解码
        normalizedPath = decodeURIComponent(normalizedPath)

        this.debugLog('解码后的路径:', normalizedPath)
        this.debugLog('baseUrlPath:', baseUrlPath)

        // 移除 baseUrl 的路径前缀，得到相对路径
        if (baseUrlPath && normalizedPath.startsWith(baseUrlPath)) {
          normalizedPath = normalizedPath.substring(baseUrlPath.length)
          this.debugLog('移除前缀后的路径:', normalizedPath)
          // 确保以 / 开头
          if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath
          }
        }

        // 提取文件名
        const name = normalizedPath.split('/').filter(Boolean).pop() || ''

        // 获取文件大小
        const contentlength = prop.getElementsByTagName('d:getcontentlength')[0] ||
          prop.getElementsByTagName('D:getcontentlength')[0] ||
          prop.getElementsByTagName('getcontentlength')[0] ||
          prop.getElementsByTagName('lp1:getcontentlength')[0] ||
          prop.getElementsByTagName('lp2:getcontentlength')[0]

        let size = 0
        if (contentlength && contentlength.textContent) {
          size = parseInt(contentlength.textContent, 10)
          this.debugLog('从 XML 解析文件大小:', name, size)
        }

        // 获取修改时间
        const lastmodified = prop.getElementsByTagName('d:getlastmodified')[0] ||
          prop.getElementsByTagName('D:getlastmodified')[0] ||
          prop.getElementsByTagName('getlastmodified')[0]
        const modifiedAt = lastmodified ? (lastmodified.textContent || '') : new Date().toISOString()

        // 跳过目录本身和空文件名
        if (name && !isDirectory && normalizedPath !== '/' && normalizedPath !== '') {
          this.debugLog('添加文件:', name, 'path:', normalizedPath, 'size:', size)
          files.push({
            name,
            path: normalizedPath, // 使用标准化的相对路径
            size,
            isDirectory,
            modifiedAt
          })
        }
      }

      this.debugLog('解析到的文件数量:', files.length)
    } catch (error) {
      this.debugLog('解析 WebDAV 响应失败:', error)
    }

    return files
  }

  /**
   * 创建云端备份
   */
  async createCloudBackup(
    storageId: string,
    data: any,
    options?: string | CloudBackupCreateOptions
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
      // 使用与桌面端一致的命名格式：backup-YYYY-MM-DD-xxxxxxxx
      const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`

      const normalizedOptions = typeof options === 'string' ? { description: options } : options
      const backupData = createBackupPayload({
        id: backupId,
        name: backupName,
        description: normalizedOptions?.description || '移动端云端备份',
        createdAt: timestamp,
        data,
        backupType: normalizedOptions?.backupType,
        trigger: normalizedOptions?.trigger,
        deviceId: normalizedOptions?.deviceId,
        dataChecksum: normalizedOptions?.dataChecksum
      })

      const jsonString = JSON.stringify(backupData, null, 2)
      // 文件名使用完整的 backup-{id}.json 格式
      const fileName = `backup-${backupId}.json`

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
      this.debugLog('创建云端备份失败:', error)
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
      this.debugLog('创建 WebDAV 备份，文件名:', fileName)

      await this.ensureWebDAVBackupDirectory(config)

      const cloudPath = getCloudBackupFilePath(fileName)
      const fileUrl = this.buildWebDAVUrlFromCloudPath(config, cloudPath)
      this.debugLog('上传到 URL:', fileUrl)
      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'PUT',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Content-Type': 'application/json'
        },
        data: jsonString
      })

      this.debugLog('上传响应状态:', response.status)
      if (response.status >= 200 && response.status < 300) {
        const backupInfo: CloudBackupInfo = {
          id: backupData.id,
          name: backupData.name,
          description: backupData.description,
          createdAt: backupData.createdAt,
          size: new Blob([jsonString]).size,
          cloudPath,
          storageId: config.id,
          checksum: backupData.checksum,
          backupType: backupData.backupType,
          trigger: backupData.trigger,
          deviceId: backupData.deviceId,
          dataChecksum: backupData.dataChecksum
        }

        this.debugLog('备份创建成功:', backupInfo)

        return {
          success: true,
          message: '云端备份创建成功',
          backupInfo
        }
      }

      const uploadErrMsg = response.status === 401 || response.status === 403
        ? '认证失败，请检查用户名和密码'
        : response.status === 404 || response.status === 409
          ? '目标目录不存在，请确认 WebDAV 服务器路径配置正确'
          : `上传备份失败（HTTP ${response.status}）`
      return {
        success: false,
        message: uploadErrMsg,
        error: uploadErrMsg
      }
    } catch (error) {
      this.debugLog('创建 WebDAV 备份失败:', error)
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

      const dirPath = config.path || CLOUD_BACKUP_DIR

      // 检查目录是否存在
      let dirExists = false
      try {
        await Filesystem.stat({
          path: dirPath,
          directory: Directory.Documents
        })
        dirExists = true
        this.debugLog('iCloud 目录已存在:', dirPath)
      } catch (error) {
        this.debugLog('iCloud 目录不存在，需要创建:', dirPath)
      }

      // 只在目录不存在时创建
      if (!dirExists) {
        try {
          await Filesystem.mkdir({
            path: dirPath,
            directory: Directory.Documents,
            recursive: true
          })
          this.debugLog('iCloud 目录创建成功:', dirPath)
        } catch (error: any) {
          this.debugLog('创建 iCloud 目录失败:', error)
          return {
            success: false,
            message: '无法创建 iCloud 目录',
            error: error.message || String(error)
          }
        }
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
        storageId: config.id,
        checksum: backupData.checksum,
        backupType: backupData.backupType,
        trigger: backupData.trigger,
        deviceId: backupData.deviceId,
        dataChecksum: backupData.dataChecksum
      }

      return {
        success: true,
        message: '云端备份创建成功',
        backupInfo
      }
    } catch (error) {
      this.debugLog('创建 iCloud 备份失败:', error)
      return {
        success: false,
        message: '创建 iCloud 备份失败',
        error: error instanceof Error ? error.message : String(error)
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
      this.debugLog('恢复云端备份失败:', error)
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
      const fileUrl = this.buildWebDAVUrlFromCloudPath(config, backup.cloudPath)

      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'GET',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
        }
      })

      if (response.status !== 200) {
        const statusMsg = response.status === 401 || response.status === 403
          ? '认证失败，请检查用户名和密码'
          : response.status === 404
            ? '备份文件不存在，请刷新列表后重试'
            : `下载备份失败（HTTP ${response.status}）`
        return {
          success: false,
          message: statusMsg,
          error: statusMsg
        }
      }

      // CapacitorHttp 可能返回字符串或对象
      let backupData
      if (typeof response.data === 'string') {
        backupData = parseBackupPayload(JSON.parse(response.data)).payload
      } else if (typeof response.data === 'object') {
        backupData = parseBackupPayload(response.data).payload
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
        backupInfo: backup,
        data: backupData.data
      }
    } catch (error) {
      this.debugLog('恢复 WebDAV 备份失败:', error)
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

      const backupData = parseBackupPayload(JSON.parse(result.data as string)).payload

      return {
        success: true,
        message: '云端备份恢复成功',
        backupInfo: backup,
        data: backupData.data
      }
    } catch (error) {
      this.debugLog('恢复 iCloud 备份失败:', error)
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
      this.debugLog('删除云端备份失败:', error)
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
      const fileUrl = this.buildWebDAVUrlFromCloudPath(config, backup.cloudPath)

      const response = await CapacitorHttp.request({
        url: fileUrl,
        method: 'DELETE',
        ...this.getWebDAVRequestTimeoutOptions(),
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

      const deleteErrMsg = response.status === 401 || response.status === 403
        ? '认证失败，请检查用户名和密码'
        : response.status === 404
          ? '备份文件不存在，可能已被删除'
          : `删除失败（HTTP ${response.status}）`
      return {
        success: false,
        error: deleteErrMsg
      }
    } catch (error) {
      this.debugLog('删除 WebDAV 备份失败:', error)
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
      this.debugLog('删除 iCloud 备份失败:', error)
      throw error
    }
  }

  /**
   * 规范化 WebDAV base URL，去掉末尾斜杠
   */
  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '')
  }

  private getWebDAVBackupBaseUrl(config: any): string {
    const baseUrl = this.normalizeBaseUrl(config.url)
    return this.isWebDAVUrlAtBackupDir(baseUrl)
      ? baseUrl
      : this.joinUrlPath(baseUrl, CLOUD_BACKUP_DIR)
  }

  private isWebDAVUrlAtBackupDir(url: string): boolean {
    try {
      const parsed = new URL(this.normalizeBaseUrl(url))
      const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
      return lastSegment === CLOUD_BACKUP_DIR
    } catch {
      return false
    }
  }

  private buildWebDAVUrlFromCloudPath(config: any, cloudPath: string): string {
    const normalizedPath = normalizeCloudPath(cloudPath)
    const backupDirPath = getCloudBackupDirectoryPath()

    if (this.isWebDAVUrlAtBackupDir(config.url) && normalizedPath.startsWith(`${backupDirPath}/`)) {
      return this.joinUrlPath(this.normalizeBaseUrl(config.url), normalizedPath.slice(backupDirPath.length))
    }

    return this.joinUrlPath(this.normalizeBaseUrl(config.url), normalizedPath)
  }

  private getICloudSyncSnapshotsDirectoryPath(dirPath: string): string {
    return joinCloudPath(dirPath, getCloudSyncSnapshotsDirectoryRelativePath()).replace(/^\/+/, '')
  }

  private getICloudSyncSnapshotPath(dirPath: string, revision: string): string {
    return joinCloudPath(
      dirPath,
      getCloudSyncSnapshotsDirectoryRelativePath(),
      getCloudSyncSnapshotFileName(revision)
    ).replace(/^\/+/, '')
  }

  private normalizeCloudSyncV2ObjectPath(path: string): string {
    if (typeof path !== 'string' || !path || path.length > 2048 || path.trim() !== path ||
        /[%\\\0\r\n?#]/.test(path) || /^[a-zA-Z]:/.test(path)) {
      throw new Error('sync-v2 对象路径无效')
    }
    const relative = path.startsWith('/') ? path.slice(1) : path
    if (!relative || relative.startsWith('/') || relative.endsWith('/')) {
      throw new Error('sync-v2 对象路径必须是规范路径')
    }
    const segments = relative.split('/')
    if (segments.some(segment => !segment || segment === '.' || segment === '..') ||
        segments[0] !== CLOUD_BACKUP_DIR || segments[1] !== 'sync-v2') {
      throw new Error('sync-v2 对象路径超出允许的命名空间')
    }
    return `/${segments.join('/')}`
  }

  private assertValidCloudSyncV2WriteOptions(options: CloudSyncV2ObjectWriteOptions): void {
    if (options.ifAbsent && options.expectedEtag !== undefined) {
      throw new Error('ifAbsent 与 expectedEtag 不能同时使用')
    }
    if (options.expectedEtag !== undefined && !String(options.expectedEtag).trim()) {
      throw new Error('expectedEtag 不能为空')
    }
  }

  private async listWebDAVSyncV2Objects(
    config: any,
    prefix: string
  ): Promise<CloudSyncV2StoredObjectInfo[]> {
    const root = getCloudSyncV2DirectoryPath()
    const relative = prefix === root ? '' : prefix.slice(`${root}/`.length)
    const topLevel = relative.split('/')[0]
    const directories = prefix === root
      ? [root, ...CLOUD_SYNC_V2_ARTIFACT_DIRECTORIES.map(name => `${root}/${name}`)]
      : CLOUD_SYNC_V2_ARTIFACT_DIRECTORIES.includes(topLevel as any)
        ? [`${root}/${topLevel}`]
        : [root]
    const objects = new Map<string, CloudSyncV2StoredObjectInfo>()

    for (const directory of directories) {
      const entries = await this.listWebDAVSyncV2Directory(config, directory)
      for (const entry of entries) {
        if (!entry.isDirectory && entry.path.startsWith(prefix)) {
          objects.set(entry.path, {
            path: entry.path,
            etag: entry.etag,
            byteLength: entry.byteLength
          })
        }
      }
    }
    return [...objects.values()].sort((left, right) => left.path.localeCompare(right.path))
  }

  private async listWebDAVSyncV2Directory(
    config: any,
    directory: string
  ): Promise<(CloudSyncV2StoredObjectInfo & { isDirectory: boolean })[]> {
    const url = this.buildWebDAVUrlFromCloudPath(config, directory)
    let status: number
    let xmlData: string
    if (Capacitor.getPlatform() === 'android') {
      const response = await WebDav.propfind({
        url,
        username: config.username,
        password: config.password,
        depth: 1,
        ...this.getWebDAVRequestTimeoutOptions()
      })
      status = response.status
      xmlData = response.body
    } else {
      const response = await CapacitorHttp.request({
        url,
        method: 'PROPFIND',
        ...this.getWebDAVRequestTimeoutOptions(),
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`),
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      })
      status = response.status
      xmlData = typeof response.data === 'string' ? response.data : ''
    }
    if (status === 404) {
      return []
    }
    if (status !== 207) {
      throw new Error(`列出 sync-v2 对象失败（HTTP ${status}）`)
    }
    return this.parseWebDAVSyncV2DirectoryResponse(xmlData, url, directory)
  }

  private parseWebDAVSyncV2DirectoryResponse(
    xmlData: string,
    requestUrl: string,
    directory: string
  ): (CloudSyncV2StoredObjectInfo & { isDirectory: boolean })[] {
    const result: (CloudSyncV2StoredObjectInfo & { isDirectory: boolean })[] = []
    const document = new DOMParser().parseFromString(xmlData, 'text/xml')
    const responses = Array.from(document.getElementsByTagNameNS('*', 'response'))
    const requestPath = new URL(requestUrl).pathname.replace(/\/+$/, '')

    for (const response of responses) {
      const href = response.getElementsByTagNameNS('*', 'href')[0]?.textContent || ''
      let hrefPath: string
      try {
        hrefPath = new URL(href, requestUrl).pathname.replace(/\/+$/, '')
      } catch {
        continue
      }
      if (!hrefPath || hrefPath === requestPath) {
        continue
      }
      let name: string
      try {
        name = decodeURIComponent(hrefPath.split('/').filter(Boolean).pop() || '')
      } catch {
        continue
      }
      if (!name || name === '.' || name === '..' || /[/\\\0\r\n]/.test(name)) {
        continue
      }
      let canonicalPath: string
      try {
        canonicalPath = this.normalizeCloudSyncV2ObjectPath(`${directory}/${name}`)
      } catch {
        continue
      }
      const resourceType = response.getElementsByTagNameNS('*', 'resourcetype')[0]
      const isDirectory = !!resourceType?.getElementsByTagNameNS('*', 'collection').length
      const lengthText = response.getElementsByTagNameNS('*', 'getcontentlength')[0]?.textContent
      const byteLength = lengthText && /^\d+$/.test(lengthText.trim())
        ? Number(lengthText.trim())
        : undefined
      const etag = response.getElementsByTagNameNS('*', 'getetag')[0]?.textContent?.trim() || undefined
      result.push({ path: canonicalPath, etag, byteLength, isDirectory })
    }
    return result
  }

  private getICloudSyncV2ObjectPath(config: any, canonicalPath: string): string {
    const root = getCloudBackupDirectoryPath()
    const relative = canonicalPath === root ? '' : canonicalPath.slice(`${root}/`.length)
    return joinCloudPath(config.path || CLOUD_BACKUP_DIR, relative).replace(/^\/+/, '')
  }

  private async listICloudSyncV2Objects(
    config: any,
    prefix: string
  ): Promise<CloudSyncV2StoredObjectInfo[]> {
    const root = getCloudSyncV2DirectoryPath()
    const directories = [root, ...CLOUD_SYNC_V2_ARTIFACT_DIRECTORIES.map(name => `${root}/${name}`)]
    const result: CloudSyncV2StoredObjectInfo[] = []

    for (const directory of directories) {
      const localDirectory = this.getICloudSyncV2ObjectPath(config, directory)
      let files: any[]
      try {
        files = (await Filesystem.readdir({
          path: localDirectory,
          directory: Directory.Documents
        })).files || []
      } catch (error) {
        if (this.isNotFoundError(error)) {
          continue
        }
        throw error
      }

      for (const entry of files) {
        const name = typeof entry === 'string' ? entry : entry?.name
        if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\%\0\r\n]/.test(name)) {
          continue
        }
        const localPath = `${localDirectory}/${name}`
        let type = typeof entry === 'object' ? entry.type : undefined
        let size = typeof entry === 'object' && Number.isFinite(entry.size) ? entry.size : undefined
        if (type !== 'file' && type !== 'directory') {
          try {
            const stat = await Filesystem.stat({ path: localPath, directory: Directory.Documents })
            type = stat.type
            size = Number.isFinite(stat.size) ? stat.size : size
          } catch (error) {
            if (this.isNotFoundError(error)) {
              continue
            }
            throw error
          }
        }
        if (type !== 'file') {
          continue
        }
        let canonicalPath: string
        try {
          canonicalPath = this.normalizeCloudSyncV2ObjectPath(`${directory}/${name}`)
        } catch {
          continue
        }
        if (canonicalPath.startsWith(prefix)) {
          result.push({ path: canonicalPath, byteLength: size })
        }
      }
    }
    return result.sort((left, right) => left.path.localeCompare(right.path))
  }

  private async assertICloudAvailable(): Promise<void> {
    const check = await this.isICloudAvailable()
    if (!check.available) {
      throw new Error(check.reason || 'iCloud 不可用')
    }
  }

  private encodeBase64(data: Uint8Array): string {
    const chunks: string[] = []
    for (let offset = 0; offset < data.byteLength; offset += 0x8000) {
      chunks.push(String.fromCharCode(...data.subarray(offset, offset + 0x8000)))
    }
    return btoa(chunks.join(''))
  }

  private async decodeBinaryResponse(input: unknown): Promise<Uint8Array> {
    if (input instanceof Blob) {
      return new Uint8Array(await input.arrayBuffer())
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input)
    }
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
    }
    if (typeof input !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
      throw new Error('云存储返回了无效的 sync-v2 二进制内容')
    }
    const binary = atob(input)
    const data = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      data[index] = binary.charCodeAt(index)
    }
    return data
  }

  private joinUrlPath(baseUrl: string, ...parts: string[]): string {
    const suffix = parts
      .flatMap(part => part.split('/'))
      .filter(Boolean)
      .map(part => encodeURIComponent(decodeURIComponent(part)))
      .join('/')

    return suffix ? `${this.normalizeBaseUrl(baseUrl)}/${suffix}` : this.normalizeBaseUrl(baseUrl)
  }

  private async ensureWebDAVBackupDirectory(config: any): Promise<void> {
    const response = await this.sendWebDAVRequest(config, this.getWebDAVBackupBaseUrl(config), 'MKCOL')
    if ([200, 201, 204, 405, 409].includes(response.status)) {
      return
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('认证失败，请检查用户名和密码')
    }
    throw new Error(`创建 WebDAV 备份目录失败（HTTP ${response.status}）`)
  }

  private async ensureWebDAVDirectoryPath(config: any, cloudPath: string): Promise<void> {
    const parts = normalizeCloudPath(cloudPath).split('/').filter(Boolean)
    let currentPath = ''

    for (const part of parts) {
      currentPath = joinCloudPath(currentPath, part)
      const response = await this.sendWebDAVRequest(
        config,
        this.buildWebDAVUrlFromCloudPath(config, currentPath),
        'MKCOL'
      )
      if ([200, 201, 204, 405, 409].includes(response.status)) {
        continue
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('认证失败，请检查用户名和密码')
      }
      throw new Error(`创建 WebDAV 目录失败（HTTP ${response.status}）`)
    }
  }

  private async sendWebDAVRequest(
    config: any,
    url: string,
    method: string,
    data?: string,
    contentType = 'application/json'
  ): Promise<{ status: number; data?: any }> {
    if (Capacitor.getPlatform() === 'android' && method === 'MKCOL') {
      const response = await WebDav.request({
        url,
        method,
        username: config.username,
        password: config.password,
        body: data,
        contentType,
        ...this.getWebDAVRequestTimeoutOptions()
      })
      return { status: response.status, data: response.body }
    }

    return CapacitorHttp.request({
      url,
      method,
      ...this.getWebDAVRequestTimeoutOptions(),
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
      },
      data
    })
  }

  private getWebDAVRequestTimeoutOptions(): { connectTimeout: number; readTimeout: number } {
    return {
      connectTimeout: WEBDAV_REQUEST_TIMEOUT_MS,
      readTimeout: WEBDAV_REQUEST_TIMEOUT_MS
    }
  }

  private debugLog(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return
    }
    console.debug(...args)
  }

  private isDebugLoggingEnabled(): boolean {
    try {
      return typeof localStorage !== 'undefined' &&
        localStorage.getItem(CLOUD_BACKUP_DEBUG_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  }

  private dedupeBackups(backups: CloudBackupInfo[]): CloudBackupInfo[] {
    const seen = new Set<string>()
    return backups.filter(backup => {
      const key = backup.id || backup.cloudPath || backup.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private isNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /404|not\s*found|no such file|does not exist|不存在|未找到/i.test(message)
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private assertExpectedCloudSyncRevision(
    manifest: CloudSyncManifest,
    expectedRevision: string | null | undefined
  ): void {
    if (doesCloudSyncManifestMatchExpectedRevision(manifest, expectedRevision)) {
      return
    }

    throw createCloudSyncManifestRevisionConflictError(
      expectedRevision,
      getCloudSyncManifestRevision(manifest)
    )
  }

  private normalizeCloudSyncSnapshotReference(
    snapshot: CloudSyncRemoteSnapshotInfo | string,
    pathForRevision: (revision: string) => string
  ): CloudSyncRemoteSnapshotInfo {
    if (typeof snapshot === 'string') {
      return {
        revision: snapshot,
        path: pathForRevision(snapshot)
      }
    }

    return {
      ...snapshot,
      path: snapshot.path || pathForRevision(snapshot.revision)
    }
  }

  private isSameCloudSyncSnapshot(left: CloudSyncSnapshot, right: CloudSyncSnapshot): boolean {
    return left.revision === right.revision &&
      left.dataChecksum === right.dataChecksum &&
      JSON.stringify(left.data) === JSON.stringify(right.data)
  }

  private isCloudSyncRevisionConflictError(error: unknown): boolean {
    return /manifest 已被其他设备更新|Precondition|412|If-Match|If-None-Match|已被其他设备更新/i
      .test(this.formatErrorMessage(error))
  }

  private async tryReadCloudSyncManifestRevision(storageId: string): Promise<string | null> {
    try {
      return getCloudSyncManifestRevision(await this.getCloudSyncManifest(storageId))
    } catch {
      return null
    }
  }

  private getResponseHeader(response: any, headerName: string): string | undefined {
    const headers = response?.headers
    if (!headers || typeof headers !== 'object') {
      return undefined
    }

    const target = headerName.toLowerCase()
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target && typeof value === 'string') {
        return value
      }
    }
    return undefined
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }
}

export const mobileCloudBackupService = MobileCloudBackupService.getInstance()
