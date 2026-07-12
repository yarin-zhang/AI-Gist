<template>
  <NModal :show="show" :mask-closable="false" @update:show="value => !value && close()">
    <NCard class="binding-card" :title="existingBinding ? t('shortcuts.editPromptBinding') : t('shortcuts.assignPromptBinding')">
      <NFlex vertical :size="16">
        <div>
          <NText strong>{{ promptTitle }}</NText>
          <NText depth="3" class="description">{{ t('shortcuts.assignPromptBindingDesc') }}</NText>
        </div>
        <NInput
          :value="accelerator"
          readonly
          :placeholder="t('shortcuts.pressShortcut')"
          :status="error ? 'error' : undefined"
          @click="capturing = true"
        />
        <NText v-if="error" type="error" class="error-text">{{ error }}</NText>
        <NRadioGroup v-model:value="action">
          <NSpace>
            <NRadio value="copy">{{ t('shortcuts.actionCopy') }}</NRadio>
            <NRadio value="paste">{{ t('shortcuts.actionPaste') }}</NRadio>
          </NSpace>
        </NRadioGroup>
        <NText depth="3" class="description">{{ t('shortcuts.pasteFallbackHint') }}</NText>
        <NFlex justify="space-between">
          <NButton v-if="existingBinding" type="error" secondary @click="remove">{{ t('common.delete') }}</NButton>
          <span v-else />
          <NSpace>
            <NButton @click="close">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="saving" :disabled="!accelerator" @click="save">{{ t('common.confirm') }}</NButton>
          </NSpace>
        </NFlex>
      </NFlex>
    </NCard>
  </NModal>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { NButton, NCard, NFlex, NInput, NModal, NRadio, NRadioGroup, NSpace, NText } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import type { PromptShortcutBinding, ShortcutAction } from '@shared/types';

const props = defineProps<{
  show: boolean;
  promptUuid: string;
  promptTitle: string;
  existingBinding?: PromptShortcutBinding;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const accelerator = ref('');
const action = ref<ShortcutAction>('copy');
const capturing = ref(true);
const saving = ref(false);
const error = ref('');
let disabledByModal = false;

watch(() => props.show, async show => {
  if (!show) return;
  accelerator.value = props.existingBinding?.accelerator || '';
  action.value = props.existingBinding?.action || 'copy';
  error.value = '';
  capturing.value = true;
  await window.electronAPI.shortcuts.temporarilyDisable();
  disabledByModal = true;
}, { immediate: true });

function keyName(event: KeyboardEvent): string {
  if (event.code.startsWith('Key')) return event.code.slice(3);
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter', Tab: 'Tab',
  };
  return map[event.code] || event.key;
}

function onKeyDown(event: KeyboardEvent): void {
  if (!props.show || !capturing.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    close();
    return;
  }
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push('Command');
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  const key = keyName(event);
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return;
  accelerator.value = [...modifiers, key].join('+');
  error.value = '';
}

window.addEventListener('keydown', onKeyDown, true);

async function restore(): Promise<void> {
  if (!disabledByModal) return;
  disabledByModal = false;
  await window.electronAPI.shortcuts.restore();
}

async function close(): Promise<void> {
  await restore();
  emit('close');
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    await window.electronAPI.shortcuts.upsertPromptBinding({
      id: props.existingBinding?.id,
      promptUUID: props.promptUuid,
      accelerator: accelerator.value,
      action: action.value,
      enabled: true,
    });
    await restore();
    emit('saved');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

async function remove(): Promise<void> {
  if (!props.existingBinding) return;
  saving.value = true;
  try {
    await window.electronAPI.shortcuts.removePromptBinding(props.existingBinding.id);
    await restore();
    emit('saved');
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  void restore();
});
</script>

<style scoped>
.binding-card { width: min(440px, calc(100vw - 32px)); }
.description { display: block; margin-top: 4px; font-size: 12px; }
.error-text { font-size: 12px; }
</style>
