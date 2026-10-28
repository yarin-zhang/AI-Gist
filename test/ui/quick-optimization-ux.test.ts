import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('quick optimization UX', () => {
  it('offers every enabled optimization as a one-click chip in the AI panel', () => {
    const panel = readRendererFile('components/prompts/PromptAIPanel.vue')
    const session = readRendererFile('composables/prompt/usePromptAISession.ts')
    const page = readRendererFile('components/prompts/PromptPage.vue')

    expect(panel).toContain('v-for="config in quickConfigs"')
    expect(panel).toContain('@click="session.optimize(config)"')
    expect(panel).toContain("@click=\"emit('open-optimization-config')\"")
    expect(session).toContain("request.config.prompt.replace('{{content}}', content)")
    expect(page).toContain('api.quickOptimizationConfigs.getEnabled.query()')
  })

  it('shows optimization results as a suggestion to adopt or discard instead of overwriting the body', () => {
    const session = readRendererFile('composables/prompt/usePromptAISession.ts')
    const page = readRendererFile('components/prompts/PromptPage.vue')

    expect(session).toContain('suggestion.value = { label, original, proposed, streaming: true }')
    expect(session).not.toContain('content.value =')
    expect(page).toContain('<UiDiffText :segments="suggestionDiff" />')
    expect(page).toContain('@click="adoptSuggestion"')
    expect(page).toContain("pendingChangeDescription = t('promptHistory.adoptedAI', { label: adopted.label })")
  })

  it('supports cursor insertion, guidance, and a rich example in the configuration workspace', () => {
    const modal = readRendererFile('components/ai/QuickOptimizationConfigModal.vue')
    const locale = readRendererFile('i18n/locales/zh-CN.json')

    expect(modal).toContain("t('quickOptimization.workspace.limitHelp')")
    expect(modal).toContain('@click="createExampleDraft"')
    expect(modal).toContain('@mousedown.prevent @click="insertContentVariable"')
    expect(modal).toContain('textarea?.setSelectionRange?.(cursor, cursor)')
    expect(modal).toContain("t('quickOptimization.workspace.templateHelp')")
    expect(locale).toContain('只输出优化后的完整提示词，不解释修改过程')
  })
})
