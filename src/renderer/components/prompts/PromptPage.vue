<template>
  <div ref="rootRef" class="prompt-page" :class="{ 'is-narrow': narrow, 'is-closable': closable }">
    <section class="prompt-page__main" :aria-label="form.title || t('promptLibrary.untitled')">
      <div v-if="compareVersion" class="prompt-page__compare-bar" role="status">
        <NIcon :size="16"><History /></NIcon>
        <span class="prompt-page__compare-text">
          {{ compareText }}
        </span>
        <NButton quaternary size="tiny" @click="compareVersion = null">{{ t('promptHistory.backToCurrent') }}</NButton>
        <NButton size="tiny" @click="copyText(compareVersion.content)">
          {{ t('promptHistory.copyVersion', { version: compareVersion.version }) }}
        </NButton>
        <NButton type="primary" size="tiny" :loading="editor.saving.value" @click="restoreVersion(compareVersion)">
          {{ t('promptHistory.restoreVersion', { version: compareVersion.version }) }}
        </NButton>
      </div>
      <UiWarnBar v-else-if="isNew">
        {{ generationIncomplete ? t('promptGenerate.incompleteNotice') : t('promptPage.newNotSaved') }}
        <template #actions>
          <NButton quaternary size="tiny" @click="requestDiscardNew">{{ t('promptPage.discard') }}</NButton>
          <NButton type="primary" size="tiny" :loading="editor.saving.value" @click="saveChanges">
            {{ t('promptPage.save') }}<span class="prompt-page__kbd">{{ saveShortcut }}</span>
          </NButton>
        </template>
      </UiWarnBar>
      <UiWarnBar v-else-if="editor.dirty.value">
        {{ t('promptPage.unsavedTemplate') }}
        <template #actions>
          <NButton quaternary size="tiny" @click="discardChanges">{{ t('promptPage.discard') }}</NButton>
          <NButton type="primary" size="tiny" :loading="editor.saving.value" @click="saveChanges">
            {{ t('promptPage.saveAsVersion') }}<span class="prompt-page__kbd">{{ saveShortcut }}</span>
          </NButton>
        </template>
      </UiWarnBar>

      <div class="prompt-page__scroll">
        <div class="prompt-page__document">
          <PromptHeader :form="form" :prompt="prompt" :categories="categories" :editing="headerEditing"
            :meta="metaText" :hint="headerHint" :tag-suggestions="tagSuggestions" :history-open="sideView === 'history'"
            :show-side-toggle="narrow" :show-library-toggle="showLibraryToggle" :can-set-shortcut="canSetShortcut"
            @toggle-favorite="emit('toggle-favorite')" @open-history="toggleHistory"
            @toggle-side-panel="openSideOverlay" @toggle-library="emit('toggle-library')" @switch-template="requestTemplateSwitch"
            @manage-categories="emit('manage-categories')"
            @add-images="files => files.forEach(file => editor.addImage(file))" @summarize="summarize"
            @set-shortcut="emit('set-shortcut')" @copy-raw="copyText(form.content, 'promptManagement.copyOriginalContentSuccess')" @delete="emit('delete')" />

          <!-- AI 生成的标题和描述先在这里预览，采纳后才写进表单 -->
          <div v-if="summaryPreview" class="prompt-summary-preview" role="group" :aria-label="t('promptAI.summaryPreviewTitle')">
            <div class="prompt-summary-preview__head">
              <NIcon :size="16" class="prompt-summary-preview__icon"><Stars /></NIcon>
              <span class="prompt-summary-preview__title">{{ t('promptAI.summaryPreviewTitle') }}</span>
            </div>
            <dl class="prompt-summary-preview__fields">
              <div v-for="field in summaryPreviewFields" :key="field.key" class="prompt-summary-preview__field">
                <dt>{{ field.label }}</dt>
                <dd>
                  <span class="prompt-summary-preview__value">{{ field.value }}</span>
                  <span v-if="field.previous" class="prompt-summary-preview__previous">
                    {{ t('promptAI.summaryPrevious', { value: field.previous }) }}
                  </span>
                </dd>
              </div>
            </dl>
            <div class="prompt-summary-preview__actions">
              <NButton @click="discardSummary">{{ t('promptAI.discard') }}</NButton>
              <NButton type="primary" @click="adoptSummary">{{ t('promptAI.adopt') }}</NButton>
            </div>
          </div>

          <div v-if="form.isJinjaTemplate && !compareVersion && !suggestion && jinjaView !== 'edit'" class="prompt-page__alert">
            <NIcon :size="16"><InfoCircle /></NIcon>
            <span>{{ t('promptPage.jinjaHint') }}</span>
          </div>

          <template v-if="compareVersion">
            <!-- 正文以外的改动：页头显示的是当前的标题和描述，这里列出这个版本和当前不一样的地方 -->
            <div v-if="compareFields.length" class="prompt-page__compare-fields" role="group"
              :aria-label="t('promptHistory.otherChanges')">
              <span class="ui-overline">{{ t('promptHistory.otherChanges') }}</span>
              <dl>
                <div v-for="field in compareFields" :key="field.key" class="prompt-page__compare-field">
                  <dt>{{ field.label }}</dt>
                  <dd>
                    <template v-if="field.text">{{ field.text }}</template>
                    <UiDiffText v-else :segments="field.segments" />
                  </dd>
                </div>
              </dl>
            </div>
            <div class="prompt-page__diff"><UiDiffText :segments="compareDiff" /></div>
            <div class="prompt-page__diff-summary">
              <span>{{ t('promptHistory.versionToCurrent', { version: compareVersion.version }) }}</span>
              <template v-if="compareSummary.addedLines || compareSummary.removedLines">
                <span class="is-insert">{{ t('promptHistory.addedLines', { count: compareSummary.addedLines }, compareSummary.addedLines) }}</span>
                <span class="is-delete">{{ t('promptHistory.removedLines', { count: compareSummary.removedLines }, compareSummary.removedLines) }}</span>
              </template>
              <span v-else>{{ t('promptHistory.bodyUnchanged') }}</span>
              <span v-if="compareSummary.addedVariables.length">
                {{ t('promptHistory.addedVariables', { names: compareSummary.addedVariables.join('、') }) }}
              </span>
              <span v-if="compareSummary.removedVariables.length">
                {{ t('promptHistory.removedVariables', { names: compareSummary.removedVariables.join('、') }) }}
              </span>
            </div>
          </template>
          <template v-else-if="suggestion">
            <div class="prompt-page__diff"><UiDiffText :segments="suggestionDiff" /></div>
            <span class="prompt-page__readonly-note">
              <NIcon :size="14"><Lock /></NIcon>{{ t('promptAI.readOnlyWhileSuggesting') }}
            </span>
          </template>
          <StructuredPromptEditor v-else-if="bodyEditable" ref="editorRef" bare :content="form.content"
            :variables="editorVariables" :selected-variable="expandedVariable" :source-only="form.isJinjaTemplate"
            :readonly="generating" :placeholder="t('promptPage.bodyPlaceholder')"
            @update:content="value => (form.content = value)" @select-variable="selectDefinition"
            @variable-inserted="selectDefinition" @variable-created="handleVariableCreated"
            @request-add-variable="addVariableAtCursor" />
          <PromptFillBody v-else :prompt="effectivePrompt" :values="values" :active-name="activeVariable"
            :jinja-view="jinjaView === 'rendered' ? 'rendered' : 'source'" @select="focusVariable" />

          <div v-if="imageUrls.length" class="prompt-page__images">
            <span class="prompt-page__images-label">{{ t('promptPage.images') }}</span>
            <div v-for="(url, index) in imageUrls" :key="url" class="prompt-page__image">
              <NImage :src="url" width="56" height="56" object-fit="cover" :alt="t('promptPage.imageAlt', { index: index + 1 })" />
              <button v-if="headerEditing" type="button" class="prompt-page__image-remove"
                :aria-label="t('promptPage.removeImage', { index: index + 1 })" @click="editor.removeImage(index)">
                <NIcon :size="12"><X /></NIcon>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="suggestion" class="prompt-page__bar">
        <NIcon :size="16" class="prompt-page__bar-icon"><Stars /></NIcon>
        <span class="prompt-page__bar-title">{{ t('promptAI.suggestion') }}</span>
        <!-- 指令文字占剩下的宽度，放不下时省略，悬停看全文；三个按钮始终留在这一行 -->
        <span class="prompt-page__bar-label" :title="suggestion.label">{{ suggestion.label }}</span>
        <!-- 增删的字数带上单位（版本对比里按行算，这里按字算） -->
        <span v-if="!suggestion.streaming" class="prompt-page__bar-counts">
          <span class="prompt-page__bar-added">+{{ suggestionSummary.addedChars }}</span>
          <span v-if="suggestionSummary.removedChars" class="prompt-page__bar-removed">−{{ suggestionSummary.removedChars }}</span>
          <span>{{ t('promptAI.charUnit', { count: suggestionCharCount }, suggestionCharCount) }}</span>
        </span>
        <span v-else class="prompt-page__bar-status"><NSpin :size="14" />{{ t('promptAI.generatingSuggestion') }}</span>
        <div class="prompt-page__bar-actions">
          <NButton quaternary @click="ai.discard()">{{ t('promptAI.discard') }}</NButton>
          <NButton :disabled="suggestion.streaming" @click="ai.regenerate()">{{ t('promptAI.regenerate') }}</NButton>
          <NButton type="primary" size="large" :disabled="suggestion.streaming" @click="adoptSuggestion">{{ t('promptAI.adopt') }}</NButton>
        </div>
      </div>
      <div v-else-if="!compareVersion" class="prompt-page__bar">
        <UiSegmented v-if="form.isJinjaTemplate" v-model="jinjaView" :options="jinjaViewOptions" :label="t('promptPage.bodyView')" />
        <UiSegmented v-else :model-value="mode" :options="modeOptions" :label="t('promptPage.bodyView')"
          @update:model-value="setMode" />
        <!-- 状态文字占剩下的宽度，放不下时省略，悬停看全文；复制按钮始终留在这一行 -->
        <span class="prompt-page__status" :class="{ 'is-warning': statusWarning }" :title="statusText">{{ statusText }}</span>
        <!-- 试运行和复制是一组：窄到要换行时整组靠右换到下一行，复制不会单独掉到左边 -->
        <div class="prompt-page__bar-actions">
          <NButton v-if="!isNew && ai.models.hasModels.value" quaternary @click="tryRun">
            <template #icon><NIcon :size="16"><PlayerPlay /></NIcon></template>
            {{ t('promptAI.run') }}
          </NButton>
          <UiSplitButton :options="copyOptions" :menu-label="t('promptPage.moreCopyOptions')" :shortcut="copyShortcut"
            :disabled="isNew || !form.content.trim()" @click="copyPrompt" @select="handleCopyOption">
            {{ t('promptPage.copy') }}
          </UiSplitButton>
        </div>
      </div>
    </section>

    <div v-if="narrow && sideOverlayOpen" class="prompt-page__scrim" @click="closeSideOverlay" />
    <aside v-show="!narrow || sideOverlayOpen" ref="sideRef" class="prompt-page__side" :class="{ 'is-overlay': narrow }"
      :aria-label="t('promptPage.sidePanel')">
      <!-- 窄宽度下历史是从标题旁的按钮以浮层打开的，关掉历史时浮层一起收起 -->
      <PromptHistoryPanel v-if="sideView === 'history'" :versions="versions" :loading="versionsLoading"
        :current-recorded="currentRecorded"
        :selected-id="compareVersion?.id ?? null" @select="version => (compareVersion = version)"
        @close="closeHistoryPanel" @update-description="updateVersionDescription" />
      <template v-else>
        <div class="prompt-page__tabs">
          <!-- 浮层模式下的收起按钮放在最左边，和弹窗右上角的关闭按钮分开 -->
          <NTooltip v-if="narrow" :show-arrow="false">
            <template #trigger>
              <NButton quaternary size="tiny" class="prompt-page__side-collapse" :aria-label="t('promptPage.hideSidePanel')"
                @click="closeSideOverlay">
                <template #icon><NIcon :size="16"><LayoutSidebarRightCollapse /></NIcon></template>
              </NButton>
            </template>
            {{ t('promptPage.hideSidePanel') }}
          </NTooltip>
          <div class="prompt-page__tablist" role="tablist" :aria-label="t('promptPage.sidePanel')">
            <button type="button" role="tab" class="prompt-page__tab" :class="{ 'is-active': sideTab === 'variables' }"
              :aria-selected="sideTab === 'variables'" @click="sideTab = 'variables'">
              {{ t('promptPage.variablesTab') }}<UiCount :value="variableCount" />
            </button>
            <button v-if="isNew" type="button" role="tab" class="prompt-page__tab" :class="{ 'is-active': sideTab === 'generate' }"
              :aria-selected="sideTab === 'generate'" @click="sideTab = 'generate'">
              <NIcon :size="14"><Stars /></NIcon>{{ t('promptGenerate.tab') }}
            </button>
            <button v-else type="button" role="tab" class="prompt-page__tab" :class="{ 'is-active': sideTab === 'ai' }"
              :aria-selected="sideTab === 'ai'" @click="sideTab = 'ai'">
              <NIcon :size="14"><Stars /></NIcon>AI
            </button>
          </div>
          <PromptSideActions :kind="sideTab !== 'variables' ? 'model' : showDefinitions ? 'definitions' : 'fill'"
            :show-usage="Boolean(prompt?.id)" :can-clear="variableCount > 0"
            :model-disabled="ai.running.value || generation.generating.value" @add-variable="addVariableAtCursor"
            @open-usage="openUsage" @clear="clearValues" @connect="emit('navigate-to-ai-config')" />
        </div>

        <div v-if="sideTab === 'variables'" class="prompt-page__side-body">
          <div class="prompt-page__side-scroll">
            <VariableDefinitionList v-if="showDefinitions" v-model:expanded-name="expandedVariable"
              :variables="editor.activeVariables.value" :unused="editor.unusedVariables.value" :occurrences="occurrences"
              :jinja="form.isJinjaTemplate" @update="updateDefinition" @remove="editor.removeVariable" />
            <VariableFieldList v-else ref="fieldListRef" :variables="variables" :values="values"
              :multiline-names="multilineNames" :sources="valueSources" :reveal-missing="revealedMissing"
              :active-name="activeVariable" :jinja="form.isJinjaTemplate" @update:values="updateValues"
              @focus="name => (activeVariable = name)"
              @blur="revealIfRequired" />
          </div>
          <p class="ui-help prompt-page__side-help">{{ showDefinitions ? t('promptPage.definitionsHelp') : t('promptPage.fieldsHelp') }}</p>
        </div>
        <PromptAIPanel v-else-if="sideTab === 'ai'" :session="ai" :quick-configs="quickConfigs" :can-run="canRun" :run-hint="runHint"
          :can-edit="Boolean(form.content.trim())" :summarizing="summarizing" @run="tryRun" @summarize="summarize"
          @open-optimization-config="emit('open-quick-optimization-config')" @connect-model="emit('navigate-to-ai-config')" />
        <PromptGeneratePanel v-else ref="generatePanelRef" :generation="generation" :variable-names="variableNames"
          :initial-description="initialDescription" @generate="generateFromDescription" @use-history="useGenerationHistory"
          :revertable="incompleteContent" @revert="revertGeneration" @connect-model="emit('navigate-to-ai-config')" />
      </template>
    </aside>

    <!-- 在弹窗里打开时，关闭按钮固定在弹窗右上角，不随正文滚动 -->
    <NTooltip v-if="closable" :show-arrow="false">
      <template #trigger>
        <NButton quaternary size="small" class="prompt-page__close" :aria-label="t('common.close')" @click="emit('close')">
          <template #icon><NIcon :size="16"><X /></NIcon></template>
        </NButton>
      </template>
      {{ t('common.close') }}
    </NTooltip>

    <UsageHistoryDrawer v-model:show="usageOpen" :records="usageRecords" @restore="restoreUsage" @delete="deleteUsage"
      @clear="clearUsage" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NImage, NSpin, NTooltip, useDialog, useMessage, type DropdownOption } from 'naive-ui'
