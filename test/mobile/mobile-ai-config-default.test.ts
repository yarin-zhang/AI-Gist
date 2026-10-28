import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  'src/renderer/pages/mobile/MobileAIConfigEditPage.vue',
  'utf8'
)
const catalogSource = readFileSync(
  'src/renderer/components/mobile/models/provider-catalog.ts',
  'utf8'
)
const desktopChoicesSource = readFileSync(
  'src/renderer/composables/ai/useAIProviderChoices.ts',
  'utf8'
)

describe('mobile AI configuration default provider', () => {
  it('initializes the OpenAI-compatible card and form fields together', () => {
    expect(pageSource).toContain("const selectedChoiceId = ref('custom:openai')")
    expect(pageSource).toContain('const initializeNewConfig = () => {')
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?const defaultChoice = compatibilityProviderChoices\.value\[0\]/)
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?selectedChoiceId\.value = defaultChoice\.id/)
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?formData\.name = defaultChoice\.label/)
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?formData\.baseURL = ''/)
    expect(pageSource).toMatch(/onMounted\(\(\) => \{[\s\S]*?initializeNewConfig\(\)/)
  })

  it('takes the default from the shared desktop catalog, whose first compatible choice is OpenAI-compatible', () => {
    const openAIIndex = desktopChoicesSource.indexOf("id: 'custom:openai'")
    const claudeIndex = desktopChoicesSource.indexOf("id: 'custom:claude'")
    expect(openAIIndex).toBeGreaterThan(-1)
    expect(claudeIndex).toBeGreaterThan(openAIIndex)
    expect(pageSource).toContain("from '~/components/mobile/models/provider-catalog'")
  })

  it('keeps the issue #58 group order on mobile: custom, then online, then local', () => {
    expect(catalogSource).toContain("const MOBILE_GROUP_ORDER: ProviderGroupKey[] = ['custom', 'online', 'local']")
    expect(catalogSource).toMatch(/FEATURED_CHOICE_IDS = \['custom:openai'/)
  })

  it('restores the selected card for saved configs, including presets and custom services', () => {
    expect(pageSource).toContain('selectedChoiceId.value = resolveProviderChoiceId(config)')
  })

  it('keeps custom services from inheriting the official default endpoint', () => {
    expect(pageSource).toMatch(/if \(choice\.custom\) \{[\s\S]*?formData\.baseURL = choice\.baseURL \|\| ''/)
    expect(pageSource).toMatch(/if \(!isEditMode\.value\) \{\s*formData\.name = choice\.defaultName \|\| choice\.label/)
  })
})
