import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('AI configuration workspace regressions', () => {
  it('splits the models page into a 264px library, a detail view and a step wizard', () => {
    const page = readRendererFile('pages/ModelsPage.vue')
    const library = readRendererFile('components/models/ModelLibraryList.vue')
    const workspace = readRendererFile('composables/ai/useAIConfigWorkspace.ts')
    const main = readRendererFile('pages/MainPage.vue')

    expect(main).toContain("import ModelsPage from './ModelsPage.vue'")
    expect(page).toContain('<ModelLibraryList')
    expect(page).toContain('<ModelDetail')
    expect(page).toContain('<ModelConfigWizard ref="wizardRef"')
    expect(page).toContain('defineExpose({ openAddConfigModal })')
    expect(library).toMatch(/\.model-library\s*\{[^}]*width:\s*var\(--list-width\)/s)
    expect(library).toMatch(/\.model-item\.is-active\s*\{[^}]*background:\s*var\(--accent-soft\)/s)
    expect(library).not.toContain('--selection-bar')
    expect(workspace).toContain("const LAST_CONFIG_KEY = 'ai_config_workspace_last_id'")
    expect(workspace).toContain('localStorage.setItem(LAST_CONFIG_KEY')
  })

  it('filters configurations by online, local and custom groups', () => {
    const library = readRendererFile('components/models/ModelLibraryList.vue')
    const choices = readRendererFile('composables/ai/useAIProviderChoices.ts')
    const workspace = readRendererFile('composables/ai/useAIConfigWorkspace.ts')

    for (const filter of ['all', 'online', 'local', 'custom']) expect(library).toContain(`value: '${filter}' as ConfigFilter`)
    expect(choices).toContain('const getConfigGroup = (config: AIConfig): ProviderGroupKey')
    expect(workspace).toContain('getConfigGroup(config) !== activeFilter.value')
  })

  it('distinguishes an explicit preferred configuration from fallback behavior', () => {
    const workspace = readRendererFile('composables/ai/useAIConfigWorkspace.ts')
    const page = readRendererFile('pages/ModelsPage.vue')
    const detail = readRendererFile('components/models/ModelDetail.vue')

    expect(workspace).toContain('explicitPreferredConfig')
    expect(workspace).toContain('fallbackConfig')
    expect(page).toContain(':is-fallback="!explicitPreferredConfig && fallbackConfig?.id === selectedConfig.id"')
    expect(detail).toContain("t('aiConfig.workspace.fallbackDescription')")
    expect(workspace).not.toContain('getPreferredAIConfig()')
  })

  it('keeps connection and request test results with each configuration', () => {
    const page = readRendererFile('pages/ModelsPage.vue')
    const workspace = readRendererFile('composables/ai/useAIConfigWorkspace.ts')

    expect(page).toContain(':connection-result="connectionResults[selectedConfig.id!]"')
    expect(page).toContain(':request-result="requestResults[selectedConfig.id!]"')
    expect(workspace).toContain('window.electronAPI.ai.testConfig')
    expect(workspace).toContain('testedAt: new Date()')
  })

  it('runs the request test with a prompt the user can edit', () => {
    const workspace = readRendererFile('composables/ai/useAIConfigWorkspace.ts')
    const detail = readRendererFile('components/models/ModelDetail.vue')

    expect(workspace).toContain('requestTestPrompts')
    expect(workspace).toContain("mode: 'raw'")
    expect(workspace).toContain('elapsed: Math.round(performance.now() - started)')
    expect(detail).toContain("@update:value=\"value => emit('update:request-prompt', value)\"")
    expect(detail).toContain("t('models.elapsed', { ms: requestResult.elapsed })")
  })

  it('provides guided creation, direct editing, and unsaved-change protection', () => {
    const editor = readRendererFile('composables/ai/useAIConfigEditor.ts')
    const wizard = readRendererFile('components/models/ModelConfigWizard.vue')
    const systemPrompt = readRendererFile('components/models/SystemPromptModal.vue')

    expect(editor).toContain("export type EditorSection = 'provider' | 'connection' | 'models'")
    expect(editor).toContain('confirmContinueAfterConnectionTest')
    expect(editor).toContain('continueWithoutTestMessage')
    expect(editor).toContain('fetchModelList(false)')
    expect(wizard).toContain('fetchModelList(true)')
    expect(editor).toContain('const dirty = computed(() => show.value && serializeForm() !== snapshot.value)')
    expect(wizard).toContain('@close="requestClose"')
    expect(wizard).toContain('width="var(--overlay-width-wizard)"')
    expect(wizard).toMatch(/\.provider-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s)
    expect(systemPrompt).toContain('const dirty = computed(() => content.value !== snapshot.value)')
  })

  it('keeps connection testing separate from model discovery and provides custom presets', () => {
    const editor = readRendererFile('composables/ai/useAIConfigEditor.ts')
    const choices = readRendererFile('composables/ai/useAIProviderChoices.ts')

    expect(editor).toContain('window.electronAPI.ai.testConfig')
    expect(editor).toContain('window.electronAPI.ai.getModels')
    expect(editor).not.toMatch(/testConnection[\s\S]*?formData\.models\s*=\s*\[\.\.\.result\.models\]/)
    expect(choices).toContain("id: 'custom:openai'")
    expect(choices).toContain("id: 'custom:claude'")
    expect(choices).toContain("id: 'preset:groq'")
    expect(choices).toMatch(/id:\s*'preset:groq'[\s\S]*?icon:\s*LetterX/)
    expect(choices).toMatch(/id:\s*'preset:vllm', type: 'openai', group: 'local'/)
    expect(choices).toContain("(['online', 'local', 'custom'] as const)")
    expect(choices).toContain('providerIcons')
  })

  it('uses a single quick-optimization modal with an inline editor', () => {
    const modal = readRendererFile('components/ai/QuickOptimizationConfigModal.vue')

    expect(modal.match(/<UiModal\b/g)?.length).toBe(1)
    expect(modal).toContain('width="var(--overlay-width-workspace)"')
    expect(modal).toContain('flush')
    expect(modal).toContain('class="optimization-library"')
    expect(modal).toContain('class="optimization-editor"')
    expect(modal).toContain('moveSelected(-1)')
    expect(modal).toContain('moveSelected(1)')
    expect(modal).toContain('enabledCount >= 5')
    expect(modal).toContain('confirmDiscard')
    expect(modal).not.toContain('margin: calc(var(--content-padding) * -1)')
    expect(modal).toMatch(/\.optimization-workspace\s*\{[^}]*overflow:\s*hidden[^}]*background:\s*var\(--surface-primary\)/s)
    expect(modal).toMatch(/\.optimization-select:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent-primary\)/s)
  })

  it('keeps quick-optimization names, descriptions, and templates fully readable', () => {
    const modal = readRendererFile('components/ai/QuickOptimizationConfigModal.vue')

    expect(modal).toContain(':autosize="{ minRows: 2, maxRows: 8 }"')
    expect(modal).toContain(':autosize="{ minRows: 12, maxRows: 28 }"')
    expect(modal).toMatch(/\.optimization-copy strong, \.optimization-copy small\s*\{[^}]*white-space:\s*normal/s)
    expect(modal).toMatch(/\.optimization-copy strong, \.optimization-copy small\s*\{[^}]*overflow-wrap:\s*anywhere/s)
    expect(modal).not.toMatch(/\.optimization-copy strong, \.optimization-copy small\s*\{[^}]*text-overflow:\s*ellipsis/s)
  })

  it('ships the new workspace copy in every supported locale', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']) {
      const messages = JSON.parse(readRendererFile(`i18n/locales/${locale}.json`))
      expect(messages.aiConfig.workspace.searchPlaceholder).toBeTruthy()
      expect(messages.aiConfig.workspace.defaultSystemPrompt).toBeTruthy()
      expect(messages.quickOptimization.workspace.limitHelp).toBeTruthy()
      expect(messages.quickOptimization.workspace.unsavedMessage).toBeTruthy()
    }
  })
})
