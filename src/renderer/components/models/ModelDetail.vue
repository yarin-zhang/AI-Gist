<template>
  <main class="model-detail">
    <!-- 宽度不够时操作区整体换到第二行，配置名至少保留一整行 -->
    <header class="model-detail__head">
      <div class="model-detail__titles">
        <div class="model-detail__title-row">
          <h1 class="ui-title-page model-detail__title" :title="config.name">{{ config.name }}</h1>
          <span v-if="config.isPreferred && config.enabled" class="ui-tag ui-tag--success model-detail__tag">
            <span class="ui-tag__text">{{ t('aiConfig.globalPreferred') }}</span>
          </span>
        </div>
        <span class="model-detail__subtitle">{{ subtitle }}</span>
      </div>
      <div class="model-detail__actions">
        <label class="model-detail__switch">
          <NSwitch :value="config.enabled" :loading="toggling" @update:value="value => emit('toggle', value)" />
          {{ t('aiConfig.enabled') }}
        </label>
        <NButton :disabled="!config.enabled" @click="emit('preferred')">
          {{ config.isPreferred ? t('aiConfig.cancelPreferred') : t('aiConfig.setAsPreferred') }}
        </NButton>
        <NButton @click="emit('edit')">{{ t('aiConfig.edit') }}</NButton>
        <NDropdown trigger="click" placement="bottom-end" :options="moreOptions" @select="handleMore">
          <NButton quaternary class="model-detail__more" :aria-label="t('models.moreActions')">
            <template #icon><NIcon :size="16"><Dots /></NIcon></template>
          </NButton>
        </NDropdown>
      </div>
    </header>

    <div class="model-detail__grid">
      <UiPanel :title="t('aiConfig.workspace.connectionSection')">
        <template #actions>
          <NButton v-if="testingConnection" size="tiny" @click="emit('cancel-connection-test')">{{ t('models.cancelTest') }}</NButton>
          <NButton v-else size="tiny" :disabled="!config.enabled" @click="emit('test-connection')">
            {{ t('aiConfig.connectionTest') }}
          </NButton>
        </template>
        <div class="model-fields">
          <div class="model-field">
            <span class="model-field__label">{{ t('aiConfig.serviceType') }}</span>
            <span>{{ providerLabel }}</span>
          </div>
          <div class="model-field">
            <span class="model-field__label">{{ t('aiConfig.baseURL') }}</span>
            <span class="model-field__value--secondary">{{ config.baseURL || t('aiConfig.workspace.officialEndpoint') }}</span>
          </div>
          <div class="model-field">
            <span class="model-field__label">{{ t('aiConfig.workspace.credential') }}</span>
            <span v-if="config.apiKey" class="ui-mono model-field__secret">{{ maskSecret(config.apiKey) }}</span>
            <span v-else-if="credentialMissing" class="model-field__value--warning">{{ t('aiConfig.workspace.notConfigured') }}</span>
            <span v-else>{{ t('aiConfig.workspace.notRequired') }}</span>
          </div>
          <!-- API Key 不随同步传输：另一台设备同步过来的配置要在这台设备上补填 (#491) -->
          <UiAlert v-if="credentialMissing" tone="warning">{{ t('models.credentialNotSynced') }}</UiAlert>
          <p v-if="testingConnection" class="ui-help model-detail__testing" aria-live="polite">
            <NSpin :size="12" />{{ t('models.testing', { seconds: testTimeoutSeconds }) }}
          </p>
          <UiAlert v-else-if="connectionResult?.success" tone="success">
            {{ t('models.connectionOkAt', { time: formatFriendlyDate(connectionResult.testedAt, locale, { withTime: true }) }) }}
          </UiAlert>
          <AIErrorNotice v-else-if="connectionResult" :error="connectionResult.error" :local="isLocal"
            :format-title="title => t('models.connectionFailed', { error: title })" retry @retry="emit('test-connection')" />
        </div>
      </UiPanel>

      <UiPanel :title="t('models.modelsPanel')">
        <template #actions>
          <span class="model-detail__count">{{ t('aiConfig.workspace.modelCount', { count: modelOptions.length }, modelOptions.length) }}</span>
        </template>
        <div class="model-fields">
          <div class="model-field">
            <span class="model-field__label">{{ t('aiConfig.defaultModel') }}</span>
            <NSelect :value="config.defaultModel || null" :options="modelOptions" filterable tag
              :placeholder="t('aiConfig.selectDefaultModel')" @update:value="value => value && emit('update:default-model', value)" />
          </div>
          <div class="model-field">
            <span class="model-field__label">{{ t('aiConfig.availableModels') }}</span>
            <!-- 和下拉选项一致：旧数据里的「自定义模型」也列出来 -->
            <div v-if="modelOptions.length" class="model-tags">
              <span v-for="model in modelOptions" :key="model.value" class="ui-tag ui-tag--line ui-mono model-tag" :title="model.value">
                <span class="ui-tag__text">{{ model.value }}</span>
              </span>
            </div>
            <span v-else class="model-field__value--secondary">{{ t('aiConfig.workspace.notConfigured') }}</span>
          </div>
        </div>
      </UiPanel>

      <UiPanel :title="t('aiConfig.requestTest')" :description="t('models.requestTestDesc')">
        <div class="model-fields model-fields--tight">
          <div class="request-row">
            <NSelect :value="requestModel || null" :options="modelOptions" filterable tag class="request-row__model"
              :placeholder="t('aiConfig.selectModelToTest')" @update:value="value => emit('update:request-model', value || '')" />
            <!-- 请求进行中按钮变成「停止」 -->
            <NButton v-if="requestTesting" secondary type="error" @click="emit('stop-request-test')">
              <template #icon><NIcon :size="14"><PlayerStop /></NIcon></template>{{ t('models.stop') }}
            </NButton>
            <NButton v-else secondary type="primary" :disabled="!config.enabled || !requestModel" @click="emit('request-test')">
              {{ t('models.test') }}
            </NButton>
          </div>
          <NInput :value="requestPrompt" :placeholder="t('models.requestTestDefaultPrompt')"
            :input-props="{ 'aria-label': t('models.requestPromptLabel') }" @update:value="value => emit('update:request-prompt', value)"
            @keydown.enter="sendOnEnter" />
          <!-- 失败或停止时保留已经收到的部分，并标明不完整 -->
          <div v-if="requestResult && (requestResult.response || requestResult.stopped || requestTesting)" class="ui-muted-box" aria-live="polite">
            {{ requestResult.response }}<span v-if="requestTesting" class="request-cursor" aria-hidden="true" />
            <span v-if="requestResult.elapsed !== undefined" class="request-meta">
              <span v-if="requestResult.stopped || !requestResult.success" class="ui-tag ui-tag--warning request-meta__tag">
                {{ requestResult.stopped ? t('models.requestStopped') : t('models.requestIncomplete') }}
              </span>
              {{ t('models.elapsed', { ms: requestResult.elapsed }) }}
            </span>
          </div>
          <AIErrorNotice v-if="requestResult && !requestResult.success && !requestTesting" :error="requestResult.error" :local="isLocal"
            :format-title="requestResult.response ? title => t('models.requestInterrupted', { error: title }) : undefined"
            retry @retry="emit('request-test')" />
        </div>
      </UiPanel>

      <UiPanel :title="t('aiConfig.systemPrompt')" :description="t('models.behaviorPanelDesc')">
        <template #actions>
          <NButton size="tiny" @click="emit('system-prompt')">{{ t('aiConfig.editSystemPrompt') }}</NButton>
        </template>
        <div class="model-fields">
          <p v-if="config.systemPrompt" class="behavior-preview">{{ config.systemPrompt }}</p>
          <p v-else class="behavior-text">{{ t('aiConfig.workspace.defaultPromptInUse') }}</p>
          <hr class="model-divider" />
          <div class="model-dates">
            <div class="model-field">
              <span class="model-field__label">{{ t('aiConfig.createdAt') }}</span>
              <span class="model-field__value--secondary">{{ formatLongDate(config.createdAt) }}</span>
            </div>
            <div class="model-field">
              <span class="model-field__label">{{ t('aiConfig.workspace.updatedAt') }}</span>
              <span class="model-field__value--secondary">{{ formatLongDate(config.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </UiPanel>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NInput, NSelect, NSpin, NSwitch, type DropdownOption } from 'naive-ui'
import { Dots, FileText, PlayerStop, Trash } from '@vicons/tabler'
import type { AIConfig } from '@shared/types/ai'
import AIErrorNotice from '@/components/ai/AIErrorNotice.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import type { ConnectionTestRecord, RequestTestRecord } from '@/composables/ai/useAIConfigWorkspace'
import { useAIProviderChoices } from '@/composables/ai/useAIProviderChoices'
import { AI_TEST_TIMEOUT_MS, isLocalAIConfig } from '@/lib/utils/ai-error'
import { formatFriendlyDate } from '@/lib/utils/date'
import { handleEnterKey } from '@/lib/utils/ime'
import { maskSecret } from '@/lib/utils/secret'
import { isAIConfigCredentialMissing } from '@shared/ai-config-credentials'

const props = defineProps<{
  config: AIConfig
  /** 没有显式首选时，AI 功能临时使用的配置 */
  isFallback: boolean
  toggling: boolean
  testingConnection: boolean
  connectionResult?: ConnectionTestRecord
  modelOptions: { label: string; value: string }[]
  requestModel: string
  requestPrompt: string
  requestTesting: boolean
  requestResult?: RequestTestRecord
}>()

const emit = defineEmits<{
  toggle: [enabled: boolean]
  preferred: []
  edit: []
  'system-prompt': []
  delete: []
  'test-connection': []
  'cancel-connection-test': []
  'request-test': []
  'stop-request-test': []
  'update:default-model': [model: string]
  'update:request-model': [model: string]
  'update:request-prompt': [prompt: string]
}>()

const { t, locale } = useI18n()
const { getConfigDisplayLabel } = useAIProviderChoices()

const providerLabel = computed(() => getConfigDisplayLabel(props.config))
const isLocal = computed(() => isLocalAIConfig(props.config))
const credentialMissing = computed(() => isAIConfigCredentialMissing(props.config))
const testTimeoutSeconds = AI_TEST_TIMEOUT_MS / 1000

// 回车发送请求测试；输入法确认候选词的那次回车不算
const sendOnEnter = (event: KeyboardEvent) => handleEnterKey(event, () => {
  if (props.config.enabled && props.requestModel && !props.requestTesting) emit('request-test')
})
const subtitle = computed(() => {
  if (!props.config.enabled) return t('models.disabledSubtitle')
  if (props.config.isPreferred) return t('models.preferredSubtitle')
  if (props.isFallback) return t('aiConfig.workspace.fallbackDescription')
  return t('models.normalSubtitle')
})

const icon = (component: typeof FileText) => () => h(NIcon, null, { default: () => h(component) })
const moreOptions = computed<DropdownOption[]>(() => [
  { key: 'system-prompt', label: t('aiConfig.editSystemPrompt'), icon: icon(FileText) },
  { type: 'divider', key: 'divider' },
  { key: 'delete', label: t('aiConfig.delete'), icon: icon(Trash), props: { class: 'is-danger' } },
])
const handleMore = (key: string) => {
  if (key === 'system-prompt') emit('system-prompt')
  else if (key === 'delete') emit('delete')
}

const formatLongDate = (value: Date | string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}
</script>

<style scoped>
.model-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-primary);
}

.model-detail__head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  min-height: 72px;
  padding: 12px var(--page-padding-detail);
  border-bottom: 1px solid var(--border-default);
}

