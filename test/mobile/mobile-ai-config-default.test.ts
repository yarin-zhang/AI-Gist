import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(
  'src/renderer/pages/mobile/MobileAIConfigEditPage.vue',
  'utf8'
)

describe('mobile AI configuration default provider', () => {
  it('initializes the OpenAI-compatible card and form fields together', () => {
    expect(pageSource).toContain("const selectedChoiceId = ref('custom:openai')")
    expect(pageSource).toContain('const initializeNewConfig = () => {')
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?selectedChoiceId\.value = defaultChoice\.id/)
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?formData\.name = defaultChoice\.label/)
    expect(pageSource).toMatch(/initializeNewConfig[\s\S]*?formData\.baseURL = ''/)
    expect(pageSource).toMatch(/onMounted\(\(\) => \{[\s\S]*?initializeNewConfig\(\)/)
  })
})
