import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('AI configuration workspace regressions', () => {
  it('uses the shared library and detail workspace structure', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toContain('class="ai-command-bar"')
    expect(page).toContain('class="config-library"')
    expect(page).toContain('class="config-workspace"')
    expect(page).toContain('v-model:size="libraryPaneSize"')
    expect(page).toContain("localStorage.setItem('ai_config_library_pane_size'")
    expect(page).toContain("localStorage.setItem('ai_config_workspace_last_id'")
    expect(page).toMatch(/\.ai-config-page\s*\{[^}]*height:\s*calc\(100vh - 24px\)[^}]*overflow:\s*hidden/s)
    expect(page).toMatch(/\.workspace-scroll\s*\{[^}]*height:\s*0[^}]*overflow:\s*hidden/s)
  })

  it('matches prompt management typography and centers preferred status in list rows', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toMatch(/\.ai-command-bar\s*\{[^}]*flex:\s*0 0 60px/s)
    expect(page).toMatch(/\.page-title\s*\{[^}]*font-size:\s*var\(--font-size-lg\)/s)
    expect(page).toMatch(/\.page-subtitle\s*\{[^}]*font-size:\s*var\(--font-size-xs\)/s)
    expect(page).toContain('class="preferred-marker"')
    expect(page).toMatch(/\.preferred-marker\s*\{[^}]*align-self:\s*center/s)
    expect(page).toContain("id: 'preset:groq'")
    expect(page).toMatch(/id:\s*'preset:groq'[\s\S]*?icon:\s*LetterX/)
  })

  it('distinguishes an explicit preferred configuration from fallback behavior', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toContain('explicitPreferredConfig')
    expect(page).toContain('fallbackConfig')
    expect(page).toContain('aiConfig.workspace.fallbackPreferred')
    expect(page).not.toContain('getPreferredAIConfig()')
  })

  it('keeps connection and request test results inside the selected workspace', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toContain('connectionResults[selectedConfig.id!]')
    expect(page).toContain('requestResults[selectedConfig.id!]')
    expect(page).not.toContain('showIntelligentTestResult')
    expect(page).not.toMatch(/<n-modal\b/i)
  })

  it('provides guided creation, direct editing, and unsaved-change protection', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toContain("type EditorSection = 'provider' | 'connection' | 'models'")
    expect(page).toContain('activeEditorSection')
    expect(page).toContain('confirmContinueAfterConnectionTest')
    expect(page).toContain('continueWithoutTestMessage')
    expect(page).toContain('fetchModelList(false)')
    expect(page).toContain('fetchModelList(true)')
    expect(page).toContain('editorDirty')
    expect(page).toContain('requestCloseEditor')
    expect(page).toContain('systemPromptDirty')
  })

  it('keeps connection testing separate from model discovery and provides custom presets', () => {
    const page = readRendererFile('pages/AIConfigPage.vue')

    expect(page).toContain('window.electronAPI.ai.testConfig')
    expect(page).toContain('window.electronAPI.ai.getModels')
    expect(page).not.toMatch(/testFormConnection[\s\S]*?formData\.models\s*=\s*\[\.\.\.result\.models\]/)
    expect(page).toContain("id: 'custom:openai'")
    expect(page).toContain("id: 'custom:claude'")
    expect(page).toContain("id: 'preset:groq'")
    expect(page).toContain("id: 'preset:vllm'")
    expect(page).toContain("key: 'online'")
    expect(page).toContain('...onlinePresetChoices.value')
    expect(page).toContain("key: 'custom'")
    expect(page).toContain('providers: compatibilityProviderChoices.value')
    expect(page).toContain('providerIcons')
  })

  it('uses a single quick-optimization modal with an inline editor', () => {
    const modal = readRendererFile('components/ai/QuickOptimizationConfigModal.vue')
    const commonModal = readRendererFile('components/common/CommonModal.vue')

    expect(modal.match(/<CommonModal\b/g)?.length).toBe(1)
    expect(modal).toContain(':body-padding="0"')
    expect(modal).toContain('class="optimization-library"')
    expect(modal).toContain('class="optimization-editor"')
    expect(modal).toContain('moveSelected(-1)')
    expect(modal).toContain('moveSelected(1)')
    expect(modal).toContain('enabledCount >= 5')
    expect(modal).toContain('confirmDiscard')
    expect(modal).not.toContain('margin: calc(var(--content-padding) * -1)')
    expect(modal).toMatch(/\.optimization-workspace\s*\{[^}]*overflow:\s*hidden[^}]*background:\s*var\(--surface-primary\)/s)
    expect(modal).toMatch(/\.optimization-select:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent-primary\)/s)
    expect(commonModal).toContain('bodyPadding?: number')
    expect(commonModal).toContain('resolvedBodyPadding')
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
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP']) {
      const messages = JSON.parse(readRendererFile(`i18n/locales/${locale}.json`))
      expect(messages.aiConfig.workspace.searchPlaceholder).toBeTruthy()
      expect(messages.aiConfig.workspace.defaultSystemPrompt).toBeTruthy()
      expect(messages.quickOptimization.workspace.limitHelp).toBeTruthy()
      expect(messages.quickOptimization.workspace.unsavedMessage).toBeTruthy()
    }
  })
})
