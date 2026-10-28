<template>
  <UiModal :show="show" width="var(--overlay-width-wizard)" height="720px" flush :close-label="t('common.close')"
    :title="editingConfig ? t('aiConfig.editConfig') : t('aiConfig.addConfig')" @close="requestClose">
    <template #before-body>
      <ol class="wizard-steps" :aria-label="t('models.steps')">
        <li v-for="(step, index) in steps" :key="step.key">
          <button type="button" class="wizard-step"
            :class="{ 'is-active': activeSection === step.key, 'is-done': isDone(index) }"
            :aria-current="activeSection === step.key ? 'step' : undefined" :disabled="!canJump(index)"
            @click="goToSection(step.key)">
            <span class="wizard-step__index">
              <NIcon v-if="isDone(index)" :size="12"><Check /></NIcon>
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="wizard-step__label">{{ step.label }}</span>
          </button>
        </li>
      </ol>
    </template>

    <div class="wizard-body">
      <!-- 1. 选择服务商：整组是一个单选组，只有选中的卡片在 Tab 顺序里，方向键在卡片之间切换 -->
      <div v-if="activeSection === 'provider'" ref="providersRef" class="wizard-providers" role="radiogroup"
        :aria-label="t('aiConfig.workspace.providerStep')" @keydown="handleProviderKeydown">
        <section v-for="group in providerGroups" :key="group.key" class="provider-group">
          <span :id="`provider-group-${group.key}`" class="ui-overline">{{ group.label }}</span>
          <div class="provider-grid" role="group" :aria-labelledby="`provider-group-${group.key}`">
            <button v-for="provider in group.providers" :key="provider.id" type="button" role="radio"
              class="provider-card" :class="{ 'is-selected': selectedProviderChoiceId === provider.id }"
              :aria-checked="selectedProviderChoiceId === provider.id" :title="provider.description"
              :tabindex="selectedProviderChoiceId === provider.id ? 0 : -1" :data-provider-id="provider.id"
              @click="selectProviderChoice(provider)" @dblclick="nextStep">
              <span class="provider-card__mark" aria-hidden="true"><NIcon :size="16"><component :is="provider.icon" /></NIcon></span>
              <span class="provider-card__copy">
                <span class="provider-card__name">{{ provider.label }}</span>
                <span class="provider-card__tag">{{ provider.tag }}</span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <!-- 2. 连接验证 -->
      <div v-else-if="activeSection === 'connection'" class="wizard-stack">
        <UiPanel :title="t('aiConfig.workspace.configureConnection')" :description="t('aiConfig.workspace.configureConnectionDesc')">
          <!-- 输入框里按回车：先测试连接，测通后再按一次进入下一步 -->
          <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="top" class="wizard-form"
            @keydown.enter="handleConnectionEnter">
            <NFormItem :label="t('aiConfig.serviceType')">
              <NSelect :value="selectedProviderChoiceId" :options="providerOptions" @update:value="changeProviderChoice" />
            </NFormItem>
            <NFormItem :label="t('aiConfig.configName')" path="name">
              <NInput v-model:value="formData.name" :placeholder="t('aiConfig.configNamePlaceholder')" />
            </NFormItem>
            <NFormItem v-if="needsBaseURL || supportsCustomEndpoint" :label="baseURLInfo.label" path="baseURL" class="wizard-form__wide">
              <NInput v-model:value="formData.baseURL" :placeholder="baseURLInfo.placeholder" />
            </NFormItem>
            <NFormItem v-if="needsApiKey" :label="apiKeyLabel" path="apiKey" class="wizard-form__wide">
              <NInput v-model:value="formData.apiKey" type="password" show-password-on="click"
                :placeholder="t('aiConfig.workspace.apiKeyPlaceholder')" />
            </NFormItem>
          </NForm>
          <div class="provider-help">
            <span class="provider-help__text"><strong>{{ providerSummary.label }}</strong>{{ providerSummary.description }}</span>
            <span class="provider-help__links">
              <NButton v-if="providerLinks.apiKeyUrl" text size="small" @click="openExternalUrl(providerLinks.apiKeyUrl)">
                <template #icon><NIcon><ExternalLink /></NIcon></template>{{ t('aiConfig.getApiKey') }}
              </NButton>
              <NButton v-if="providerLinks.docUrl" text size="small" @click="openExternalUrl(providerLinks.docUrl)">
                <template #icon><NIcon><Book /></NIcon></template>{{ t('aiConfig.viewDocumentation') }}
              </NButton>
            </span>
          </div>
        </UiPanel>

        <UiPanel :title="t('aiConfig.connectionTest')" :description="t('aiConfig.workspace.connectionTestDesc')">
          <template #actions>
            <!-- 测试中按钮变成「取消测试」，不让用户干等 -->
            <NButton v-if="testingConnection" size="small" @click="cancelConnectionTest">{{ t('models.cancelTest') }}</NButton>
            <NButton v-else size="small" type="primary" secondary :disabled="!canTestConnection" @click="testConnection">
              <template #icon><NIcon><AccessPoint /></NIcon></template>{{ t('aiConfig.connectionTest') }}
            </NButton>
          </template>
          <p v-if="testingConnection" class="ui-help wizard-testing" aria-live="polite">
            <NSpin :size="12" />{{ t('models.testing', { seconds: testTimeoutSeconds }) }}
          </p>
          <UiAlert v-else-if="connectionResult?.success" tone="success">{{ t('models.connectionOk') }}</UiAlert>
          <AIErrorNotice v-else-if="connectionResult" :error="connectionResult.error" :local="isLocalTarget"
            :format-title="title => t('models.connectionFailed', { error: title })" retry @retry="testConnection" />
          <p v-else class="ui-help">{{ t('models.connectionNotTested') }}</p>
        </UiPanel>
      </div>

      <!-- 3. 模型确认 -->
      <div v-else class="wizard-stack">
        <div class="ui-panel wizard-summary">
          <div class="wizard-summary__field">
            <span>{{ t('aiConfig.configName') }}</span><strong>{{ formData.name }}</strong>
          </div>
          <div class="wizard-summary__field">
            <span>{{ t('aiConfig.baseURL') }}</span><strong class="is-secondary">{{ formData.baseURL || t('aiConfig.workspace.officialEndpoint') }}</strong>
          </div>
          <div class="wizard-summary__field">
            <span>{{ t('aiConfig.workspace.apiKeyLabel') }}</span><strong class="ui-mono">{{ formData.apiKey ? maskSecret(formData.apiKey) : t('aiConfig.workspace.notRequired') }}</strong>
          </div>
          <span class="wizard-summary__status">
            <span v-if="connectionResult?.success" class="ui-tag ui-tag--success">{{ t('models.connectionVerifiedTag') }}</span>
            <span v-else class="ui-tag ui-tag--line">{{ t('models.connectionUnverifiedTag') }}</span>
            <NButton quaternary size="tiny" @click="goToSection('connection')">{{ t('models.change') }}</NButton>
          </span>
        </div>

        <div class="wizard-models">
          <UiPanel :title="t('aiConfig.modelList')" :description="t('models.modelListDesc')">
            <template #actions>
              <NButton size="tiny" :loading="fetchingModels" :disabled="!canTestConnection" @click="fetchModelList(true)">
                <template #icon><NIcon><CloudDownload /></NIcon></template>{{ t('aiConfig.workspace.fetchModels') }}
              </NButton>
            </template>
            <div class="wizard-fields">
              <!-- 没拿到真实列表时，常见模型只作为用户明确选择的备选 -->
              <AIErrorNotice v-if="modelFetchState === 'error'" :error="modelFetchError" :local="isLocalTarget"
                :format-title="title => t('aiConfig.workspace.modelFetchFailed', { error: title })">
                <NButton v-if="commonModels.length" size="tiny" class="wizard-common-models is-inline" @click="fillCommonModels">
                  {{ t('aiConfig.workspace.useCommonModels') }}
                </NButton>
              </AIErrorNotice>
              <UiAlert v-else-if="modelFetchState !== 'idle'" :tone="modelFetchState === 'success' ? 'success' : 'warning'">
                {{ modelFetchMessage }}
                <NButton v-if="commonModels.length && modelFetchState === 'empty'" size="tiny"
                  class="wizard-common-models" @click="fillCommonModels">
                  {{ t('aiConfig.workspace.useCommonModels') }}
                </NButton>
              </UiAlert>
              <!-- 只有一个添加入口：标签末尾的 +；默认模型下拉里输入的新名字也会自动加进来 -->
              <div class="wizard-field">
                <span class="wizard-field__label">{{ t('aiConfig.availableModels') }}</span>
                <NDynamicTags v-model:value="formData.models" class="wizard-tags" />
                <span class="ui-help">{{ t('models.modelsHelp') }}</span>
              </div>
              <div class="wizard-field">
                <span class="wizard-field__label">{{ t('aiConfig.defaultModel') }}<span class="wizard-field__required" aria-hidden="true">*</span></span>
                <NSelect :value="formData.defaultModel || null" :options="modelOptions" filterable tag
                  :placeholder="formData.models.length ? t('aiConfig.selectDefaultModel') : t('models.typeModelName')"
                  @update:value="setDefaultModel" />
                <span class="ui-help">{{ t('models.defaultModelHelp') }}</span>
              </div>
            </div>
          </UiPanel>

          <UiPanel :title="t('aiConfig.modelTest')" :description="t('aiConfig.workspace.modelTestDesc')">
            <div class="wizard-fields">
              <div class="wizard-field">
                <span class="wizard-field__label">{{ t('aiConfig.selectModelToTest') }}</span>
                <NSelect :value="selectedTestModel || null" :options="modelOptions" filterable
                  :placeholder="formData.models.length ? t('aiConfig.selectModelToTest') : t('models.addModelFirst')"
                  @update:value="value => (selectedTestModel = value || '')" />
              </div>
              <NButton v-if="testingModel" secondary class="wizard-test-button" @click="cancelModelTest">{{ t('models.cancelTest') }}</NButton>
              <NButton v-else secondary class="wizard-test-button" :disabled="!selectedTestModel || !canTestConnection"
                @click="testSelectedModel">
                <template #icon><NIcon><Robot /></NIcon></template>{{ t('aiConfig.testSelectedModel') }}
              </NButton>
              <p v-if="testingModel" class="ui-help wizard-testing" aria-live="polite">
                <NSpin :size="12" />{{ t('models.testing', { seconds: testTimeoutSeconds }) }}
              </p>
              <div v-else-if="modelTestResult?.success" class="ui-muted-box">
                <span class="wizard-reply-meta">{{ t('models.replyMeta', { ms: modelTestResult.elapsed ?? 0 }) }}</span>{{ modelTestResult.response || t('aiConfig.modelTestSuccess') }}
              </div>
              <AIErrorNotice v-else-if="modelTestResult" :error="modelTestResult.error || t('aiConfig.modelTestFailed')"
                :local="isLocalTarget" :format-title="title => t('models.modelTestFailedWith', { error: title })"
                retry @retry="testSelectedModel" />
            </div>
          </UiPanel>
        </div>
      </div>
    </div>

    <template #footer-start>
      <NButton v-if="activeSection !== 'provider'" quaternary @click="previousStep">
        <template #icon><NIcon><ChevronLeft /></NIcon></template>{{ t('common.previous') }}
      </NButton>
      <template v-else>{{ t('aiConfig.workspace.chooseProviderDesc') }}</template>
    </template>
    <template #footer>
      <NButton @click="requestClose">{{ t('common.cancel') }}</NButton>
      <NButton v-if="activeSection !== 'models'" :type="editingConfig ? 'default' : 'primary'" @click="nextStep">
        {{ t('common.next') }}
      </NButton>
      <NButton v-if="editingConfig || activeSection === 'models'" type="primary" :loading="saving" @click="save">
        {{ editingConfig ? t('models.saveChanges') : t('aiConfig.addConfigButton') }}
      </NButton>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDynamicTags, NForm, NFormItem, NIcon, NInput, NSelect, NSpin } from 'naive-ui'
