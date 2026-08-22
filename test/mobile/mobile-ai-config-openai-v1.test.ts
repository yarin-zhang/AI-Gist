import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('mobile OpenAI configuration guidance', () => {
  it('shows the /v1 suffix hint only for the official OpenAI provider', () => {
    const page = read('src/renderer/pages/mobile/MobileAIConfigEditPage.vue')

    expect(page).toContain("t('aiConfig.openaiBaseURLHint')")
    expect(page).toMatch(/v-if="formData\.type === 'openai' && !isCustomSelected"/)
    expect(page).toContain('class="base-url-hint"')
  })

  it('defines the hint in every supported locale', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP']) {
      const messages = JSON.parse(read(`src/renderer/i18n/locales/${locale}.json`))
      expect(messages.aiConfig.openaiBaseURLHint).toBeTruthy()
      expect(messages.aiConfig.openaiBaseURLHint).toContain('/v1')
    }
  })
})
