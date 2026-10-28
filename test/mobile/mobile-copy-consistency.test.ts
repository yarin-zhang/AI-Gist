/**
 * #474：移动端文案。日期跟随界面语言、测试提示词显示实际发出的内容、服务商对外名称、
 * 拼接的空格和标点、同一件事的叫法。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const locale = (code: string) => JSON.parse(read(`src/renderer/i18n/locales/${code}.json`))
const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']

describe('移动端文案', () => {
  it('「生成失败」不再译成「构建失败」', () => {
    expect(locale('en-US').aiGenerator.generateFailed).toBe('Generation failed')
    expect(locale('ja-JP').aiGenerator.generateFailed).toBe('生成に失敗しました')
  })

  it('模型详情的创建时间按界面语言用友好格式', () => {
    const detail = read('src/renderer/pages/mobile/MobileAIConfigDetailPage.vue')
    expect(detail).toContain('formatFriendlyDate(config.value.createdAt, locale.value, { withTime: true, capitalize: false })')
    expect(detail).not.toContain('toLocaleString()')
  })

  it('请求测试显示实际发出的提示词，而不是占位的 Test prompt', () => {
    expect(read('src/renderer/lib/api/ai-config.api.ts')).not.toContain("inputPrompt: 'Test prompt'")
  })

  it('非中文界面的服务商宫格用对外名称', () => {
    for (const type of ['siliconflow', 'aliyun', 'zhipu', 'tencent']) {
      for (const code of ['en-US', 'it-IT', 'ja-JP']) {
        expect(locale(code).mobileModels.providerNames[type]).not.toMatch(/[一-鿿]/)
      }
    }
    expect(read('src/renderer/components/mobile/models/provider-catalog.ts')).toContain('t(`mobileModels.providerNames.${type}`)')
  })

  it('拼接处有空格、没有重复标点', () => {
    const generator = read('src/renderer/pages/mobile/MobileAIGeneratorPage.vue')
    expect(generator).toContain("{{ t('mobilePrompt.generatedWith') }} <b class=\"gen-status__count\">")
    expect(locale('zh-CN').promptPage.updatedAt).toBe('{date} 更新')
    expect(locale('zh-TW').promptPage.updatedAt).toBe('{date} 更新')
    expect(read('src/renderer/pages/mobile/settings/shared.ts')).toContain("joinSentences(diagnosis.message, translate('mobileSettings.sync.retryAt'")
  })

  it('同一件事用同一个叫法；取消首选的确认按钮写明结果', () => {
    expect(read('src/renderer/pages/mobile/MobilePromptDetailPage.vue')).toContain("t('mobilePrompt.rawTemplateCopied')")
    expect(read('src/renderer/pages/mobile/MobileSystemPromptEditPage.vue')).toContain(":title=\"t('aiConfig.systemPrompt')\"")
    expect(read('src/renderer/pages/mobile/MobileAIConfigEditPage.vue')).toContain("t('mobileModels.enterServiceEndpoint')")
    const actions = read('src/renderer/components/mobile/models/useConfigActions.ts')
    expect(actions).toContain("confirmText: t('mobileModels.removePreferred')")
    expect(actions).toContain("cancelText: t('mobileModels.keepPreferred')")
    expect(read('src/renderer/pages/mobile/MobileAIConfigPage.vue')).toContain('@click="handlePickPreferred"')
  })

  it('新增文案五种语言都有', () => {
    const keys = [
      'mobileAI.failedWith', 'mobileModels.desktopOnly', 'mobileModels.desktopOnlyConfigNote', 'mobileModels.desktopOnlyProviders',
      'mobileModels.noModelSelected', 'mobileModels.keepPreferred', 'mobileModels.removePreferred', 'mobileModels.enterServiceEndpoint',
      'mobileModels.requestTestFailed', 'mobilePrompt.rawTemplateCopied', 'promptFill.listHint', 'mobileSettings.sync.retryAt',
      'mobileSettings.sync.errorDetailLabel', 'mobileSettings.failedWith',
    ]
    for (const code of LOCALES) {
      const messages = locale(code)
      for (const key of keys) {
        const value = key.split('.').reduce((node: any, part) => node?.[part], messages)
        expect(typeof value === 'string' && value.length > 0, `${code} ${key}`).toBe(true)
      }
    }
  })
})