/* 标题区至少 280px，放不下时右边的操作区换到第二行，而不是把标题挤没 */
.model-detail__titles {
  display: flex;
  flex: 1 1 280px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.model-detail__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.model-detail__title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空间紧张时先收缩「全局首选」标签，配置名最后才省略 */
.model-detail__title-row .model-detail__tag {
  flex-shrink: 4;
  min-width: 0;
}

.model-detail__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.model-detail__subtitle {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.model-detail__switch {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.model-detail__more {
  width: 28px;
  padding: 0;
}

.model-detail__testing {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-detail__grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 16px;
  min-height: 0;
  padding: 24px var(--page-padding-detail);
  overflow-y: auto;
}

.model-detail__count {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.model-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-fields--tight {
  gap: 10px;
}

.model-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: var(--font-size-base);
  overflow-wrap: anywhere;
}

.model-field__label {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.model-field__value--secondary {
  color: var(--content-secondary);
}

.model-field__secret {
  font-size: var(--font-size-sm);
}

.model-field__value--warning {
  color: var(--accent-warning);
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.model-tag {
  font-size: var(--font-size-xs);
}

.request-row {
  display: flex;
  gap: 8px;
}

.request-row__model {
  flex: 1;
  min-width: 0;
}

.request-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  white-space: normal;
}

.request-meta__tag {
  height: 20px;
  font-size: var(--font-size-xs);
}

.request-cursor {
  display: inline-block;
  width: 6px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--content-tertiary);
  animation: request-blink 1s steps(1) infinite;
}

@keyframes request-blink {
  50% { opacity: 0; }
}

.behavior-text,
.behavior-preview {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.behavior-preview {
  display: -webkit-box;
  overflow: hidden;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.model-divider {
  width: 100%;
  height: 1px;
  margin: 0;
  border: 0;
  background: var(--border-subtle);
}

.model-dates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 1100px) {
  .model-detail__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

</style>