import { History, InfoCircle, LayoutSidebarRightCollapse, Lock, PlayerPlay, Stars, X } from '@vicons/tabler'
import type { AIGenerationHistory, QuickOptimizationConfig } from '@shared/types/ai'
import type { AISummaryResult } from '@/lib/utils/ai-summary'
import type { Category, PromptHistory, PromptWithRelations } from '@shared/types/database'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import { api } from '@/lib/api'
import UiCount from '@/components/ui/UiCount.vue'
import UiDiffText from '@/components/ui/UiDiffText.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSplitButton from '@/components/ui/UiSplitButton.vue'
import UiWarnBar from '@/components/ui/UiWarnBar.vue'
import StructuredPromptEditor from '@/components/prompt-management/StructuredPromptEditor.vue'
import { useElementWidth } from '@/composables/useElementWidth'
import { usePromptEditor } from '@/composables/prompt/usePromptEditor'
import { usePromptAISession } from '@/composables/prompt/usePromptAISession'
import { usePromptGeneration } from '@/composables/prompt/usePromptGeneration'
import { displayShortcutHint } from '@/lib/utils/accelerator'
import { formatFriendlyDate } from '@/lib/utils/date'
import { createEditorForm, historyMatchesPrompt, serializeVariablesForSave } from '@/lib/utils/prompt-editor'
import { compareVersionFields, type VersionFieldKey } from '@/lib/utils/prompt-history-display'
import type { DiffSegment } from '@/components/ui/types'
import {
  applyChangedDefaults, createPromptDraft, findMultilineVariableNames, getActivePromptVariables, getMissingPromptVariables,
  isEmptyPromptValue, parsePromptTemplate, renderPrompt,
} from '@/lib/utils/prompt-template'
import {
  clearPromptUsageHistory, deletePromptUsageRecord, getLastUsedValues, readPromptUsageHistory, recordPromptUsage,
  type PromptUsageRecord,
} from '@/lib/utils/prompt-usage'
import { diffText, summarizePromptChange } from '@/lib/utils/text-diff'
import { hasOpenFloatingLayer, isEscapeConsumed } from '@/lib/utils/escape-layers'
import PromptAIPanel from './PromptAIPanel.vue'
import PromptFillBody from './PromptFillBody.vue'
import PromptGeneratePanel from './PromptGeneratePanel.vue'
import PromptHeader from './PromptHeader.vue'
import PromptHistoryPanel from './PromptHistoryPanel.vue'
import PromptSideActions from './PromptSideActions.vue'
import UsageHistoryDrawer from './UsageHistoryDrawer.vue'
import VariableDefinitionList from './VariableDefinitionList.vue'
import VariableFieldList from './VariableFieldList.vue'
import type { PromptBodyMode } from './types'