import { AccessPoint, Book, Check, ChevronLeft, CloudDownload, ExternalLink, Robot } from '@vicons/tabler'
import type { AIConfig } from '@shared/types/ai'
import AIErrorNotice from '@/components/ai/AIErrorNotice.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useAIConfigEditor, type EditorSection } from '@/composables/ai/useAIConfigEditor'
import { useAIProviderChoices } from '@/composables/ai/useAIProviderChoices'
import { openExternalUrl } from '@/lib/platform/shell'
import { AI_TEST_TIMEOUT_MS } from '@/lib/utils/ai-error'
import { handleEnterKey } from '@/lib/utils/ime'
import { maskSecret } from '@/lib/utils/secret'

const emit = defineEmits<{ saved: [config: AIConfig] }>()

const { t } = useI18n()
const formRef = ref()
const providersRef = ref<HTMLElement>()
const { providerGroups, allProviderChoices } = useAIProviderChoices()
const {
  show, editingConfig, activeSection, formData, formRules, saving, selectedProviderChoiceId, providerSummary,
  providerLinks, needsBaseURL, supportsCustomEndpoint, needsApiKey, canTestConnection, apiKeyLabel, baseURLInfo,
  modelOptions, testingConnection, connectionResult, fetchingModels, modelFetchState, modelFetchMessage, modelFetchError,
  isLocalTarget, commonModels, selectedTestModel, testingModel, modelTestResult, openCreate, openEdit, requestClose,
  selectProviderChoice, changeProviderChoice, isSectionComplete, goToSection, previousStep, nextStep, testConnection,
  cancelConnectionTest, submitConnectionStep, fetchModelList, fillCommonModels, setDefaultModel, testSelectedModel,
  cancelModelTest, save,
} = useAIConfigEditor(config => emit('saved', config))
const testTimeoutSeconds = AI_TEST_TIMEOUT_MS / 1000

