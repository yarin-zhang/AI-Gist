import { afterEach, describe, expect, it } from 'vitest'
import i18n from '~/i18n'
import {
  getCloudStorageConnectionDiagnosis,
  getCloudSyncErrorDiagnosis,
  type CloudSyncStructuredDiagnostic
} from '~/lib/services/cloud-sync.service'

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const
const HAN = /[一-鿿]/

const structured = (code: CloudSyncStructuredDiagnostic['code'], retryClass: CloudSyncStructuredDiagnostic['retryClass'] = 'deterministic') => ({
  operationId: 'op-1',
  code,
  phase: 'apply-local',
  retryClass,
  message: 'boom',
  storageId: 'cfg-1',
  fingerprint: 'fp-1',
  failures: [{ phase: 'write', code: 'QUOTA_EXCEEDED', collection: 'prompts', recordKey: 'uuid:prompt-1', message: 'x', retryable: false }]
}) as CloudSyncStructuredDiagnostic

// 每一类诊断各取一个能命中的输入
const SAMPLES = [
  'something odd happened',
  structured('DATA_CONTRACT_INVALID'),
  structured('LOCAL_APPLY_QUOTA', 'user-action'),
  structured('LOCAL_APPLY_FAILED', 'user-action'),
  structured('RESTORE_DECISION_REQUIRED', 'user-action'),
  structured('SYNC_CANCELLED', 'transient'),
  '云端同步文件状态持续变化',
  'Invalid response: 401 Unauthorized',
  'connect ECONNREFUSED 127.0.0.1:5005',
  'Invalid response: 404 Not Found',
  'database is locked',
  structured('UNKNOWN_SYNC_ERROR', 'transient')
]

describe('cloud sync error diagnosis i18n (#418)', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('follows the interface language for the title, message, actions and copyable report', () => {
    i18n.global.locale.value = 'en-US'
    const diagnosis = getCloudSyncErrorDiagnosis('Invalid response: 401 Unauthorized', {
      storageId: 'cfg-1',
      reason: 'manual',
      status: 'error',
      failureCount: 2
    })

    expect(diagnosis.title).toBe('Cloud storage sign-in failed')
    expect(diagnosis.suggestedActions).toHaveLength(3)
    expect(diagnosis.copyText).toContain('AI-Gist cloud sync error report')
    expect(diagnosis.copyText).toContain('Storage configuration ID: cfg-1')
    expect(diagnosis.copyText).toContain('Consecutive failures: 2')
    expect(diagnosis.copyText).toContain('Retries automatically: No')
    expect(diagnosis.copyText).not.toMatch(HAN)
  })

  it('has every category translated in every language', () => {
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      for (const sample of SAMPLES) {
        const diagnosis = getCloudSyncErrorDiagnosis(sample, { storageId: 'cfg-1' })
        const texts = [diagnosis.title, diagnosis.message, ...diagnosis.suggestedActions]
        expect(texts.every(text => text && !text.startsWith('dataSync.')), `${locale}: ${texts.join(' / ')}`).toBe(true)
        if (locale === 'en-US' || locale === 'it-IT') {
          expect(texts.join(' '), `${locale} should not fall back to Chinese`).not.toMatch(HAN)
        }
      }
    }
  })

  it('reports untranslated keys nowhere in the structured report', () => {
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      const { copyText } = getCloudSyncErrorDiagnosis(structured('LOCAL_APPLY_QUOTA', 'user-action'))
      expect(copyText, locale).not.toContain('dataSync.')
      expect(copyText).toContain('recordKey=uuid:prompt-1')
    }
  })
})

describe('WebDAV connection test diagnosis (#417)', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('turns raw technical errors into reasons people can act on', () => {
    const cases: [string | undefined, string][] = [
      ['Invalid URL', '服务器地址格式不对'],
      ['Invalid response: 401 Unauthorized', '用户名或密码不对'],
      ['request to https://nas.example.com/dav/AI-Gist-Backup/ failed, reason: getaddrinfo ENOTFOUND nas.example.com', '找不到这个服务器'],
      ['request to http://192.168.1.20:5005/dav/AI-Gist-Backup/ failed, reason: socket hang up', '服务器没有响应'],
      ['connect ECONNREFUSED 192.168.1.20:4010', '服务器拒绝连接'],
      ['Invalid response: 404 Not Found', '这个地址下没有 WebDAV 服务'],
      ['self signed certificate', '安全连接失败'],
      ['Invalid response: 502 Bad Gateway', '服务器出错'],
      [undefined, '连接测试失败']
    ]

    for (const [raw, title] of cases) {
      expect(getCloudStorageConnectionDiagnosis(raw).title, String(raw)).toBe(title)
    }
  })

  it('keeps the technical detail for support but hides credentials', () => {
    const diagnosis = getCloudStorageConnectionDiagnosis('request to https://user:secret@dav.example.com failed, reason: socket hang up')
    expect(diagnosis.detail).toBeDefined()
    expect(diagnosis.detail).not.toContain('secret')
    expect(getCloudStorageConnectionDiagnosis().detail).toBeUndefined()
  })

  it('is translated in every language', () => {
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      for (const raw of ['Invalid URL', '401', 'ENOTFOUND', 'ECONNREFUSED', 'socket hang up', 'certificate', '404', '500', undefined]) {
        const { title, message } = getCloudStorageConnectionDiagnosis(raw)
        expect(title.startsWith('dataSync.') || message.startsWith('dataSync.'), `${locale} ${raw}`).toBe(false)
        if (locale === 'en-US' || locale === 'it-IT') expect(`${title} ${message}`).not.toMatch(HAN)
      }
    }
  })
})