// 窄于这个宽度时右侧面板改成浮层，由标题旁的按钮打开
const SIDE_PANEL_OVERLAY_WIDTH = 860

const props = withDefaults(defineProps<{
  /** 已保存的提示词；新建时为 null */
  prompt: PromptWithRelations | null
  categories: Category[]
  /** 变量的填写值，由提示词区按提示词保存，切换回来时还在 */
  draft: Record<string, any>
  /** 所有提示词的标签，编辑标签时作为候选 */
  tagSuggestions?: string[]
  initialMode?: PromptBodyMode
  /** 空库引导页带过来的 AI 生成描述 */
  initialDescription?: string
  /** 带着描述进来时是否直接开始生成；「手动编写」不生成，描述填进描述栏，同时预填在 AI 生成输入框里 */
  autoGenerate?: boolean
  closable?: boolean
  /** 在弹窗里打开时由弹窗决定是否响应 ⌘↵ / ⌘S */
  shortcutsEnabled?: boolean
  canSetShortcut?: boolean
  /** 窄宽度下提示词列表收进抽屉时，页头左边放一个打开列表的按钮 */
  showLibraryToggle?: boolean
  /** 在某个分类里新建时默认用的分类 */
  defaultCategoryId?: number | null
}>(), {
  tagSuggestions: () => [],
  initialMode: 'fill',
  initialDescription: '',
  autoGenerate: true,
  closable: false,
  shortcutsEnabled: true,
  canSetShortcut: false,
  showLibraryToggle: false,
  defaultCategoryId: null,
})

const emit = defineEmits<{
  'update:draft': [values: Record<string, any>]
  saved: [prompt: PromptWithRelations]
  updated: [prompt: PromptWithRelations]
  'toggle-favorite': []
  delete: []
  close: []
  'discard-new': []
  'set-shortcut': []
  'open-quick-optimization-config': []
  'navigate-to-ai-config': []
  'dirty-change': [dirty: boolean]
  'toggle-library': []
  'manage-categories': []
}>()

const { t, locale } = useI18n()
const message = useMessage()
const dialog = useDialog()

const promptRef = toRef(props, 'prompt')
const editor = usePromptEditor(promptRef)
const form = editor.form
const effectivePrompt = editor.effectivePrompt
const isNew = computed(() => !props.prompt?.id)

// 在某个分类里新建时默认放进这个分类；这是草稿的初始状态，不算未保存的修改
if (isNew.value && props.defaultCategoryId) {
  form.value.categoryId = props.defaultCategoryId
  editor.markClean()
}

const rootRef = ref<HTMLElement>()
const rootWidth = useElementWidth(rootRef)
const narrow = computed(() => rootWidth.value > 0 && rootWidth.value < SIDE_PANEL_OVERLAY_WIDTH)
const sideOverlayOpen = ref(false)
const sideRef = ref<HTMLElement>()
// 浮层打开前有焦点的控件（标题旁的按钮、历史按钮），收起后焦点回到这里
let overlayReturnFocus: HTMLElement | null = null

watch(sideOverlayOpen, open => {
  if (!open) return
  const active = document.activeElement
  overlayReturnFocus = active instanceof HTMLElement && active !== document.body && !sideRef.value?.contains(active) ? active : null
})

/** 标题旁的按钮打开浮层：焦点移到浮层的收起按钮，键盘用户可以直接 Tab 进面板 */
const openSideOverlay = async () => {
  sideOverlayOpen.value = true
  await nextTick()
  sideRef.value?.querySelector<HTMLElement>('.prompt-page__side-collapse')?.focus()
}

const closeSideOverlay = () => {
  if (!sideOverlayOpen.value) return
  sideOverlayOpen.value = false
  // 历史是单独以浮层打开的：收起时一起关掉，免得窗口变宽后又冒出来；正在对比某个版本时留着对比
  if (sideView.value === 'history' && !compareVersion.value) sideView.value = 'tabs'
  const target = overlayReturnFocus
  overlayReturnFocus = null
  if (target?.isConnected) target.focus()
}

const mode = ref<PromptBodyMode>(isNew.value ? 'edit' : props.initialMode)
const jinjaView = ref<'source' | 'rendered' | 'edit'>(isNew.value ? 'edit' : 'source')
const sideTab = ref<'variables' | 'ai' | 'generate'>(isNew.value ? 'generate' : 'variables')
const sideView = ref<'tabs' | 'history'>('tabs')
const activeVariable = ref('')
const expandedVariable = ref('')
const revealedMissing = ref(new Set<string>())
const editorRef = ref<InstanceType<typeof StructuredPromptEditor>>()
const fieldListRef = ref<InstanceType<typeof VariableFieldList>>()
const generatePanelRef = ref<InstanceType<typeof PromptGeneratePanel>>()

const copyShortcut = displayShortcutHint('⌘↵', 'Ctrl+Enter')
const saveShortcut = displayShortcutHint('⌘S', 'Ctrl+S')

// ---------- 显示模式 ----------
const headerEditing = computed(() => isNew.value || (form.value.isJinjaTemplate ? jinjaView.value === 'edit' : mode.value === 'edit'))
const bodyEditable = computed(() => headerEditing.value)
const showDefinitions = computed(() => headerEditing.value)

