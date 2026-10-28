/**
 * #427 / #428：移动端模型编辑和桌面向导一致——不再有单独的「自定义模型」输入框，
 * 旧配置里的自定义模型并进可用模型列表；第一个启用的配置自动设为首选。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeLegacyCustomModel, shouldPreferNewConfig } from '~/lib/utils/ai-config-models'

const editPage = readFileSync('src/renderer/pages/mobile/MobileAIConfigEditPage.vue', 'utf8')
const desktopEditor = readFileSync('src/renderer/composables/ai/useAIConfigEditor.ts', 'utf8')

describe('mergeLegacyCustomModel', () => {
  it('folds a legacy custom model into the list and uses it as default when none is set', () => {
    expect(mergeLegacyCustomModel({ models: ['gpt-4o'], defaultModel: '', customModel: 'my-model' }))
      .toEqual({ models: ['gpt-4o', 'my-model'], defaultModel: 'my-model' })
  })

  it('keeps an explicit default and never duplicates models', () => {
    expect(mergeLegacyCustomModel({ models: ['a', 'b'], defaultModel: 'b', customModel: 'a' }))
      .toEqual({ models: ['a', 'b'], defaultModel: 'b' })
    expect(mergeLegacyCustomModel({ models: [], defaultModel: 'x', customModel: '' }))
      .toEqual({ models: ['x'], defaultModel: 'x' })
  })

  it('falls back to the first model, or nothing for a new config', () => {
    expect(mergeLegacyCustomModel({ models: ['a', 'b'], defaultModel: '' })).toEqual({ models: ['a', 'b'], defaultModel: 'a' })
    expect(mergeLegacyCustomModel(null)).toEqual({ models: [], defaultModel: '' })
  })
})

describe('shouldPreferNewConfig', () => {
  it('prefers the new config only while no other config is enabled', () => {
    expect(shouldPreferNewConfig([])).toBe(true)
    expect(shouldPreferNewConfig([{ enabled: false }])).toBe(true)
    expect(shouldPreferNewConfig([{ enabled: false }, { enabled: true }])).toBe(false)
  })
})

describe('mobile model editor matches the desktop wizard', () => {
  it('has no separate custom model field and clears the legacy field on save', () => {
    expect(editPage).not.toContain("t('aiConfig.customModel')")
    expect(editPage).not.toContain('formData.customModel')
    expect(editPage).toMatch(/const \{ models, defaultModel \} = mergeLegacyCustomModel\(config\)/)
    expect(editPage).toMatch(/customModel: '',/)
  })

  it('sets the first enabled configuration as preferred, like the desktop wizard', () => {
    expect(editPage).toMatch(/const preferNew = shouldPreferNewConfig\(await api\.aiConfigs\.getAll\.query\(\)\)/)
    expect(editPage).toMatch(/if \(preferNew && savedId\) await api\.aiConfigs\.setPreferred\.mutate\(savedId\)/)
    // 两端用的是同一份规则，不是各写一份
    expect(desktopEditor).toContain('mergeLegacyCustomModel(config)')
    expect(desktopEditor).toContain('shouldPreferNewConfig(await databaseService.aiConfig.getAllAIConfigs())')
  })
})