const steps = computed<{ key: EditorSection; label: string }[]>(() => [
  { key: 'provider', label: t('aiConfig.workspace.providerStep') },
  { key: 'connection', label: t('aiConfig.workspace.connectionStep') },
  { key: 'models', label: t('aiConfig.workspace.modelsStep') },
])
const activeIndex = computed(() => steps.value.findIndex(step => step.key === activeSection.value))
const isDone = (index: number) => index < activeIndex.value && isSectionComplete(steps.value[index].key)
// 新建时只能回到已经走过的步骤；编辑时可以直接跳到任何一步
const canJump = (index: number) => Boolean(editingConfig.value) || index <= activeIndex.value

// 「服务类型」下拉和第 1 步的卡片同一份目录、同一个顺序：自定义服务显示「OpenAI 兼容服务」，不再显示成 OpenAI
const providerOptions = computed(() => providerGroups.value.map(group => ({
  type: 'group' as const, key: group.key, label: group.label,
  children: group.providers.map(provider => ({ value: provider.id, label: provider.label })),
})))

const focusSelectedProvider = () => {
  providersRef.value?.querySelector<HTMLElement>(`[data-provider-id="${selectedProviderChoiceId.value}"]`)?.focus()
}

// 方向键：右 / 下到下一张，左 / 上到上一张（首尾相接），Home / End 到第一张 / 最后一张；移到哪张就选哪张
const PROVIDER_STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
const handleProviderKeydown = async (event: KeyboardEvent) => {
  const cards = Array.from(providersRef.value?.querySelectorAll<HTMLElement>('.provider-card') || [])
  const current = cards.indexOf(event.target as HTMLElement)
  if (current < 0 || event.altKey || event.ctrlKey || event.metaKey) return
  let next = -1
  if (event.key in PROVIDER_STEPS) next = (current + PROVIDER_STEPS[event.key] + cards.length) % cards.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = cards.length - 1
  if (next < 0) return
  event.preventDefault()
  const choice = allProviderChoices.value.find(item => item.id === cards[next].dataset.providerId)
  if (!choice) return
  cards[next].focus()
  // 已经填了 Key 时会先确认；取消后焦点回到原来选中的卡片
  await selectProviderChoice(choice)
  await nextTick()
  focusSelectedProvider()
}