const modeOptions = computed(() => [
  { value: 'fill' as PromptBodyMode, label: t('promptPage.modeFill'), disabled: isNew.value },
  { value: 'edit' as PromptBodyMode, label: t('promptPage.modeEdit') },
])
const jinjaViewOptions = computed(() => [
  { value: 'source' as const, label: t('promptPage.jinjaSource'), disabled: isNew.value },
  { value: 'rendered' as const, label: t('promptPage.jinjaRendered'), disabled: isNew.value },
  { value: 'edit' as const, label: t('promptPage.jinjaEdit') },
])

const setMode = (next: PromptBodyMode) => {
  mode.value = next
  if (next === 'edit') sideTab.value = sideTab.value === 'ai' ? 'ai' : 'variables'
}

// ---------- 变量与填写值 ----------
const variables = computed(() => getActivePromptVariables(effectivePrompt.value))
const variableCount = computed(() => variables.value.length)
const variableNames = computed(() => variables.value.map(variable => variable.name))
const editorVariables = computed(() => [...editor.activeVariables.value, ...editor.unusedVariables.value])
const multilineNames = computed(() => (form.value.isJinjaTemplate ? new Set<string>() : findMultilineVariableNames(form.value.content)))
const occurrences = computed(() => Object.fromEntries(
  [...parsePromptTemplate(form.value.content).occurrences.entries()].map(([name, list]) => [name, list.length]),
))
const values = computed(() => props.draft)
const lastUsedValues = ref<Record<string, any>>({})

const valueSources = computed(() => {
  const sources: Record<string, 'last' | 'default'> = {}
  variables.value.forEach(variable => {
    const value = values.value[variable.name]
    if (isEmptyPromptValue(value)) return
    if (!isEmptyPromptValue(lastUsedValues.value[variable.name]) && String(lastUsedValues.value[variable.name]) === String(value)) {
      sources[variable.name] = 'last'
    } else if (variable.defaultValue && String(variable.defaultValue) === String(value)) {
      sources[variable.name] = 'default'
    }
  })
  return sources
})

const missing = computed(() => getMissingPromptVariables(variables.value, values.value))
const rendered = computed(() => renderPrompt(effectivePrompt.value, values.value, variables.value))
const canRun = computed(() => !missing.value.length && Boolean(rendered.value.content.trim()) && !rendered.value.error)

const updateValues = (next: Record<string, any>) => emit('update:draft', next)

// 打开提示词时用上次复制的值预填，没有记录的变量用默认值
const initializeValues = () => {
  const id = props.prompt?.id
  lastUsedValues.value = id ? getLastUsedValues(id) : {}
  const known = new Set(variables.value.map(variable => variable.name))
  const lastUsed = Object.fromEntries(Object.entries(lastUsedValues.value)
    .filter(([name, value]) => known.has(name) && !isEmptyPromptValue(value)))
  const hasDraft = Object.keys(props.draft).length > 0
  const next = createPromptDraft(variables.value, hasDraft ? props.draft : lastUsed)
  if (JSON.stringify(next) !== JSON.stringify(props.draft)) emit('update:draft', next)
}

// 改名时填写值跟着变量走：记下「旧名 → 新名」，等变量名变了再在下面的 watch 里把值挪过去
const pendingRenames = new Map<string, string>()
// 上次保存以来改过名的变量：现在的名字 → 保存时的名字，放弃修改时把值挪回去
const renamedSinceSave = new Map<string, string>()

const updateDefinition = (previousName: string, variable: EditablePromptVariable) => {
  if (variable.name !== previousName) {
    pendingRenames.set(previousName, variable.name)
    const original = renamedSinceSave.get(previousName) ?? previousName
    renamedSinceSave.delete(previousName)
    if (original !== variable.name) renamedSinceSave.set(variable.name, original)
  }
  editor.updateVariable(previousName, variable)
}

// 编辑时新加的变量也要有填写值，否则填写面板和正文对不上；改了名的变量带上原来的填写值
watch(variableNames, () => {
  const base = { ...props.draft }
  pendingRenames.forEach((next, previous) => {
    if (!(previous in base)) return
    if (!isEmptyPromptValue(base[previous])) base[next] = base[previous]
    delete base[previous]
  })
  pendingRenames.clear()
  const next = createPromptDraft(variables.value, base)
  if (JSON.stringify(next) !== JSON.stringify(props.draft)) emit('update:draft', next)
})

// 改了默认值时，还空着或仍是旧默认值的填写值跟着换成新默认值，新建保存后不用刷新就能用上；
// 切换提示词时只记下新的定义，填写值由 initializeValues 处理
const promptKey = computed(() => `${props.prompt?.id ?? 'new'}:${props.prompt?.uuid ?? ''}`)
let defaultsSnapshot = { key: '', variables: [] as typeof variables.value }
watch(() => [promptKey.value, variables.value] as const, ([key, list]) => {
  const previous = defaultsSnapshot
  defaultsSnapshot = { key, variables: list.map(variable => ({ ...variable })) }
  if (previous.key !== key) return
  const next = applyChangedDefaults(previous.variables, list, props.draft)
  if (next) emit('update:draft', next)
}, { immediate: true })

const revealIfRequired = (name: string) => {
  const variable = variables.value.find(item => item.name === name)
  if (variable?.required) revealedMissing.value = new Set([...revealedMissing.value, name])
}

const clearValues = () => {
  emit('update:draft', createPromptDraft(variables.value, {}))
  revealedMissing.value = new Set()
}

const focusVariable = async (name: string) => {
  activeVariable.value = name
  sideView.value = 'tabs'
  sideTab.value = 'variables'
  if (narrow.value) sideOverlayOpen.value = true
  // 从 AI 页签过来时变量面板还没渲染出来，等它挂上再定位
  if (!fieldListRef.value) await nextTick()
  await fieldListRef.value?.focusField(name)
}

const selectDefinition = (name: string) => {
  expandedVariable.value = name
  sideView.value = 'tabs'
  sideTab.value = 'variables'
  if (narrow.value) sideOverlayOpen.value = true
}

// 在正文里用 `{{名字` 新建了变量：切到变量页签并展开它，马上能设类型；窄宽度下不弹出浮层，免得挡住正在输入的正文
const handleVariableCreated = (name: string) => {
  expandedVariable.value = name
  sideView.value = 'tabs'
  sideTab.value = 'variables'
}

const addVariableAtCursor = async () => {
  if (!bodyEditable.value) {
    if (form.value.isJinjaTemplate) jinjaView.value = 'edit'
    else mode.value = 'edit'
    await nextTick()
  }
  const name = editor.addVariable()
  expandedVariable.value = name
  await nextTick()
  editorRef.value?.insertVariable(form.value.isJinjaTemplate ? ` ${name} ` : name)
}

// ---------- 底部状态 ----------
const statusWarning = computed(() => !headerEditing.value && missing.value.length > 0)
const statusText = computed(() => {
  if (isNew.value) {
    return variableCount.value
      ? t('promptPage.recognizedVariables', { count: variableCount.value }, variableCount.value)
      : t('promptPage.insertHint')
  }
  if (headerEditing.value) return form.value.isJinjaTemplate ? t('promptPage.jinjaEditHint') : t('promptPage.insertHint')
  if (form.value.isJinjaTemplate && rendered.value.error) return t('promptPage.jinjaInvalid')
  const total = variableCount.value
  if (!total) return t('promptPage.noVariablesStatus')
  const filled = variables.value.filter(variable => !isEmptyPromptValue(values.value[variable.name])).length
  const progress = t('promptPage.filledProgress', { filled, total }, filled)
  if (form.value.isJinjaTemplate && filled === total) return `${progress} · ${t('promptPage.jinjaValid')}`
  if (!missing.value.length) return progress
  // 变量名的引号和分隔符跟着界面语言走（中文「a」「b」，英文 “a”, “b”）
  const names = new Intl.ListFormat(locale.value, { type: 'unit', style: /^(zh|ja)/.test(locale.value) ? 'narrow' : 'short' })
    .format(missing.value.map(name => t('promptPage.missingName', { name })))
  return `${progress} · ${t('promptPage.stillMissing', { names })}`
})

