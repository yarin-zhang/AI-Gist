/**
 * 备份、恢复、导入导出和数据管理的提示只说用户能处理的事：
 * 连不上存储说原因；用户处理不了的原因（表名、记录 ID、内部状态、HTTP 原文）只写日志。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '~/i18n'
import { PlatformDetector } from '@shared/platform'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { DataManagementAPI } from '~/lib/api/data-management.api'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { mobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import {
  LocalBackupService,
  isLocalDataUnchangedAfterFailedRestore,
  type LocalBackupInfo
} from '~/lib/services/local-backup.service'
import { describeCloudBackupFailure } from '~/lib/utils/cloud-backup-feedback'
import { isShareDismissed } from '~/lib/utils/share-dismissed'

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const locale = (code: string) => JSON.parse(read(`src/renderer/i18n/locales/${code}.json`))
const lookup = (messages: unknown, key: string) =>
  key.split('.').reduce<any>((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages)
const t = (key: string, named: Record<string, unknown> = {}) => String(i18n.global.t(key, named))

afterEach(() => {
  i18n.global.locale.value = 'zh-CN' as never
})

describe('describeCloudBackupFailure', () => {
  it('names the connection problem the user can fix', () => {
    expect(describeCloudBackupFailure('创建云端备份失败', '列出 WebDAV 备份失败（HTTP 401）'))
      .toBe('创建云端备份失败：用户名或密码不对')
    expect(describeCloudBackupFailure('删除云端备份失败', new Error('getaddrinfo ENOTFOUND dav.example.com')))
      .toBe('删除云端备份失败：找不到这个服务器')
  })

  it('adds what to do when there is room for it (desktop toasts)', () => {
    const text = describeCloudBackupFailure('创建云端备份失败', 'Invalid response: 401 Unauthorized', { detailed: true })
    expect(text).toBe(`创建云端备份失败：用户名或密码不对。${t('dataSync.connectionDiagnosis.auth.message')}`)
  })

  it.each([
    '没有找到主窗口，无法访问数据库',
    '获取数据失败: 数据库API未初始化',
    '备份删除路径超出允许的命名空间',
    '备份文件缺少 data 字段',
    'prompts uuid:3f2a 的 categoryId 关系无法安全解析',
    '数据库修复后仍有问题，缺失的表: prompts, categories'
  ])('falls back to the plain action for causes the user cannot fix: %s', raw => {
    const text = describeCloudBackupFailure('恢复云端备份失败', raw, { otherwise: '恢复没有完成，本机数据没有变化。' })
    expect(text).toBe('恢复没有完成，本机数据没有变化。')
  })

  it('never reads connection advice into a failure that happened on this device', () => {
    // IndexedDB 的报错里也会出现 aborted / not found，不能说成服务器没响应或路径不对
    for (const raw of ['The transaction was aborted, so the request cannot be fulfilled.', 'One of the specified object stores was not found.']) {
      expect(describeCloudBackupFailure('恢复云端备份失败', raw, { localFailure: true })).toBe('恢复云端备份失败')
    }
  })

  it('follows the interface language', () => {
    i18n.global.locale.value = 'en-US' as never
    const text = describeCloudBackupFailure(t('dataBackup.createCloudBackupFailed'), 'Invalid response: 401 Unauthorized')
    expect(text).toBe(`${t('dataBackup.createCloudBackupFailed')}: ${t('dataSync.connectionDiagnosis.auth.title')}`)
    expect(text).not.toMatch(/[一-鿿]/)
  })
})

describe('restore failures keep the friendly explanation and say the data is unchanged', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('local backup restore prefers the restore service explanation over the raw error', async () => {
    const payload = { id: 'b1', name: 'b1', createdAt: '2026-10-01T00:00:00.000Z', data: { categories: [] } }
    const backup: LocalBackupInfo = { id: 'b1', name: 'b1', description: '', createdAt: payload.createdAt, size: 1, payload }
    const service = new LocalBackupService({
      repository: { list: async () => [backup], write: vi.fn(), delete: vi.fn() },
      database: { exportAllDataForBackup: vi.fn() }
    })
    vi.spyOn(dataRestoreService, 'restore').mockResolvedValue({
      success: false,
      atomic: true,
      phase: 'prepare',
      error: '写入 prompts 记录失败',
      message: '恢复前没能备份当前数据，已取消恢复，本机数据没有变化'
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const failure = await service.restore('b1').catch(error => error)

    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe('恢复前没能备份当前数据，已取消恢复，本机数据没有变化')
    expect(isLocalDataUnchangedAfterFailedRestore(failure)).toBe(true)
    expect(warn).toHaveBeenCalledWith('恢复本地备份没有完成:', '写入 prompts 记录失败')
  })

  it('a missing backup is also reported as unchanged; unrelated errors are not', async () => {
    const service = new LocalBackupService({
      repository: { list: async () => [], write: vi.fn(), delete: vi.fn() },
      database: { exportAllDataForBackup: vi.fn() }
    })
    expect(isLocalDataUnchangedAfterFailedRestore(await service.restore('missing').catch(error => error))).toBe(true)
    expect(isLocalDataUnchangedAfterFailedRestore(new Error('anything'))).toBe(false)
    expect(isLocalDataUnchangedAfterFailedRestore(undefined)).toBe(false)
  })

  it('mobile cloud restore returns the friendly message and marks the failure as local', async () => {
    vi.spyOn(PlatformDetector, 'isElectron').mockReturnValue(false)
    vi.spyOn(PlatformDetector, 'isWeb').mockReturnValue(false)
    vi.spyOn(PlatformDetector, 'isMobile').mockReturnValue(true)
    vi.spyOn(mobileCloudBackupService, 'restoreCloudBackup').mockResolvedValue({
      success: true,
      message: 'downloaded',
      data: { categories: [] }
    } as any)
    vi.spyOn(dataRestoreService, 'restore').mockResolvedValue({
      success: false,
      atomic: true,
      phase: 'write',
      error: 'The transaction was aborted, so the request cannot be fulfilled.',
      message: '数据替换失败'
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result).toMatchObject({ success: false, error: '数据替换失败', localFailure: true })
    expect(describeCloudBackupFailure('恢复云端备份失败', result.error, {
      localFailure: result.localFailure,
      otherwise: t('dataBackup.restoreFailedUnchanged')
    })).toBe('恢复没有完成，本机数据没有变化。')
  })
})

describe('mobile file import reuses the desktop checks', () => {
  it.each([
    ['not valid json{{{', 'invalidJson'],
    ['{"foo":1}', 'notBackup'],
    [JSON.stringify({ data: { categories: [] }, schemaVersion: 99, createdAt: '2026-10-01T00:00:00.000Z' }), 'unsupportedVersion']
  ])('turns %s into an explained error code', (content, code) => {
    const parsed = DataManagementAPI.parseFullBackupContent(content)
    expect(parsed).toMatchObject({ ok: false, errorCode: code })
  })

  it('accepts a plain data export', () => {
    expect(DataManagementAPI.parseFullBackupContent('{"categories":[],"prompts":[]}'))
      .toEqual({ ok: true, data: { categories: [], prompts: [] } })
  })

  it('the mobile page shows the coded message, never the parser text', () => {
    const page = read('src/renderer/pages/mobile/settings/MobileDataBackupPage.vue')
    expect(page).toContain('DataManagementAPI.parseFullBackupContent(content)')
    expect(page).toContain("t(`dataBackup.importErrors.${parsed.errorCode}`, parsed.params ?? {})")
    expect(page).not.toMatch(/showToast\(\s*error instanceof Error \? error\.message/)
  })
})

describe('dismissing the share sheet is not an export failure', () => {
  it.each([
    [new Error('Share canceled'), true],
    [new Error('Share cancelled'), true],
    [Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }), true],
    [new Error('ENOSPC: no space left on device'), false],
    [undefined, false]
  ])('%s → %s', (error, dismissed) => {
    expect(isShareDismissed(error)).toBe(dismissed)
  })

  it('the export handler returns quietly when the sheet is dismissed', () => {
    const page = read('src/renderer/pages/mobile/settings/MobileDataBackupPage.vue')
    const handler = page.slice(page.indexOf('const handleExport'), page.indexOf('const handleImport'))
    expect(handler.indexOf('if (isShareDismissed(error))')).toBeGreaterThan(-1)
    expect(handler.indexOf('if (isShareDismissed(error))')).toBeLessThan(handler.indexOf("t('settingsMessages.dataExportFailed')"))
  })
})

describe('pages show interface-language text instead of service messages', () => {
  it('desktop cloud backup pane never shows result.message or result.error', () => {
    const pane = read('src/renderer/components/settings/CloudBackupLocationPane.vue')
    expect(pane).not.toMatch(/result\.(message|error) \|\| t\(/)
    expect(pane).not.toMatch(/message\.error\(error instanceof Error \? error\.message/)
    expect(pane).toContain("message.success(t('dataBackup.createCloudBackupSuccess'))")
    expect(pane).toContain("message.success(t('dataBackup.restoreSuccess'))")
    expect(pane).toContain("message.success(t('dataBackup.deleteSuccess'))")
    expect(pane).toContain("otherwise: t('dataBackup.restoreFailedUnchanged')")
  })

  it('mobile cloud backup page no longer appends raw reasons or warns about an empty folder', () => {
    const page = read('src/renderer/pages/mobile/settings/MobileCloudBackupPage.vue')
    expect(page).not.toContain('failedWith(')
    expect(page).not.toContain('backupDirectoryCreated')
    expect(page).toContain('describeCloudBackupFailure(')
  })

  it('mobile local restore never toasts the error text', () => {
    const page = read('src/renderer/pages/mobile/settings/MobileLocalBackupPage.vue')
    expect(page).not.toMatch(/error instanceof Error \? error\.message/)
    expect(page).toContain("t('dataBackup.restoreFailedUnchanged')")
    expect(page).not.toContain('automaticBackupRetentionWarning')
  })

  it('desktop automatic backup status never shows the raw error', () => {
    const settings = read('src/renderer/components/settings/DataManagementSettings.vue')
    expect(settings).toContain("t('dataBackup.automaticBackupFailed')")
    expect(settings).not.toContain('autoBackupStatus.error')
    expect(settings).not.toMatch(/automaticBackupRetention(Warning|Deferred)/)
  })
})

describe('locale files', () => {
  const added = ['dataBackup.restoreFailedUnchanged', 'settingsMessages.clearBackupFailed']
  const removed = [
    'dataBackup.automaticBackupRetentionWarning',
    'dataBackup.automaticBackupRetentionDeferred',
    'dataManagement.messages.noExportPath',
    'dataManagement.messages.unknownIssue',
    'dataManagement.messages.checkFailed',
    'cloudBackup.backupDirectoryCreated'
  ]
  const noPlaceholders = [
    'dataBackup.automaticBackupFailed',
    'dataBackup.importErrors.backupFailed',
    'dataBackup.importErrors.importFailed',
    'dataManagement.messages.healthCheckIssues'
  ]

  it.each(LOCALES)('%s has the new keys, drops the unused ones and no raw placeholders', code => {
    const messages = locale(code)
    for (const key of added) expect(typeof lookup(messages, key) === 'string' && lookup(messages, key).length > 0, `${code} ${key}`).toBe(true)
    for (const key of removed) expect(lookup(messages, key), `${code} ${key}`).toBeUndefined()
    for (const key of noPlaceholders) expect(lookup(messages, key), `${code} ${key}`).not.toMatch(/\{(error|stores)\}/)
  })

  it('the data management page talks about data on this device, not the database', () => {
    const zh = locale('zh-CN')
    const visible = [
      'dataManagement.databaseMaintenance', 'dataManagement.checkDatabaseHealth', 'dataManagement.repairDatabase',
      'dataManagement.clearDatabase', 'dataManagement.restoreWarning', 'dataBackup.restoreWarning',
      'dataBackup.restoreOverwriteNotice', 'settingsMessages.databaseCleared', 'settingsMessages.databaseHealthCheckFailed',
      'settingsMessages.databaseClearFailed', 'dataManagement.messages.healthCheckPassed', 'dataManagement.messages.healthCheckIssues',
      'dataManagement.messages.repairSuccess', 'dataManagement.messages.repairFailed', 'dataManagement.formatNoteText',
      'dataBackup.automaticBackupFailed', 'dataBackup.automaticBackupLifecycleDescription', 'dataBackup.restoreFailedUnchanged',
      'settingsMessages.clearBackupFailed'
    ]
    for (const key of visible) {
      expect(lookup(zh, key), key).not.toMatch(/数据库|事务|集合|字段|HTTP|manifest|失败：\{error\}/)
    }
    expect(zh.dataManagement.clearDatabase).toBe('清空本机数据')
    expect(zh.dataManagement.formatNoteText).toBe('模型配置只能导出为 JSON。')
    for (const code of ['en-US', 'it-IT']) {
      const messages = locale(code)
      for (const key of visible) expect(lookup(messages, key), `${code} ${key}`).not.toMatch(/[一-鿿]|database/i)
    }
    for (const code of ['zh-TW', 'ja-JP']) {
      const messages = locale(code)
      for (const key of visible) expect(lookup(messages, key), `${code} ${key}`).not.toMatch(/資料庫|データベース/)
    }
  })
})
