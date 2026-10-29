// 主进程只返回错误码 / 原因码，渲染进程负责翻译。这里检查：
// - 各翻译函数用到的每个文案键在五种语言里都存在（这些键是在 switch 里按原因码选的，
//   i18n-static-keys 那份静态扫描覆盖不全）
// - 改过的旧说法不再出现，删掉的键在五种语言里都删干净
// - 代理测试、iCloud 检测的原因码会翻译成当前界面语言

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SHORTCUT_ERROR_CODES, createShortcutError } from '../../src/shared/shortcut-errors'
import type { ICloudUnavailableReason } from '../../src/shared/types/cloud-backup'
import type { ProxyTestErrorCode, ProxyTestSiteId } from '../../src/shared/types/network-proxy'
import type { PasteUnavailableReason } from '../../src/shared/types/preferences'
import { describeDatabaseError } from '../../src/renderer/lib/utils/database-error'
import { describeICloudUnavailable, localizeICloudAvailability } from '../../src/renderer/lib/utils/icloud-availability'
import { describeProxyTestError, proxySiteLabel } from '../../src/renderer/lib/utils/proxy-test-messages'
import { describePasteUnavailable, describeShortcutError } from '../../src/renderer/lib/utils/shortcut-messages'

vi.mock('electron', () => ({ session: {}, net: {} }))

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const

const loadLocale = (locale: string) => {
  const raw = readFileSync(resolve(process.cwd(), `src/renderer/i18n/locales/${locale}.json`), 'utf8')
  return { raw, messages: JSON.parse(raw) as Record<string, unknown> }
}

const getMessage = (messages: Record<string, unknown>, key: string): unknown => key
  .split('.')
  .reduce<unknown>((value, segment) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined), messages)

/** 记下翻译函数实际用到的键 */
const collectKeys = (run: (t: (key: string) => string) => void): string[] => {
  const keys: string[] = []
  run(key => {
    keys.push(key)
    return key
  })
  return keys
}

describe('keys used by the error-code translators', () => {
  const keys = new Set<string>([
    ...collectKeys(t => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      SHORTCUT_ERROR_CODES.forEach(code => describeShortcutError(createShortcutError(code), t))
      describeShortcutError(new Error('unexpected'), t)
      ;(['accessibility-permission', 'xdotool-missing', 'wayland', 'unsupported-platform'] satisfies PasteUnavailableReason[])
        .forEach(reason => describePasteUnavailable(reason, t))
      ;(['upgrade-blocked', 'unavailable'] as const).forEach(kind => describeDatabaseError({ kind, detail: '' }, t))
      ;(['icloud-drive-off', 'icloud-for-windows-missing', 'unsupported-platform', 'check-failed'] satisfies ICloudUnavailableReason[])
        .forEach(reason => describeICloudUnavailable(reason, t))
      ;(['baidu', 'github', 'google', 'openai'] satisfies ProxyTestSiteId[]).forEach(id => proxySiteLabel(id, t))
      ;(['timeout', 'proxy-refused', 'unreachable', 'http-error'] satisfies ProxyTestErrorCode[])
        .forEach(errorCode => describeProxyTestError({ errorCode, statusCode: 502 }, t))
    }),
    'appInit.failedTitle',
    'databaseStatus.connectionError',
    'databaseStatus.detailLabel',
    'launcher.runFailed',
    'networkProxy.connectionFailedProxy',
  ])

  it.each(LOCALES)('are all defined in %s', locale => {
    const { messages } = loadLocale(locale)
    const missing = [...keys].filter(key => typeof getMessage(messages, key) !== 'string')
    expect(missing).toEqual([])
  })

  it('cover 30+ distinct messages', () => {
    expect(keys.size).toBeGreaterThan(30)
  })
})

describe('locale wording', () => {
  it.each(LOCALES)('%s keeps the canonical JSON format and drops removed keys', locale => {
    const { raw, messages } = loadLocale(locale)
    expect(JSON.stringify(messages, null, 2) + '\n').toBe(raw)
    expect(getMessage(messages, 'shortcuts.autoPasteUnavailable')).toBeUndefined()
  })

  it('uses plain wording in Simplified Chinese', () => {
    const { messages } = loadLocale('zh-CN')
    expect(getMessage(messages, 'appInit.failedTitle')).toBe('数据没能加载')
    expect(getMessage(messages, 'databaseStatus.connectionError')).toBe('数据没能加载')
    expect(getMessage(messages, 'shortcuts.registered')).toBe('已生效')
    expect(getMessage(messages, 'shortcuts.notRegistered')).toBe('未生效')
    expect(getMessage(messages, 'shortcuts.invalidTarget')).toBe('提示词已删除')
    expect(getMessage(messages, 'shortcuts.pasteFallbackHint')).toBe('无法自动粘贴时，会改为复制到剪贴板。')
  })

  it.each(LOCALES)('%s no longer says "database connection error", "registered" or "degrades"', locale => {
    const { raw } = loadLocale(locale)
    expect(raw).not.toMatch(/数据库连接异常|資料庫連線異常|Database connection error|データベースの接続エラー|Errore di connessione al database/)
    expect(raw).not.toMatch(/自动降级为复制/)
    expect(raw).not.toMatch(/"registered": "(已注册|已註冊|Registered|登録済み|Registrato)"/)
  })
})