// 标题、描述、分类是 AI 生成正文后自动补上的，才提示「由 AI 建议」；手动新建不显示
const headerSuggested = ref(false)
const headerHint = computed(() => (isNew.value && headerSuggested.value ? t('promptPage.aiSuggestedHint') : ''))

const metaText = computed(() => {
  const prompt = props.prompt
  if (!prompt?.id) return ''
  const parts = [
    t('promptPage.usedTimes', { count: prompt.useCount || 0 }, prompt.useCount || 0),
    t('promptPage.updatedAt', { date: formatFriendlyDate(prompt.updatedAt, locale.value, { withTime: false, capitalize: false }) }),
  ]
  if (latestVersion.value && currentRecorded.value) parts.push(`v${latestVersion.value}`)
  return parts.join(' · ')
})

// ---------- 复制 ----------
const copyOptions = computed<DropdownOption[]>(() => [{ key: 'raw', label: t('promptPage.copyRaw') }])

const copyText = async (text: string, successKey = 'promptPage.copied') => {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t(successKey))
  } catch {
    message.error(t('promptManagement.detailModal.copyFailed'))
  }
}

const copyPrompt = async () => {
  if (isNew.value || !form.value.content.trim()) return
  if (missing.value.length) {
    revealedMissing.value = new Set([...revealedMissing.value, ...missing.value])
    if (headerEditing.value) setMode('fill')
    await focusVariable(missing.value[0])
    message.warning(t('promptWorkspace.completeRequiredCount', { count: missing.value.length }, missing.value.length))
    return
  }
  if (rendered.value.error) {
    message.error(t('promptWorkspace.renderFailedWithError', { error: rendered.value.error }))
    return
  }
  try {
    await navigator.clipboard.writeText(rendered.value.content)
    if (props.prompt?.id) {
      const updated = await recordPromptUsage({
        promptId: props.prompt.id,
        content: rendered.value.content,
        variables: { ...values.value },
        incrementUseCount: id => api.prompts.incrementUseCount.mutate(id),
      })
      lastUsedValues.value = { ...values.value }
      emit('updated', updated as PromptWithRelations)
    }
    message.success(t('promptPage.copiedAndRecorded'))
  } catch (error) {
    console.error(error)
    message.error(t('promptManagement.detailModal.copyFailed'))
  }
}

const handleCopyOption = (key: string | number) => {
  if (key === 'raw') void copyText(form.value.content, 'promptManagement.copyOriginalContentSuccess')
}

// ---------- 保存 ----------
let pendingChangeDescription = ''

const focusTitleInput = async () => {
  if (!headerEditing.value) {
    if (form.value.isJinjaTemplate) jinjaView.value = 'edit'
    else mode.value = 'edit'
    await nextTick()
  }
  const input = rootRef.value?.querySelector<HTMLInputElement>('.prompt-header__title-input')
  input?.focus()
  input?.select()
}

/** 已有同名提示词时先问用户：仍然保存（标题允许重复），或者回去改标题 */
const confirmDuplicateTitle = (title: string) => new Promise<boolean>(resolve => {
  let result: boolean | null = null
  const finish = (value: boolean) => {
    if (result !== null) return
    result = value
    resolve(value)
  }
  dialog.warning({
    title: t('promptPage.duplicateTitleTitle'),
    content: t('promptPage.duplicateTitleMessage', { title }),
    positiveText: t('promptPage.duplicateTitleSave'),
    negativeText: t('promptPage.duplicateTitleRename'),
    onPositiveClick: () => finish(true),
    onNegativeClick: () => finish(false),
    onClose: () => finish(false),
    // 点遮罩、按 Esc 也算「修改标题」；弹窗离场时会把焦点还给原处，晚一拍再把焦点放到标题上
    onAfterLeave: () => {
      finish(false)
      if (!result) window.setTimeout(() => void focusTitleInput())
    },
  })
})

const saveChanges = async () => {
  const saved = await editor.save({ changeDescription: pendingChangeDescription || undefined, confirmDuplicateTitle })
  if (!saved) return
  pendingChangeDescription = ''
  renamedSinceSave.clear()
  // 新建时 prompt 换成刚保存的这条后会在切换提示词时重新加载
  if (!isNew.value) void loadVersions()
  emit('saved', saved)
}

const discardChanges = () => {
  // 改过名的变量回到原名，填写值也挪回去
  renamedSinceSave.forEach((original, current) => pendingRenames.set(current, original))
  renamedSinceSave.clear()
  editor.discard()
  pendingChangeDescription = ''
  // 放弃时撤掉的变量（比如刚改的名字）不再保持展开
  if (!form.value.variables.some(variable => variable.name === expandedVariable.value)) expandedVariable.value = ''
}

/**
 * 新建草稿顶部的「放弃」：草稿里填过东西（包括只选了分类、加了标签）时先确认一次，
 * 工作台和弹窗一样；确认后外层直接丢掉草稿，不再问第二次
 */
const requestDiscardNew = () => {
  if (!editor.dirty.value) {
    emit('discard-new')
    return
  }
  dialog.warning({
    title: t('promptPage.discardNewTitle'),
    content: t('promptPage.discardNewMessage'),
    positiveText: t('promptPage.discard'),
    negativeText: t('promptWorkspace.continueEditing'),
    onPositiveClick: () => emit('discard-new'),
  })
}

const requestTemplateSwitch = (jinja: boolean) => {
  const apply = () => {
    editor.setTemplateType(jinja)
    jinjaView.value = 'edit'
    mode.value = 'edit'
  }
  // 正文和变量设置都会被清掉：两样都是空的才不用确认
  if (!form.value.content.trim() && !form.value.variables.length) return apply()
  dialog.warning({
    title: jinja ? t('promptPage.switchToJinjaTitle') : t('promptPage.switchToRegularTitle'),
    content: t('promptPage.switchTemplateMessage'),
    positiveText: t('promptPage.clearAndSwitch'),
    negativeText: t('common.cancel'),
    onPositiveClick: apply,
  })
}

// ---------- 附图 ----------
const imageUrls = ref<string[]>([])
watch(() => form.value.imageBlobs, blobs => {
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageUrls.value = blobs.filter(blob => blob instanceof Blob && blob.size > 0).map(blob => URL.createObjectURL(blob))
}, { immediate: true })

// ---------- AI ----------
const quickConfigs = ref<QuickOptimizationConfig[]>([])
const summarizing = ref(false)
const ai = usePromptAISession({
  content: () => form.value.content,
  rendered: () => rendered.value.content,
  title: () => form.value.title,
})
const suggestion = ai.suggestion
const suggestionDiff = computed(() => (
  suggestion.value ? diffText(suggestion.value.original, suggestion.value.proposed || suggestion.value.original) : []
))
const suggestionSummary = computed(() => (
  suggestion.value ? summarizePromptChange(suggestion.value.original, suggestion.value.proposed) : summarizePromptChange('', '')
))
// 单位的单复数跟着较大的那个数走（英文、意大利语）
const suggestionCharCount = computed(() => Math.max(suggestionSummary.value.addedChars, suggestionSummary.value.removedChars))

const loadQuickConfigs = async () => {
  try {
    quickConfigs.value = await api.quickOptimizationConfigs.getEnabled.query()
  } catch {
    quickConfigs.value = []
  }
}

// 不能直接试运行的原因：AI 页签的「试运行」悬停时说明，点了和底部按钮一样跳到没填的变量
const runHint = computed(() => {
  if (canRun.value) return ''
  if (missing.value.length) return t('promptAI.runNeedsValues')
  return rendered.value.error ? t('promptPage.jinjaInvalid') : ''
})

const tryRun = async () => {
  sideView.value = 'tabs'
  sideTab.value = 'ai'
  if (narrow.value) sideOverlayOpen.value = true
  if (!canRun.value) {
    if (missing.value.length) await copyPrompt()
    else if (rendered.value.error) message.error(t('promptWorkspace.renderFailedWithError', { error: rendered.value.error }))
    return
  }
  await ai.run()
}

