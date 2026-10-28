import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// V5 移动端「模型」页组：结构按设计稿重做，数据逻辑（实时刷新、确认、深链、返回键）原样保留。

const read = (path: string) => readFileSync(path, 'utf8')

const listPage = read('src/renderer/pages/mobile/MobileAIConfigPage.vue')
const detailPage = read('src/renderer/pages/mobile/MobileAIConfigDetailPage.vue')
const editPage = read('src/renderer/pages/mobile/MobileAIConfigEditPage.vue')
const promptPage = read('src/renderer/pages/mobile/MobileSystemPromptEditPage.vue')
const actions = read('src/renderer/components/mobile/models/useConfigActions.ts')

const modelsDir = 'src/renderer/components/mobile/models'
const ownSources = [
  listPage, detailPage, editPage, promptPage,
  ...readdirSync(modelsDir).map(name => read(join(modelsDir, name)))
]

describe('mobile models tab root (V5-M-Models)', () => {
  it('uses the tab-root skeleton and clears the floating tab bar', () => {
    expect(listPage).toContain('<ion-content class="m-page-content" :fullscreen="true" :scroll-events="true">')
    expect(listPage).not.toContain('m-wash')
    expect(listPage).toContain('<MobileLargeTitle')
    expect(listPage).toMatch(/class="m-body m-body--tabbed/)
  })

  it('shows the preferred configuration as a plain card that opens its detail page', () => {
    expect(listPage).toMatch(/<PreferredConfigCard v-if="preferredConfig"[\s\S]*?@open="handleView\(preferredConfig\)" \/>/)
    const card = read(join(modelsDir, 'PreferredConfigCard.vue'))
    expect(card).toContain('class="m-card preferred-card"')
    expect(card).not.toMatch(/gradient|shadow-floating/)
    // 测试连接和取消首选在详情页里
    expect(detailPage).toContain('testSavedConfigConnection(config.value)')
    expect(detailPage).toContain('@ionChange="handleTogglePreferred"')
  })

  it('keeps the empty state, pull to refresh and swipe actions', () => {
    expect(listPage).toContain('<EmptyAIConfigIllustration />')
    expect(listPage).toContain('@ionRefresh="handleRefresh"')
    expect(listPage).toMatch(/<ion-item-sliding v-for="config in configs"/)
    expect(listPage).toContain('@click="handleToggle(config, !config.enabled, $event)"')
    expect(listPage).toContain('@click="handleEdit(config, $event)"')
    expect(listPage).toContain('@click="handleDelete(config, $event)"')
  })

  it('still refreshes from data-layer changes and on view enter', () => {
    expect(listPage).toContain("onDataChange('ai_configs', scheduleRealtimeRefresh)")
    expect(listPage).toMatch(/onIonViewWillEnter\(\(\) => \{[\s\S]*?pendingRealtimeRefresh/)
    expect(listPage).toMatch(/onUnmounted\(\(\) => \{[\s\S]*?unsubscribeDataChanges\(\)/)
  })
})

describe('mobile model detail (V5-M-ModelDetail)', () => {
  it('switches enabled and preferred state with toggles; preferred needs an enabled config', () => {
    expect(detailPage).toMatch(/<ion-toggle :checked="config\.enabled"[\s\S]{0,120}@ionChange="handleToggleEnabled"/)
    expect(detailPage).toMatch(/<ion-toggle :checked="!!config\.isPreferred" :disabled="!config\.enabled"/)
    // 取消确认或保存失败时把开关拨回去
    expect(detailPage).toMatch(/if \(!changed\) \{\s*event\.target\.checked = !enabled/)
  })

  it('keeps default model choice, system prompt entry, edit, tests and delete', () => {
    expect(detailPage).toContain('@select="handleSelectModel"')
    expect(detailPage).toMatch(/handleSelectModel[\s\S]*?api\.aiConfigs\.update\.mutate\([\s\S]*?defaultModel: model/)
    expect(detailPage).toContain('router.push(`/ai-config/${config.value?.id}/system-prompt`)')
    expect(detailPage).toContain('router.push(`/ai-config/edit/${config.value.id}`)')
    expect(detailPage).toContain('testSavedConfigConnection(config.value)')
    expect(detailPage).toContain("api.aiConfigs.intelligentTest.mutate(config.value.id!, t('models.requestTestDefaultPrompt'))")
    expect(detailPage).toMatch(/if \(await actions\.deleteConfig\(config\.value\)\) \{\s*router\.back\(\)/)
  })

  it('confirms before disabling the preferred config and clears the preference', () => {
    expect(actions).toMatch(/if \(!enabled && config\.isPreferred\) \{[\s\S]*?disablePreferredTitle/)
    expect(actions).toMatch(/if \(!enabled && config\.isPreferred\) \{\s*await api\.aiConfigs\.clearPreferred\.mutate\(\)/)
    expect(actions).toMatch(/deleteConfig[\s\S]*?t\('aiConfig\.deleteConfirm', \{ name: config\.name \}\)/)
  })
})

describe('mobile model add/edit (V5-M-ModelEdit)', () => {
  it('uses cancel / save in the nav bar and guards unsaved changes, including the hardware back button', () => {
    expect(editPage).toContain('@click="handleCancel"')
    expect(editPage).toContain('class="m-save" :disabled="saving" @click="handleSave"')
    expect(editPage).toContain("t('aiConfig.workspace.unsavedEditorMessage')")
    expect(editPage).toMatch(/useBackButton\(10, \(\) => \{\s*handleCancel\(\)/)
  })

  it('offers every provider usable on mobile in a grouped sheet behind an "all" tile', () => {
    expect(editPage).toContain('<ProviderPickerSheet :open="showTypeModal" :groups="groups"')
    // 只能在桌面版使用的服务商不计入「全部」，面板底部说明原因
    expect(editPage).toContain("t('mobileModels.allProviders', { count: availableChoiceCount })")
    expect(editPage).toContain(':note="desktopOnlyNote"')
  })

  it('fills models from the connection test and lets the user pick the default model', () => {
    expect(editPage).toMatch(/if \(result\.models && result\.models\.length > 0\) \{[\s\S]*?formData\.models = formData\.defaultModel && !result\.models\.includes\(formData\.defaultModel\)/)
    expect(editPage).toMatch(/const handleModelChip[\s\S]*?formData\.defaultModel = model/)
    expect(editPage).toContain('@click="showAddModelAlert"')
    // #427：和桌面向导一致，不再有单独的「自定义模型」输入框
    expect(editPage).not.toContain('formData.customModel')
  })

  it('keeps the enabled state of an edited config instead of re-enabling it on save', () => {
    expect(editPage).toContain('enabled: isEditMode.value ? loadedEnabled.value : true')
  })
})

describe('mobile system prompt editor (V5-M-SystemPrompt)', () => {
  it('fills the screen with the editor and offers reset and save', () => {
    expect(promptPage).toMatch(/\.prompt-body \{[\s\S]*?min-height: 100%/)
    expect(promptPage).toMatch(/\.prompt-editor \{[\s\S]*?flex: 1/)
    expect(promptPage).toMatch(/handleReset[\s\S]*?systemPrompt\.value = defaultPrompt\.value/)
    expect(promptPage).toMatch(/handleSave[\s\S]*?api\.aiConfigs\.update\.mutate\([\s\S]*?systemPrompt: value/)
  })

  it('guards unsaved prompt edits on back', () => {
    expect(promptPage).toContain("t('aiConfig.workspace.unsavedPromptMessage')")
    expect(promptPage).toMatch(/useBackButton\(10, \(\) => \{\s*handleBack\(\)/)
  })
})

describe('mobile models design-system hygiene', () => {
  it('uses ionicons only and shared tokens instead of hard-coded colors', () => {
    for (const source of ownSources) {
      expect(source).not.toContain('@vicons/tabler')
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
      expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(styles).not.toMatch(/rgba?\(/)
    }
  })
})