describe('proxy test results', () => {
  it('maps Chromium network errors to a few reasons', async () => {
    const { classifyProxyTestError } = await import('../../src/main/electron/network-proxy')
    expect(classifyProxyTestError('net::ERR_PROXY_CONNECTION_FAILED')).toBe('proxy-refused')
    expect(classifyProxyTestError('net::ERR_TUNNEL_CONNECTION_FAILED')).toBe('proxy-refused')
    expect(classifyProxyTestError('net::ERR_SOCKS_CONNECTION_FAILED')).toBe('proxy-refused')
    expect(classifyProxyTestError('net::ERR_CONNECTION_TIMED_OUT')).toBe('timeout')
    expect(classifyProxyTestError('net::ERR_TIMED_OUT')).toBe('timeout')
    expect(classifyProxyTestError('net::ERR_NAME_NOT_RESOLVED')).toBe('unreachable')
    expect(classifyProxyTestError('net::ERR_CONNECTION_REFUSED')).toBe('unreachable')
    expect(classifyProxyTestError('')).toBe('unreachable')
  })

  it('labels sites and errors in the UI language', async () => {
    const { default: i18n } = await import('../../src/renderer/i18n')
    const t = i18n.global.t as (key: string, values?: Record<string, unknown>) => string

    i18n.global.locale.value = 'en-US'
    expect(proxySiteLabel('baidu', t)).toEqual({ name: 'Baidu', description: 'Website in mainland China' })
    expect(describeProxyTestError({ errorCode: 'proxy-refused' }, t)).toBe('Proxy unreachable')
    expect(describeProxyTestError({ errorCode: 'http-error', statusCode: 503 }, t)).toBe('Site returned 503')

    i18n.global.locale.value = 'zh-CN'
    expect(proxySiteLabel('baidu', t).name).toBe('百度')
    expect(describeProxyTestError({ errorCode: 'timeout' }, t)).toBe('连接超时')
  })
})

describe('iCloud availability', () => {
  it('turns the main-process reason code into an actionable sentence', async () => {
    const { default: i18n } = await import('../../src/renderer/i18n')
    const t = i18n.global.t as (key: string) => string

    i18n.global.locale.value = 'en-US'
    expect(localizeICloudAvailability({ available: false, reasonCode: 'icloud-for-windows-missing' }, t).reason)
      .toBe("iCloud Drive wasn't found. Install iCloud for Windows, turn on iCloud Drive, then restart AI Gist.")
    expect(localizeICloudAvailability({ available: false, reasonCode: 'icloud-drive-off' }, t).reason)
      .toContain('turn on iCloud Drive')

    i18n.global.locale.value = 'zh-CN'
    expect(localizeICloudAvailability({ available: false, reasonCode: 'unsupported-platform' }, t).reason)
      .toBe('这个系统上没有 iCloud Drive，请改用 WebDAV。')
    // 已经是翻译好的说明（Web、移动端）原样保留
    expect(localizeICloudAvailability({ available: false, reason: '已有说明' }, t)).toEqual({ available: false, reason: '已有说明' })
    expect(localizeICloudAvailability({ available: true }, t)).toEqual({ available: true })
  })

  it('returns reason codes from the main process instead of Chinese text', async () => {
    const os = await import('os')
    const { ICloudProvider } = await import('../../src/main/cloud/icloud-provider')
    const platform = vi.spyOn(os.default, 'platform')

    platform.mockReturnValue('linux')
    expect(await ICloudProvider.isICloudAvailable()).toEqual({ available: false, reasonCode: 'unsupported-platform' })

    platform.mockReturnValue('win32')
    const homedir = vi.spyOn(os.default, 'homedir').mockReturnValue('/nonexistent-ai-gist-home')
    expect(await ICloudProvider.isICloudAvailable()).toEqual({ available: false, reasonCode: 'icloud-for-windows-missing' })

    platform.mockReturnValue('darwin')
    expect(await ICloudProvider.isICloudAvailable()).toEqual({ available: false, reasonCode: 'icloud-drive-off' })
    homedir.mockRestore()
  })
})