const adoptSuggestion = () => {
  const adopted = ai.adopt()
  if (!adopted) return
  form.value.content = adopted.proposed
  pendingChangeDescription = t('promptHistory.adoptedAI', { label: adopted.label })
  message.success(isNew.value ? t('promptAI.adopted') : t('promptAI.adoptedSaveHint'))
}

// ---------- AI 生成标题和描述 ----------
const summaryPreview = ref<AISummaryResult | null>(null)

const requestSummary = async (echo: boolean) => {
  if (summarizing.value) return null
  summarizing.value = true
  try {
    return await ai.summarize(props.categories.map(category => category.name), { echo })
  } finally {
    summarizing.value = false
  }
}

const findSummaryCategory = (result: AISummaryResult) => (
  result.category ? props.categories.find(item => item.name === result.category) : undefined
)

// 预览里列出会写进表单的字段；分类只在还没选分类时才会用上
const summaryPreviewFields = computed(() => {
  const result = summaryPreview.value
  if (!result) return []
  const fields = [{ key: 'title', label: t('promptPage.titleLabel'), value: result.title, previous: form.value.title.trim() }]
  if (result.description) {
    fields.push({ key: 'description', label: t('promptPage.descriptionLabel'), value: result.description, previous: form.value.description.trim() })
  }
  const category = findSummaryCategory(result)
  if (category?.id && !form.value.categoryId) fields.push({ key: 'category', label: t('promptAI.summaryCategory'), value: category.name, previous: '' })
  return fields.map(field => ({ ...field, previous: field.previous === field.value ? '' : field.previous }))
})

/** 用户点「生成标题和描述」：结果先预览，采纳后才写进表单，不自动保存 */
const summarize = async () => {
  sideView.value = 'tabs'
  const result = await requestSummary(true)
  if (!result) return
  summaryPreview.value = result
  // 窄窗口下右侧面板是浮层，会挡住正文上方的预览
  if (narrow.value) sideOverlayOpen.value = false
}

const adoptSummary = () => {
  const result = summaryPreview.value
  if (!result) return
  summaryPreview.value = null
  ai.resolveSummary(true)
  form.value.title = result.title
  if (result.description) form.value.description = result.description
  const category = findSummaryCategory(result)
  if (category?.id && !form.value.categoryId) form.value.categoryId = category.id
  if (!isNew.value) pendingChangeDescription = t('promptHistory.aiSummary')
  message.success(isNew.value ? t('promptAI.summaryAdopted') : t('promptAI.adoptedSaveHint'))
}

const discardSummary = () => {
  summaryPreview.value = null
  ai.resolveSummary(false)
}

/** 生成正文后补标题、描述和分类：只填空着的，用户已经写好的不动。返回现在有没有标题 */
const fillSummaryBlanks = async () => {
  if (!form.value.title.trim() || !form.value.description.trim()) {
    const result = await requestSummary(false)
    if (result) {
      if (!form.value.title.trim()) form.value.title = result.title
      if (!form.value.description.trim() && result.description) form.value.description = result.description
      const category = findSummaryCategory(result)
      if (category?.id && !form.value.categoryId) form.value.categoryId = category.id
      headerSuggested.value = true
    }
  }
  return Boolean(form.value.title.trim())
}

// ---------- 新建：AI 生成 ----------
const generation = usePromptGeneration()
const generating = computed(() => generation.generating.value)
// 正文是不是停止或中途断开后留下的、没写完的 AI 内容；是的话顶部提示条要说清楚，生成面板给「撤回」
const incompleteContent = ref(false)
const generationIncomplete = computed(() => isNew.value && incompleteContent.value)
// 撤回时恢复成这份正文：开始生成前用户自己的正文（连续重试时不会变成上一次没写完的内容）
let contentBeforeGeneration = ''
// 最近一次由 AI 写进正文的内容；正文和它不一样说明用户写过或改过
let generatedContent = ''

