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

    expect(modal.match(/<CommonModal\b/g)?.length).toBe(1)
    expect(modal).toContain('class="optimization-library"')
    expect(modal).toContain('class="optimization-editor"')
    expect(modal).toContain('moveSelected(-1)')
    expect(modal).toContain('moveSelected(1)')
    expect(modal).toContain('enabledCount >= 5')
    expect(modal).toContain('confirmDiscard')
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
