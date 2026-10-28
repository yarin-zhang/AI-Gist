<template>
  <UiModal :show="show" width="var(--overlay-width-wizard)" height="600px" :close-label="t('common.close')"
    :title="t('aiConfig.editSystemPrompt')" :subtitle="config?.name" @close="requestClose">
    <div class="system-prompt">
      <UiAlert>{{ t('models.systemPromptTip') }}</UiAlert>
      <NInput v-model:value="content" type="textarea" class="system-prompt__input" :autosize="false" show-count
        :placeholder="t('aiConfig.systemPromptPlaceholder')" :input-props="{ 'aria-label': t('aiConfig.systemPrompt') }" />
      <!-- 内置默认是实际发出去的那段中文，非中文界面说明一下，免得以为是漏翻 -->
      <p v-if="showsDefault && !locale.startsWith('zh')" class="ui-help">{{ t('models.systemPromptDefaultLanguageNote') }}</p>
    </div>
    <template #footer-start>
      <NButton quaternary :disabled="content === defaultPrompt" @click="content = defaultPrompt">{{ t('aiConfig.resetToDefault') }}</NButton>
    </template>
    <template #footer>
      <NButton @click="requestClose">{{ t('common.cancel') }}</NButton>
      <NButton type="primary" :loading="saving" :disabled="!dirty" @click="emit('save', content)">{{ t('common.save') }}</NButton>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NInput, useDialog } from 'naive-ui'
import type { AIConfig } from '@shared/types/ai'
import { DEFAULT_GENERATION_SYSTEM_PROMPT } from '@shared/ai-default-prompts'
import UiAlert from '@/components/ui/UiAlert.vue'
import UiModal from '@/components/ui/UiModal.vue'

const props = defineProps<{
  show: boolean
  config: AIConfig | null
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [content: string]
}>()

const { t, locale } = useI18n()
const dialog = useDialog()
const content = ref('')
const snapshot = ref('')
// 「默认」就是没有自定义时实际发给模型的那段（主进程和 Web 后端用的同一份），不是另写的一段说明文字。
// 保存和默认相同的内容会存成空，见 useAIConfigWorkspace 的 saveSystemPrompt
const defaultPrompt = computed(() => DEFAULT_GENERATION_SYSTEM_PROMPT)
const showsDefault = computed(() => content.value.trim() === defaultPrompt.value.trim())
const dirty = computed(() => content.value !== snapshot.value)

watch(() => props.show, show => {
  if (!show) return
  content.value = props.config?.systemPrompt || defaultPrompt.value
  snapshot.value = content.value
})

const requestClose = () => {
  if (!dirty.value) { emit('close'); return }
  dialog.warning({
    title: t('aiConfig.workspace.unsavedChanges'), content: t('aiConfig.workspace.unsavedPromptMessage'),
    positiveText: t('aiConfig.workspace.discardChanges'), negativeText: t('aiConfig.workspace.continueEditing'),
    maskClosable: false, onPositiveClick: () => emit('close'),
  })
}
</script>

<style scoped>
.system-prompt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.system-prompt__input {
  flex: 1;
  min-height: 0;
}

.system-prompt__input :deep(textarea) {
  font-size: var(--font-size-sm);
  line-height: 1.7;
}
</style>