/** 正文里有用户写的内容时，AI 替换前先确认；空正文或 AI 刚写进去、没动过的内容直接替换 */
const confirmReplaceContent = () => new Promise<boolean>(resolve => {
  const current = form.value.content.trim()
  if (!current || current === generatedContent.trim()) {
    resolve(true)
    return
  }
  let settled = false
  const finish = (value: boolean) => {
    if (settled) return
    settled = true
    resolve(value)
  }
  dialog.warning({
    title: t('promptGenerate.replaceTitle'),
    content: t('promptGenerate.replaceMessage'),
    positiveText: t('promptGenerate.replaceConfirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => finish(true),
    onNegativeClick: () => finish(false),
    onClose: () => finish(false),
    onAfterLeave: () => finish(false),
  })
})

const generateFromDescription = async (description: string) => {
  if (generation.generating.value) return
  if (!generation.models.selected.value) {
    message.warning(t('promptWorkspace.selectModelFirst'))
    generatePanelRef.value?.setDescription(description)
    return
  }
  if (!(await confirmReplaceContent())) {
    // 取消时把描述放回输入框，方便改完正文再生成
    generatePanelRef.value?.setDescription(description)
    return
  }
  const previous = { content: form.value.content, generated: generatedContent, incomplete: incompleteContent.value }
  const untouchedIncomplete = previous.incomplete && previous.content.trim() === previous.generated.trim()
  if (!untouchedIncomplete) contentBeforeGeneration = previous.content
  incompleteContent.value = false
  generatedContent = ''
  form.value.content = ''
  const content = await generation.generate(description, partial => {
    form.value.content = partial
    generatedContent = partial
  })
  if (!content) {
    if (generation.partial.value) {
      // 写了一部分就停止或断开：留着，由提示条和生成面板标出未完成
      incompleteContent.value = true
    } else {
      // 一个字都没写出来：正文恢复成这次开始前的样子
      form.value.content = previous.content
      generatedContent = previous.generated
      incompleteContent.value = previous.incomplete
    }
    return
  }
  form.value.content = content
  generatedContent = content
  // 新提示词的第一个版本记下它是按哪段描述生成的，保存后在版本历史里能看到来历
  if (isNew.value) {
    const brief = description.length > 60 ? `${description.slice(0, 60)}…` : description
    pendingChangeDescription = t('promptGenerate.generatedVersion', { description: brief })
  }
  const hasTitle = await fillSummaryBlanks()
  if (!generation.autoSave.value) return
  // 没有标题时不自动保存，避免拿正文第一行（比如「# 角色」）当标题
  if (hasTitle) await saveChanges()
  else message.warning(t('promptGenerate.autoSaveNeedsTitle'))
}

/** 撤回停止或中断后留在正文里的部分内容，描述放回输入框 */
const revertGeneration = () => {
  const request = generation.request.value
  form.value.content = contentBeforeGeneration
  generatedContent = ''
  incompleteContent.value = false
  generation.reset()
  generatePanelRef.value?.setDescription(request)
}

const useGenerationHistory = async (item: AIGenerationHistory) => {
  if (item.status === 'success' && item.generatedPrompt) {
    if (!(await confirmReplaceContent())) return
    form.value.content = item.generatedPrompt
    generatedContent = item.generatedPrompt
    incompleteContent.value = false
    if (!form.value.title) form.value.title = item.topic.slice(0, 30)
  } else {
    generatePanelRef.value?.setDescription(item.topic)
  }
}

// ---------- 版本历史 ----------
const versions = ref<PromptHistory[]>([])
const versionsLoading = ref(false)
const latestVersion = computed(() => versions.value[0]?.version || 0)
// 最新一版和已保存的内容一致时它才是当前版本；在别处改过时当前内容要等下次保存才记成版本
const currentRecorded = computed(() => historyMatchesPrompt(versions.value[0], props.prompt))
const compareVersion = ref<PromptHistory | null>(null)
// 当前内容记成了版本时写出版本号；还没记成版本时只说「当前内容」
const compareText = computed(() => {
  const version = compareVersion.value?.version
  return latestVersion.value && currentRecorded.value
    ? t('promptHistory.comparing', { version, current: `v${latestVersion.value}` })
    : t('promptHistory.comparingUnrecorded', { version })
})
const compareDiff = computed(() => (compareVersion.value ? diffText(compareVersion.value.content, form.value.content) : []))
const compareSummary = computed(() => summarizePromptChange(compareVersion.value?.content || '', form.value.content))

const formatNames = (names: string[]) => new Intl.ListFormat(locale.value, {
  type: 'unit', style: /^(zh|ja)/.test(locale.value) ? 'narrow' : 'short',
}).format(names)

// 正文以外的改动逐项列出：标题、描述按词标出增删，分类写「旧 → 新」，标签列出加了和去掉的，变量列出改了设置的
const compareFields = computed(() => {
  const version = compareVersion.value
  if (!version) return []
  const categoryName = (id: number | null) => (
    id === null ? t('promptLibrary.uncategorized') : props.categories.find(category => category.id === id)?.name || t('promptLibrary.uncategorized')
  )
  const changes = compareVersionFields(version, {
    ...form.value,
    variables: serializeVariablesForSave(form.value),
  }, categoryName)
  const labels: Record<VersionFieldKey, string> = {
    title: t('promptPage.titleLabel'),
    description: t('promptPage.descriptionLabel'),
    category: t('promptBrowse.category'),
    tags: t('promptBrowse.tags'),
    variables: t('promptEditor.variables'),
  }
  return changes.map(change => {
    let segments: DiffSegment[] = []
    let text = ''
    if (change.key === 'title' || change.key === 'description') segments = diffText(change.before, change.after)
    else if (change.key === 'category') {
      segments = [{ type: 'delete', value: change.before }, { type: 'equal', value: ' → ' }, { type: 'insert', value: change.after }]
    } else if (change.key === 'tags') {
      segments = [
        ...change.removed.map(tag => ({ type: 'delete' as const, value: `#${tag}` })),
        ...change.added.map(tag => ({ type: 'insert' as const, value: `#${tag}` })),
      ].flatMap((segment, index) => (index ? [{ type: 'equal' as const, value: ' ' }, segment] : [segment]))
    } else text = t('promptHistory.variableSettingsChanged', { names: formatNames(change.added) })
    return { key: change.key, label: labels[change.key], segments, text }
  })
})

const loadVersions = async (showLoading = false) => {
  const id = props.prompt?.id
  if (!id) {
    versions.value = []
    return
  }
  if (showLoading) versionsLoading.value = true
  try {
    const list = await api.promptHistories.getByPromptId.query(id)
    // 加载期间切到了别的提示词就丢掉这次结果
    if (id === props.prompt?.id) versions.value = [...list].sort((a, b) => b.version - a.version)
  } catch {
    versions.value = []
  } finally {
    versionsLoading.value = false
  }
}

const toggleHistory = () => {
  if (sideView.value === 'history') return closeHistory()
  sideView.value = 'history'
  if (narrow.value) sideOverlayOpen.value = true
  void loadVersions(true)
}

const closeHistory = () => {
  sideView.value = 'tabs'
  compareVersion.value = null
}

// 历史面板自己的关闭按钮：窄宽度下历史是单独以浮层打开的，关掉时浮层一起收起
const closeHistoryPanel = () => {
  closeHistory()
  if (narrow.value) closeSideOverlay()
}

const updateVersionDescription = async (version: PromptHistory, description: string) => {
  if (!version.id) return
  try {
    await api.promptHistories.update.mutate({ id: version.id, data: { changeDescription: description } })
    versions.value = versions.value.map(item => item.id === version.id ? { ...item, changeDescription: description } : item)
    message.success(t('promptManagement.changeDescriptionSaved'))
  } catch {
    message.error(t('promptManagement.changeDescriptionSaveFailed'))
  }
}

// 恢复旧版本也会生成一个新版本，不删除任何记录
const restoreVersion = (version: PromptHistory) => {
  dialog.warning({
    title: t('promptHistory.restoreTitle', { version: version.version }),
    content: t('promptManagement.rollbackConfirmation'),
    positiveText: t('promptHistory.restoreVersion', { version: version.version }),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const restored = createEditorForm({
        ...props.prompt,
        title: version.title,
        description: version.description,
        content: version.content,
        categoryId: version.categoryId,
        tags: version.tags,
        variables: version.variables ? JSON.parse(version.variables) : [],
        isJinjaTemplate: version.isJinjaTemplate,
      } as PromptWithRelations)
      form.value = { ...restored, imageBlobs: form.value.imageBlobs }
      pendingChangeDescription = t('promptHistory.restoredFrom', { version: version.version })
      compareVersion.value = null
      await saveChanges()
    },
  })
}

// ---------- 使用记录 ----------
const usageOpen = ref(false)
const usageRecords = ref<PromptUsageRecord[]>([])

const openUsage = () => {
  usageRecords.value = props.prompt?.id ? readPromptUsageHistory(props.prompt.id) : []
  usageOpen.value = true
}

const restoreUsage = (record: PromptUsageRecord) => {
  emit('update:draft', createPromptDraft(variables.value, { ...record.variables }))
  revealedMissing.value = new Set()
  usageOpen.value = false
  message.success(t('promptWorkspace.valuesRestored'))
}

// 删掉记录后，「上次填写」的来源标记跟着最新的一条走
const deleteUsage = (record: PromptUsageRecord) => {
  const id = props.prompt?.id
  if (!id) return
  usageRecords.value = deletePromptUsageRecord(id, record.date)
  lastUsedValues.value = getLastUsedValues(id)
}

const clearUsage = () => {
  const id = props.prompt?.id
  if (!id) return
  clearPromptUsageHistory(id)
  usageRecords.value = []
  lastUsedValues.value = {}
  message.success(t('promptUsage.cleared'))
}

// ---------- 切换提示词 ----------
watch(promptKey, () => {
  mode.value = isNew.value ? 'edit' : props.initialMode
  jinjaView.value = isNew.value ? 'edit' : 'source'
  sideTab.value = isNew.value ? 'generate' : 'variables'
  sideView.value = 'tabs'
  compareVersion.value = null
  activeVariable.value = ''
  expandedVariable.value = ''
  revealedMissing.value = new Set()
  pendingChangeDescription = ''
  pendingRenames.clear()
  renamedSinceSave.clear()
  ai.reset()
  summaryPreview.value = null
  headerSuggested.value = false
  generation.reset()
  contentBeforeGeneration = ''
  generatedContent = ''
  incompleteContent.value = false
  initializeValues()
  versions.value = []
  void loadVersions()
}, { immediate: true })

watch(() => editor.dirty.value, dirty => emit('dirty-change', dirty), { immediate: true })
watch(narrow, value => { if (!value) sideOverlayOpen.value = false })

// ---------- Esc ----------
/**
 * Esc 一次只收起最上面的一层：下拉和气泡自己处理，这里依次是窄宽度下的右侧浮层、版本历史（含版本对比）。
 * 返回 false 表示页面里没有可收起的，在弹窗里时交给弹窗关闭。
 */
const dismissTopLayer = () => {
  if (narrow.value && sideOverlayOpen.value) {
    closeSideOverlay()
    return true
  }
  // 窄宽度下浮层收起后历史面板看不见，只有正文上方的版本对比还在时才算一层
  if (sideView.value === 'history' && (!narrow.value || compareVersion.value)) {
    closeHistory()
    return true
  }
  return false
}

// 工作台里没有外层弹窗，由页面自己响应 Esc；弹窗里由 PromptWorkspaceModal 转给 dismissTopLayer
const handleEscape = (event: KeyboardEvent) => {
  if (props.closable || isEscapeConsumed(event) || hasOpenFloatingLayer()) return
  // 焦点在别的弹窗、抽屉里时不是在操作这一页
  const target = event.target as Node | null
  if (target && target !== document.body && !rootRef.value?.contains(target)) return
  if (dismissTopLayer()) event.preventDefault()
}

