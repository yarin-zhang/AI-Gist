import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('quick optimization config refresh', () => {
  it('refreshes the active prompt editor when the config modal closes', () => {
    const page = readFileSync('src/renderer/pages/PromptManagementPage.vue', 'utf8')

    expect(page).toContain('@update:show="handleQuickOptimizationModalShowUpdate"')
    expect(page).toMatch(/handleQuickOptimizationModalShowUpdate = \(show: boolean\)[\s\S]*?if \(!show\) handleQuickOptimizationConfigsUpdated\(\)/)
  })
})
