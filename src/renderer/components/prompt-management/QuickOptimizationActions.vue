<template>
  <div class="quick-optimization-panel ui-surface">
    <div class="quick-optimization-header">
      <div class="quick-optimization-heading">
        <span class="quick-optimization-icon">
          <NIcon size="16"><Stars /></NIcon>
        </span>
        <div class="quick-optimization-copy">
          <NText strong class="quick-optimization-title">{{ t('promptManagement.quickOptimization') }}</NText>
          <NText depth="3" class="quick-optimization-description">
            {{ t('promptEditor.quickOptimizationHint') }}
          </NText>
        </div>
      </div>

      <div class="quick-optimization-controls">
        <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
          :placeholder="t('promptManagement.aiModelPlaceholder')"
          :disabled="isStreaming || optimizing !== null" />
        <NTooltip>
          <template #trigger>
            <NButton size="small" quaternary circle :aria-label="t('promptEditor.configureOptimization')"
              @click="$emit('open-quick-optimization-config')">
              <template #icon><NIcon size="16"><Settings /></NIcon></template>
            </NButton>
          </template>
          {{ t('promptEditor.configureOptimization') }}
        </NTooltip>
      </div>
    </div>

    <div class="quick-optimization-actions">
      <template v-if="isStreaming">
        <div class="optimization-progress" role="status">
          <NSpin size="small" />
          <NText>
            {{ t('promptManagement.generating') }} · {{ streamStats.charCount || 0 }}
            {{ t('promptManagement.characters') }}
          </NText>
        </div>
        <NButton size="small" type="error" secondary @click="$emit('stop-optimization')">
          {{ t('promptManagement.stopGeneration') }}
        </NButton>
      </template>

      <template v-else>
        <div class="preset-actions">
          <NTooltip v-for="config in quickOptimizationConfigs" :key="config.id"
            :disabled="!config.description">
            <template #trigger>
              <NButton size="small" secondary :loading="optimizing === config.name"
                :disabled="!content.trim() || optimizing !== null || !config.id"
                @click="runOptimization(config.id)">
                {{ config.name }}
              </NButton>
            </template>
            {{ config.description }}
          </NTooltip>
          <NText v-if="quickOptimizationConfigs.length === 0" depth="3" class="empty-actions">
            {{ t('promptEditor.quickOptimizationEmpty') }}
          </NText>
        </div>

        <NButton size="small" quaternary :disabled="!content.trim() || optimizing !== null"
          @click="openManualAdjustment">
          <template #icon><NIcon size="16"><AdjustmentsHorizontal /></NIcon></template>
          {{ t('promptManagement.manualAdjustment') }}
        </NButton>
      </template>
    </div>

    <NCollapseTransition :show="showManualInput && !isStreaming">
      <div class="manual-adjustment">
        <div>
          <NText strong>{{ t('promptManagement.manualAdjustmentTitle') }}</NText>
          <NText depth="3" class="manual-adjustment-tip">
            {{ t('promptManagement.manualAdjustmentTip') }}
          </NText>
        </div>
        <NInput ref="manualInputRef" v-model:value="manualInstruction" type="textarea" :rows="3"
          maxlength="500" show-count :placeholder="t('promptManagement.manualAdjustmentPlaceholder')"
          @keydown.ctrl.enter="applyManualAdjustment" @keydown.meta.enter="applyManualAdjustment" />
        <NFlex justify="end" size="small">
          <NButton size="small" @click="cancelManualAdjustment">{{ t('common.cancel') }}</NButton>
          <NButton size="small" type="primary" :loading="optimizing === 'manual'"
            :disabled="!manualInstruction.trim()" @click="applyManualAdjustment">
            {{ t('promptManagement.confirmAdjustment') }}
          </NButton>
        </NFlex>
      </div>
    </NCollapseTransition>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCollapseTransition, NFlex, NIcon, NInput, NSpin, NText, NTooltip, useMessage,
} from 'naive-ui'
import { AdjustmentsHorizontal, Settings, Stars } from '@vicons/tabler'
import type { QuickOptimizationConfig } from '@shared/types/ai'
import AIModelSelector from '@/components/common/AIModelSelector.vue'

interface Props {
  content: string
  quickOptimizationConfigs: QuickOptimizationConfig[]
  optimizing: string | null
  isStreaming: boolean
  streamStats: { charCount?: number }
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'optimize-prompt', configId: number): void
  (e: 'stop-optimization'): void
  (e: 'open-quick-optimization-config'): void
  (e: 'manual-adjustment', instruction: string): void
}>()

const { t } = useI18n()
const message = useMessage()
const modelSelectorRef = ref<InstanceType<typeof AIModelSelector>>()
const manualInputRef = ref<InstanceType<typeof NInput>>()
const selectedModelKey = ref('')
const showManualInput = ref(false)
const manualInstruction = ref('')

const runOptimization = (configId?: number) => {
  if (configId) emit('optimize-prompt', configId)
}

const openManualAdjustment = () => {
  showManualInput.value = true
  nextTick(() => manualInputRef.value?.focus())
}

const cancelManualAdjustment = () => {
  showManualInput.value = false
  manualInstruction.value = ''
}

const applyManualAdjustment = () => {
  const instruction = manualInstruction.value.trim()
  if (!instruction) {
    message.warning(t('promptManagement.enterAdjustmentInstruction'))
    return
  }
  emit('manual-adjustment', instruction)
  cancelManualAdjustment()
}

defineExpose({
  modelSelectorRef,
  selectedModelKey,
})
</script>

<style scoped>
.quick-optimization-panel { flex: 0 0 auto; overflow: hidden; background: var(--surface-primary); }
.quick-optimization-header { min-height: 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--compact-padding); padding: 7px var(--compact-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.quick-optimization-heading { flex: 1 1 320px; min-width: 0; display: flex; align-items: center; gap: 9px; }
.quick-optimization-icon { width: 28px; height: 28px; flex: 0 0 28px; display: grid; place-items: center; color: var(--content-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); }
.quick-optimization-copy { min-width: 0; }
.quick-optimization-title, .quick-optimization-description { display: block; line-height: var(--line-height-normal); }
.quick-optimization-title { font-size: var(--font-size-base); }
.quick-optimization-description { margin-top: 1px; font-size: var(--font-size-xs); white-space: normal; }
.quick-optimization-controls { width: 300px; min-width: 220px; flex: 0 1 300px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; }
.quick-optimization-actions { min-height: 43px; display: flex; align-items: center; justify-content: space-between; gap: var(--compact-padding); padding: 6px var(--compact-padding); }
.preset-actions { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.empty-actions { font-size: var(--font-size-sm); }
.optimization-progress { min-width: 0; display: flex; align-items: center; gap: 8px; }
.manual-adjustment { padding: var(--compact-padding); display: flex; flex-direction: column; gap: var(--compact-padding); border-top: 1px solid var(--border-default); background: var(--surface-secondary); }
.manual-adjustment-tip { display: block; margin-top: 2px; font-size: var(--font-size-sm); }

@media (max-width: 760px) {
  .quick-optimization-header { align-items: stretch; flex-direction: column; }
  .quick-optimization-controls { width: 100%; min-width: 0; }
  .quick-optimization-actions { align-items: flex-start; flex-direction: column; }
}
</style>