// ---------- 快捷键 ----------
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    handleEscape(event)
    return
  }
  if (!props.shortcutsEnabled || !(event.metaKey || event.ctrlKey)) return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!suggestion.value && !compareVersion.value) void copyPrompt()
  } else if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (isNew.value || editor.dirty.value) void saveChanges()
  }
}

const focusTitle = () => rootRef.value?.querySelector<HTMLInputElement>('.prompt-header__title-input')?.focus()

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void loadQuickConfigs()
  // 从空库引导页带着描述进来时直接开始生成；「手动编写」进来时把描述填进描述栏（没连模型时 AI 生成输入框看不到）
  const description = props.initialDescription.trim()
  if (isNew.value && description) {
    if (props.autoGenerate) void nextTick(() => generatePanelRef.value?.submit())
    else if (!form.value.description.trim()) {
      form.value.description = description
      // 描述是引导页带过来的、引导页里也还留着：算草稿的初始状态，只有它时「放弃」不用确认
      editor.markClean()
    }
  }
  // 新建后直接可以输入标题。晚一拍再聚焦：在弹窗里，弹窗的焦点陷阱会在挂载后先把焦点放到第一个按钮（「放弃」）上
  if (isNew.value) void nextTick(focusTitle)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
  if (ai.running.value || generation.generating.value) void ai.stop()
})

defineExpose({
  // 新建草稿也按整张表单算：只选了分类、加了标签或附图也是未保存的修改
  hasUnsavedChanges: computed(() => editor.dirty.value),
  /** AI 修改建议或标题、描述的预览还没采纳或放弃：切到别的提示词前要提醒，不然就丢了 */
  hasPendingAISuggestion: computed(() => Boolean(suggestion.value || summaryPreview.value)),
  /** 新建草稿当前的标题，列表顶部的草稿行跟着显示 */
  draftTitle: computed(() => (isNew.value ? form.value.title.trim() : '')),
  discardChanges,
  refreshQuickOptimizationConfigs: loadQuickConfigs,
  focusTitle,
  dismissTopLayer,
})
</script>

<style scoped>
.prompt-page {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  background: var(--surface-primary);
}

.prompt-page__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.prompt-page__compare-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px var(--page-padding-document);
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-tertiary);
  font-size: var(--font-size-sm);
}

.prompt-page__compare-text {
  flex: 1;
  min-width: 0;
}

.prompt-page :deep(.ui-warn-bar) {
  padding: 8px var(--page-padding-document);
}

.prompt-page__kbd {
  margin-left: 6px;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  opacity: 0.72;
}

.prompt-page__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.prompt-page__document {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px var(--page-padding-document) 20px;
}

.prompt-page__alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: var(--reading-width);
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
  color: var(--content-primary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.prompt-page__alert .n-icon {
  margin-top: 2px;
  color: var(--content-secondary);
}

.prompt-page__diff {
  max-width: var(--reading-width);
  font-size: var(--font-size-base);
  line-height: var(--line-height-prose);
  user-select: text;
}

.prompt-page__compare-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: var(--reading-width);
  padding: 12px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
}

/* 标签一列、内容一列；内容是用户写的标题、描述，长了换行 */
.prompt-page__compare-fields dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
}

.prompt-page__compare-field {
  display: contents;
}

.prompt-page__compare-field dt {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.prompt-page__compare-field dd {
  min-width: 0;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  overflow-wrap: anywhere;
  user-select: text;
}

.prompt-page__diff-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.prompt-page__diff-summary .is-insert {
  color: var(--accent-success);
}

.prompt-page__diff-summary .is-delete {
  color: var(--accent-error);
}

.prompt-page__readonly-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.prompt-page__images {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.prompt-page__images-label {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.prompt-page__image {
  position: relative;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-image);
  background: var(--surface-secondary);
}

.prompt-page__image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  display: inline-flex;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: var(--surface-primary);
  color: var(--content-secondary);
  cursor: pointer;
}

.prompt-page__bar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px var(--page-padding-document);
  border-top: 1px solid var(--border-default);
  background: var(--surface-primary);
}

.prompt-page__bar-icon {
  color: var(--accent-primary);
}

.prompt-page__bar-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.prompt-page__bar-label {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-page__bar-counts {
  display: inline-flex;
  flex: none;
  align-items: baseline;
  gap: 4px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.prompt-page__bar-added {
  color: var(--accent-success);
  font-size: var(--font-size-xs);
}

.prompt-page__bar-removed {
  color: var(--accent-error);
  font-size: var(--font-size-xs);
}

.prompt-page__bar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

/* 基准宽度 0：状态文字不会把按钮挤到下一行，只占剩下的空间；窄到连按钮都放不下时才整体换行 */
.prompt-page__status {
  flex: 1 1 0;
  min-width: 80px;
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-page__status.is-warning {
  color: var(--accent-warning);
}

.prompt-page__bar-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.prompt-page__spacer {
  flex: 1;
}

.prompt-page__side {
  position: relative;
  display: flex;
  flex: none;
  flex-direction: column;
  width: var(--side-panel-width);
  min-height: 0;
  border-left: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.prompt-page__side.is-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  box-shadow: var(--shadow-overlay);
}

.prompt-page__scrim {
  position: absolute;
  inset: 0;
  z-index: 19;
  background: var(--overlay-backdrop);
}

/* 页签不收缩，右侧操作区（PromptSideActions）占剩下的宽度，放不下时自己收窄 */
.prompt-page__tabs {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.prompt-page__tablist {
  display: flex;
  flex: none;
  align-items: center;
  gap: 20px;
}

/* 浮层模式：收起按钮在页签左边 */
.prompt-page.is-narrow .prompt-page__tabs {
  padding-left: 8px;
}

.prompt-page__side-collapse {
  flex: none;
  width: 22px;
  padding: 0;
}

/* 弹窗的关闭按钮：固定在右上角，标签头和版本历史标题行给它让出位置，中间一条分隔线 */
.prompt-page__close {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 21;
  width: 28px;
  padding: 0;
}

.prompt-page.is-closable .prompt-page__tabs,
.prompt-page.is-closable .prompt-page__side :deep(.history-panel__head) {
  padding-right: 52px;
}

.prompt-page.is-closable .prompt-page__side::after {
  position: absolute;
  top: 12px;
  right: 44px;
  width: 1px;
  height: 16px;
  background: var(--border-default);
  content: '';
}

/* 窄宽度下右侧面板收起，关闭按钮落在正文栏右上角：提示条右侧和页头上方留出位置 */
.prompt-page.is-closable.is-narrow .prompt-page__compare-bar,
.prompt-page.is-closable.is-narrow :deep(.ui-warn-bar) {
  padding-right: 52px;
}

.prompt-page.is-closable.is-narrow .prompt-page__document {
  padding-top: 44px;
}

.prompt-page__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  margin-bottom: -1px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--content-tertiary);
  font: inherit;
  font-size: var(--font-size-base);
  white-space: nowrap;
  cursor: pointer;
}

.prompt-page__tab:hover {
  color: var(--content-primary);
}

.prompt-page__tab.is-active {
  border-bottom-color: var(--accent-primary);
  color: var(--content-primary);
  font-weight: var(--font-weight-medium);
}

.prompt-page__tab:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.prompt-page__side-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.prompt-page__side-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.prompt-page__side-help {
  padding: 12px 16px;
  border-top: 1px solid var(--border-default);
}

/* AI 生成的标题和描述预览：正文上方的一块浅底面板 */
.prompt-summary-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: var(--reading-width);
  padding: 12px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
}

.prompt-summary-preview__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prompt-summary-preview__icon {
  color: var(--accent-primary);
}

.prompt-summary-preview__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

/* 标签一列、内容一列，几行的内容左边对齐 */
.prompt-summary-preview__fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
}

.prompt-summary-preview__field {
  display: contents;
}

.prompt-summary-preview__field dt {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.prompt-summary-preview__field dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.prompt-summary-preview__value {
  color: var(--content-primary);
  font-size: var(--font-size-base);
  line-height: 1.5;
  user-select: text;
}

.prompt-summary-preview__previous {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.prompt-summary-preview__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
