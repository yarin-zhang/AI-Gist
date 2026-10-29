/**
 * 同步过来的模型配置不带 API Key，界面要提示在这台设备上补填 (#491)
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@shared/types/ai'

vi.mock('~/lib/api', () => ({ api: { aiConfigs: { test: { mutate: vi.fn() } } } }))

import {
  connectionBadgeOf,
  connectionBadgeView,
  connectionStatuses,
  rememberConnectionStatus
} from '~/components/mobile/models/connection-status'

const t = (key: string) => key

const makeConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  id: 9,
  configId: 'cfg',
  name: 'OpenAI',
  type: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  models: ['gpt-4o-mini'],
  defaultModel: 'gpt-4o-mini',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('移动端模型配置缺少 API Key 的状态', () => {
  beforeEach(() => {
    Object.keys(connectionStatuses).forEach(key => delete connectionStatuses[Number(key)])
    localStorage.clear()
  })

  it('需要 API Key 却没有填写时显示「缺少 API Key」，优先于旧的连接结果', () => {
    const config = makeConfig({ apiKey: undefined })
    rememberConnectionStatus(config, { state: 'error', error: '401' })

    expect(connectionBadgeOf(config)).toBe('noCredential')
    expect(connectionBadgeView(config, t)).toMatchObject({
      badge: 'noCredential',
      label: 'models.credentialMissingTag',
      tone: 'm-pill-warn'
    })
  })

  it('本地服务和已填写 API Key 的配置不受影响；禁用的配置仍显示已禁用', () => {
    expect(connectionBadgeOf(makeConfig())).toBe('untested')
    expect(connectionBadgeOf(makeConfig({ type: 'ollama', apiKey: undefined }))).toBe('desktopOnly')
    expect(connectionBadgeOf(makeConfig({ apiKey: undefined, enabled: false }))).toBe('disabled')
  })

  it('桌面和移动端的模型详情都说明 API Key 不随同步传输', () => {
    const desktopDetail = readFileSync('src/renderer/components/models/ModelDetail.vue', 'utf8')
    const desktopList = readFileSync('src/renderer/components/models/ModelLibraryList.vue', 'utf8')
    const mobileDetail = readFileSync('src/renderer/pages/mobile/MobileAIConfigDetailPage.vue', 'utf8')

    expect(desktopDetail).toContain('isAIConfigCredentialMissing(props.config)')
    expect(desktopDetail).toContain("t('models.credentialNotSynced')")
    expect(desktopList).toContain("t('models.credentialMissingTag')")
    expect(mobileDetail).toContain('isAIConfigCredentialMissing(config.value)')
    expect(mobileDetail).toContain("t('models.credentialNotSynced')")
  })
})