const handleConnectionEnter = (event: KeyboardEvent) => {
  // 只处理文本框里的回车；服务类型下拉上的回车留给它自己展开菜单
  if (!(event.target instanceof HTMLInputElement)) return
  handleEnterKey(event, () => { void submitConnectionStep() })
}

// 打开向导或回到第 1 步时，焦点放在选中的服务商卡片上，而不是右上角的关闭按钮
watch(() => show.value && activeSection.value === 'provider', async active => {
  if (!active) return
  await nextTick()
  requestAnimationFrame(focusSelectedProvider)
})

defineExpose({ openCreate, openEdit })
</script>

<style scoped>
.wizard-steps {
  display: flex;
  flex: none;
  gap: 24px;
  margin: 0;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-default);
  list-style: none;
}

.wizard-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.wizard-step:disabled {
  cursor: default;
}

.wizard-step__index {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--surface-tertiary);
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.wizard-step.is-active {
  color: var(--content-primary);
  font-weight: var(--font-weight-medium);
}

.wizard-step.is-active .wizard-step__index {
  background: var(--accent-primary);
  color: var(--content-inverse, #fff);
}

.wizard-step.is-done {
  color: var(--content-secondary);
}

.wizard-step.is-done .wizard-step__index {
  background: var(--border-default);
  color: var(--content-primary);
}

.wizard-step:focus-visible {
  border-radius: var(--radius-control);
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.wizard-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
}

.wizard-providers,
.wizard-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.provider-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.provider-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.provider-card:hover {
  border-color: var(--border-strong);
}

.provider-card.is-selected {
  border-color: var(--accent-soft-border);
  background: var(--accent-soft);
}

.provider-card:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.provider-card__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  background: var(--surface-tertiary);
  color: var(--content-secondary);
}

