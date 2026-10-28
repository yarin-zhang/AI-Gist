/**
 * #417：桌面版测试 WebDAV 连接失败时，主进程带回服务器的原话（WebDAVProvider.checkConnection），
 * 设置页用同一套 getCloudStorageConnectionDiagnosis 归类，不再只能显示通用说明。
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '~/i18n'
import { getCloudStorageConnectionDiagnosis } from '~/lib/services/cloud-sync.service'

const t = (key: string) => String(i18n.global.t(key))

afterEach(() => {
  i18n.global.locale.value = 'zh-CN' as never
})

describe('desktop WebDAV connection test diagnosis', () => {
  it.each([
    ['Invalid response: 401 Unauthorized', 'auth'],
    ['request to http://127.0.0.1:5005/dav/AI-Gist-Backup/ failed, reason: connect ECONNREFUSED 127.0.0.1:5005', 'refused'],
    ['request to https://nas.example.com/dav/ failed, reason: getaddrinfo ENOTFOUND nas.example.com', 'hostNotFound'],
    ['WebDAV 客户端初始化失败: Invalid URL', 'invalidUrl'],
  ])('classifies the reason the main process now returns: %s', (error, kind) => {
    for (const locale of ['zh-CN', 'en-US', 'it-IT']) {
      i18n.global.locale.value = locale as never
      const diagnosis = getCloudStorageConnectionDiagnosis(error)
      expect(diagnosis.title).toBe(t(`dataSync.connectionDiagnosis.${kind}.title`))
      expect(diagnosis.detail).toBe(error)
    }
  })

  it('without a reason only the generic explanation is possible (what desktop used to show)', () => {
    expect(getCloudStorageConnectionDiagnosis(undefined).title).toBe(t('dataSync.connectionDiagnosis.generic.title'))
  })

  it('the main process hands the reason through instead of a bare success flag', () => {
    const manager = readFileSync('src/main/cloud/cloud-backup-manager.ts', 'utf8')
    const provider = readFileSync('src/main/cloud/webdav-provider.ts', 'utf8')
    expect(manager).toContain('return await this.checkProviderConnection(provider);')
    expect(manager).toMatch(/if \(typeof provider\.checkConnection === 'function'\) \{\s*return provider\.checkConnection\(\);/)
    expect(provider).toContain("return { success: false, error: this.describeConnectionError(error) };")
  })
})
