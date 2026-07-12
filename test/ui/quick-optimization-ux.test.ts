import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('quick optimization UX', () => {
  it('keeps enabled optimization actions directly available in both prompt editors', () => {
    const actions = readRendererFile('components/prompt-management/QuickOptimizationActions.vue')
    const regularEditor = readRendererFile('components/prompt-management/RegularPromptEditor.vue')
    const jinjaEditor = readRendererFile('components/prompt-management/JinjaPromptEditor.vue')

    expect(actions).toContain('v-for="config in quickOptimizationConfigs"')
    expect(actions).toContain('@click="runOptimization(config.id)"')
    expect(actions).toContain('<NCollapseTransition :show="showManualInput && !isStreaming">')
    expect(actions).not.toContain('showOptimization')
    expect(regularEditor).toContain('<QuickOptimizationActions')
    expect(jinjaEditor).toContain('<QuickOptimizationActions')
  })

  it('supports cursor insertion, guidance, and a rich example in the configuration workspace', () => {
    const modal = readRendererFile('components/ai/QuickOptimizationConfigModal.vue')
    const locale = readRendererFile('i18n/locales/zh-CN.json')

    expect(modal).toContain('class="optimization-guide ui-toolbar"')
    expect(modal).toContain('@click="createExampleDraft"')
    expect(modal).toContain('@mousedown.prevent @click="insertContentVariable"')
    expect(modal).toContain('textarea?.setSelectionRange?.(cursor, cursor)')
    expect(locale).toContain('把高频提示词调整变成一键动作')
    expect(locale).toContain('只输出优化后的完整提示词，不解释修改过程')
  })
})