.provider-card.is-selected .provider-card__mark {
  background: var(--surface-primary);
  color: var(--accent-primary);
}

.provider-card__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 名称、说明最多两行：意大利语等长译文里，两张「自定义服务」卡片靠后半句才分得开 */
.provider-card__name,
.provider-card__tag {
  display: -webkit-box;
  overflow: hidden;
  line-height: var(--line-height-tight);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.provider-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.provider-card__tag {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.wizard-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
}

.wizard-form__wide {
  grid-column: 1 / -1;
}

.provider-help {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
  font-size: var(--font-size-sm);
}

.provider-help__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--content-tertiary);
}

.provider-help__text strong {
  color: var(--content-primary);
  font-weight: var(--font-weight-medium);
}

.provider-help__links {
  display: flex;
  flex: none;
  gap: 12px;
}

.wizard-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
}

.wizard-summary__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wizard-summary__field span {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.wizard-summary__field strong {
  overflow: hidden;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-normal);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wizard-summary__field strong.is-secondary {
  color: var(--content-secondary);
}

.wizard-summary__field strong.ui-mono {
  font-size: var(--font-size-sm);
}

.wizard-summary__status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wizard-models {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

.wizard-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wizard-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.wizard-field__label {
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.wizard-field__required {
  margin-left: 2px;
  color: var(--accent-error);
}

.wizard-tags :deep(.n-tag) {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

.wizard-test-button {
  align-self: flex-start;
}

.wizard-common-models {
  display: flex;
  margin-top: 6px;
}

.wizard-common-models.is-inline {
  margin-top: 0;
}

.wizard-testing {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wizard-reply-meta {
  display: block;
  margin-bottom: 4px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

@media (max-width: 900px) {
  .provider-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .wizard-models {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wizard-summary,
  .wizard-form {
    grid-template-columns: 1fr;
  }
}
</style>
