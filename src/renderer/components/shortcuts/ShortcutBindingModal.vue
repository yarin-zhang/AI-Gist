<template>
  <UiModal :show="show" :title="existingBinding ? t('shortcuts.editPromptBinding') : t('shortcuts.assignPromptBinding')"
    :close-label="t('common.close')" @close="close">
    <div class="binding">
      <div class="binding__intro">
        <span class="binding__title">{{ promptTitle }}</span>
      </div>
      <button type="button" class="binding__capture" :class="{ 'is-error': error, 'is-capturing': capturing }"
        :aria-label="t('shortcuts.pressShortcut')" @click="capturing = true">
        <span v-if="keys.length" class="binding__keys">
          <span v-for="key in keys" :key="key" class="ui-kbd binding__key">{{ key }}</span>
        </span>
        <span class="binding__hint">{{ error || t('shortcuts.pressShortcut') }}</span>
      </button>
      <div class="binding__field">
        <span class="binding__label">{{ t('shortcutBinding.afterPress') }}</span>
        <UiSegmented v-model="action" fill :label="t('shortcutBinding.afterPress')" :options="actionOptions" />
        <span class="ui-help">{{ t('shortcuts.pasteFallbackHint') }}</span>
      </div>
    </div>
    <template #footer-start>
      <NButton v-if="existingBinding" quaternary type="error" :disabled="saving" @click="remove">
        {{ t('shortcutBinding.remove') }}
      </NButton>
    </template>
    <template #footer>
      <NButton @click="close">{{ t('common.cancel') }}</NButton>
      <NButton type="primary" :loading="saving" :disabled="!accelerator" @click="save">{{ t('common.confirm') }}</NButton>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NButton } from 'naive-ui';
import UiModal from '@/components/ui/UiModal.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import { displayAccelerator } from '@/lib/utils/accelerator';
import { describeShortcutError } from '@/lib/utils/shortcut-messages';
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

const keys = computed(() => accelerator.value
  ? displayAccelerator(accelerator.value).split(/\+|(?<=[⌘⌃⌥⇧])/).filter(Boolean)
  : []);
const actionOptions = computed(() => [
  { value: 'copy' as ShortcutAction, label: t('shortcuts.actionCopy') },
  { value: 'paste' as ShortcutAction, label: t('shortcuts.actionPaste') },
]);

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
    error.value = describeShortcutError(caught, t);
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
.binding {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.binding__intro {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.binding__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.binding__capture {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 112px;
  padding: 20px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
  color: var(--content-tertiary);
  font: inherit;
  cursor: pointer;
}

.binding__capture.is-capturing {
  border-color: var(--accent-brand);
}

.binding__capture.is-error {
  border-color: var(--accent-error);
}

.binding__keys {
  display: flex;
  gap: 6px;
}

.binding__key {
  height: 32px;
  padding: 0 12px;
  font-size: var(--font-size-lg);
}

.binding__hint {
  font-size: var(--font-size-xs);
}

.binding__capture.is-error .binding__hint {
  color: var(--accent-error);
}

.binding__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.binding__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}
</style>
