import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const generator = readFileSync('src/renderer/pages/mobile/MobileAIGeneratorPage.vue', 'utf8')
const mainPage = readFileSync('src/renderer/pages/MobileMainPage.vue', 'utf8')

describe('Issue #230 modal empty-state navigation', () => {
  it('delegates modal navigation to the parent instead of racing close and push', () => {
    expect(generator).toContain("emit('navigateToAIConfig')")
    expect(generator).toMatch(/if \(props\.presentedAsModal\) \{\s*emit\('navigateToAIConfig'\)\s*return\s*\}/)
    expect(mainPage).toContain('@navigate-to-ai-config="navigateToAIConfigFromModal"')
  })

  it('serializes modal close before routing to the configuration form', () => {
    expect(mainPage).toContain('const navigateToAIConfigFromModal = async () => {')
    expect(mainPage).toContain('@didDismiss="handleAIGeneratorDidDismiss"')
    expect(mainPage).toMatch(/navigateToAIConfigFromModal = async \(\) => \{[\s\S]*?showAIGenerator\.value = false[\s\S]*?await nextTick\(\)[\s\S]*?await dismissed[\s\S]*?await router\.push\('\/ai-config\/create'\)/)
    expect(mainPage).toMatch(/handleAIGeneratorDidDismiss = \(\) => \{[\s\S]*?showAIGenerator\.value = false[\s\S]*?resolveAIGeneratorDismiss\?\.\(\)/)
    expect(mainPage).toContain("import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'")
  })
})
