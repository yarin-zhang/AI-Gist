<template>
  <NFlex vertical :size="16">
    <NAlert v-if="state && !state.pasteCapability.permissionGranted" type="info" :title="t('shortcuts.autoPasteUnavailable')">
      {{ state.pasteCapability.reason }}
      <template v-if="state.pasteCapability.supported" #action>
        <NButton size="small" @click="requestPastePermission">{{ t('shortcuts.requestPermission') }}</NButton>
      </template>
    </NAlert>

    <NCard size="small" :title="t('shortcuts.globalCommands')">
      <NFlex vertical :size="16">
        <section v-for="command in commandRows" :key="command.id" class="shortcut-row">
          <div class="shortcut-copy">
            <NText strong>{{ command.label }}</NText>
            <NText depth="3" class="description">{{ command.description }}</NText>
          </div>
          <NTag size="small" :type="statusType(command.status?.state)">
            {{ statusLabel(command.status?.state) }}
          </NTag>
          <NButton secondary class="accelerator-button" @click="startCommandCapture(command.id)">
            {{ command.binding.accelerator ? displayAccelerator(command.binding.accelerator) : t('shortcuts.notSet') }}
          </NButton>
          <NSwitch :value="command.binding.enabled" @update:value="enabled => toggleCommand(command.id, enabled)" />
        </section>
      </NFlex>
    </NCard>

    <NCard size="small" :title="t('shortcuts.behavior')">
      <NFlex align="center" justify="space-between">
        <div>
          <NText strong>{{ t('shortcuts.defaultAction') }}</NText>
          <NText depth="3" class="description">{{ t('shortcuts.defaultActionDesc') }}</NText>
        </div>
        <NSelect
          style="width: 180px"
          :value="state?.preferences.defaultAction"
          :options="actionOptions"
          @update:value="updateDefaultAction"
        />
      </NFlex>
    </NCard>

    <NCard size="small" :title="t('shortcuts.promptBindings')">
      <NEmpty v-if="!state?.preferences.promptBindings.length" :description="t('shortcuts.noPromptBindings')" />
      <NFlex v-else vertical :size="8">
        <section v-for="binding in state.preferences.promptBindings" :key="binding.id" class="shortcut-row binding-row">
          <div class="shortcut-copy">
            <NText strong>{{ promptTitle(binding.promptUUID) }}</NText>
            <NText depth="3" class="description">
              {{ binding.action === 'paste' ? t('shortcuts.actionPaste') : t('shortcuts.actionCopy') }}
            </NText>
          </div>
          <NTag size="small" :type="statusType(bindingStatus(binding.id)?.state)">
            {{ statusLabel(bindingStatus(binding.id)?.state) }}
          </NTag>
          <NButton secondary class="accelerator-button" @click="editBinding(binding)">
            {{ displayAccelerator(binding.accelerator) }}
          </NButton>
          <NSwitch :value="binding.enabled" @update:value="enabled => toggleBinding(binding, enabled)" />
          <NButton text type="error" @click="removeBinding(binding.id)"><NIcon><Trash /></NIcon></NButton>
        </section>
      </NFlex>
      <template #footer>
        <NFlex justify="space-between" align="center">
          <NText depth="3">{{ t('shortcuts.assignFromPromptHint') }}</NText>
          <NButton secondary @click="resetAll">{{ t('shortcuts.resetToDefault') }}</NButton>
        </NFlex>
      </template>
    </NCard>

    <NModal :show="showCommandCapture" :mask-closable="false">
      <NCard class="capture-card" :title="t('shortcuts.inputShortcut')">
        <NFlex vertical align="center" :size="16">
          <NText>{{ t('shortcuts.pressShortcut') }}</NText>
          <NText strong class="captured-key">{{ capturedAccelerator || t('shortcuts.waitingInput') }}</NText>
          <NText v-if="captureError" type="error">{{ captureError }}</NText>
          <NSpace>
            <NButton @click="cancelCommandCapture">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :disabled="!capturedAccelerator" @click="saveCommandCapture">{{ t('common.confirm') }}</NButton>
          </NSpace>
        </NFlex>
      </NCard>
    </NModal>

    <ShortcutBindingModal
      v-if="editingBinding && promptFor(editingBinding.promptUUID)"
      :show="showBindingModal"
      :prompt-uuid="promptFor(editingBinding.promptUUID)!.uuid"
      :prompt-title="promptFor(editingBinding.promptUUID)!.title"
      :existing-binding="editingBinding"
      @close="showBindingModal = false"
      @saved="bindingSaved"
    />
  </NFlex>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  NAlert, NButton, NCard, NEmpty, NFlex, NIcon, NModal, NSelect, NSpace,
  NSwitch, NTag, NText, useMessage,
} from 'naive-ui';
import { Trash } from '@vicons/tabler';
import { useI18n } from 'vue-i18n';
import type {
  PromptShortcutBinding, PromptWithRelations, ShortcutAction, ShortcutCommandId,
  ShortcutRegistrationState, ShortcutRegistrationStatus, ShortcutState,
} from '@shared/types';
import { apiClientManager } from '@/lib/api';
import ShortcutBindingModal from '@/components/shortcuts/ShortcutBindingModal.vue';

const { t } = useI18n();
const message = useMessage();
const state = ref<ShortcutState | null>(null);
const prompts = ref<PromptWithRelations[]>([]);
const showCommandCapture = ref(false);
const captureCommandId = ref<ShortcutCommandId>('launcher');
const capturedAccelerator = ref('');
const captureError = ref('');
const showBindingModal = ref(false);
const editingBinding = ref<PromptShortcutBinding | null>(null);
let shortcutsDisabled = false;

const actionOptions = computed(() => [
  { label: t('shortcuts.actionCopy'), value: 'copy' },
  { label: t('shortcuts.actionPaste'), value: 'paste' },
]);

const commandRows = computed(() => state.value ? [
  {
    id: 'launcher' as const,
    label: t('shortcuts.launcherCommand'),
    description: t('shortcuts.launcherCommandDesc'),
    binding: state.value.preferences.commands.launcher,
    status: commandStatus('launcher'),
  },
  {
    id: 'showMainWindow' as const,
    label: t('shortcuts.showInterface'),
    description: t('shortcuts.showInterfaceDesc'),
    binding: state.value.preferences.commands.showMainWindow,
    status: commandStatus('showMainWindow'),
  },
] : []);

async function load(): Promise<void> {
  [state.value, prompts.value] = await Promise.all([
    window.electronAPI.shortcuts.getState(),
    apiClientManager.prompt.prompts.getAllForTags.query(),
  ]);
}

function commandStatus(id: ShortcutCommandId): ShortcutRegistrationStatus | undefined {
  return state.value?.registrations.find(status => status.id === `command:${id}`);
}

function bindingStatus(id: string): ShortcutRegistrationStatus | undefined {
  const binding = state.value?.preferences.promptBindings.find(item => item.id === id);
  if (binding && !promptFor(binding.promptUUID)) {
    return { id: `prompt:${id}`, accelerator: binding.accelerator, state: 'invalid-target' };
  }
  return state.value?.registrations.find(status => status.id === `prompt:${id}`);
}

function statusType(status?: ShortcutRegistrationState): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'registered') return 'success';
  if (status === 'disabled') return 'default';
  if (status === 'conflict' || status === 'invalid-target') return 'error';
  return 'warning';
}

function statusLabel(status?: ShortcutRegistrationState): string {
  const labels: Record<ShortcutRegistrationState, string> = {
    registered: t('shortcuts.registered'), disabled: t('shortcuts.disabled'),
    conflict: t('shortcuts.conflict'), unsupported: t('shortcuts.unsupported'),
    'invalid-target': t('shortcuts.invalidTarget'),
  };
  return status ? labels[status] : t('shortcuts.notRegistered');
}

function promptFor(uuid: string): PromptWithRelations | undefined {
  if (uuid.startsWith('legacy-id:')) {
    const id = Number(uuid.slice('legacy-id:'.length));
    return prompts.value.find(prompt => prompt.id === id);
  }
  return prompts.value.find(prompt => prompt.uuid === uuid);
}

function promptTitle(uuid: string): string {
  return promptFor(uuid)?.title || t('shortcuts.missingPrompt');
}

function displayAccelerator(accelerator: string): string {
  if (!navigator.platform.includes('Mac')) return accelerator.replace(/CommandOrControl/g, 'Ctrl').replace(/Control/g, 'Ctrl');
  return accelerator.replace(/CommandOrControl|Command/g, '⌘').replace(/Control/g, '⌃').replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '');
}

function eventAccelerator(event: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push('Command');
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return '';
  let key = event.code.startsWith('Key') ? event.code.slice(3) : event.code.startsWith('Digit') ? event.code.slice(5) : event.key;
  if (event.code === 'Space') key = 'Space';
  return [...modifiers, key].join('+');
}

function handleCaptureKey(event: KeyboardEvent): void {
  if (!showCommandCapture.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') return void cancelCommandCapture();
  const value = eventAccelerator(event);
  if (value) {
    capturedAccelerator.value = value;
    captureError.value = '';
  }
}

async function startCommandCapture(id: ShortcutCommandId): Promise<void> {
  captureCommandId.value = id;
  capturedAccelerator.value = state.value?.preferences.commands[id].accelerator || '';
  captureError.value = '';
  await window.electronAPI.shortcuts.temporarilyDisable();
  shortcutsDisabled = true;
  showCommandCapture.value = true;
}

async function restoreShortcuts(): Promise<void> {
  if (!shortcutsDisabled) return;
  shortcutsDisabled = false;
  await window.electronAPI.shortcuts.restore();
}

async function cancelCommandCapture(): Promise<void> {
  showCommandCapture.value = false;
  await restoreShortcuts();
}

async function saveCommandCapture(): Promise<void> {
  try {
    await window.electronAPI.shortcuts.updateCommand(captureCommandId.value, {
      accelerator: capturedAccelerator.value,
      enabled: true,
    });
    showCommandCapture.value = false;
    await restoreShortcuts();
    state.value = await window.electronAPI.shortcuts.getState();
  } catch (caught) {
    captureError.value = caught instanceof Error ? caught.message : String(caught);
  }
}

async function toggleCommand(id: ShortcutCommandId, enabled: boolean): Promise<void> {
  try {
    state.value = await window.electronAPI.shortcuts.updateCommand(id, { enabled });
  } catch (caught) {
    message.error(caught instanceof Error ? caught.message : String(caught));
  }
}

async function toggleBinding(binding: PromptShortcutBinding, enabled: boolean): Promise<void> {
  try {
    state.value = await window.electronAPI.shortcuts.upsertPromptBinding({ ...binding, enabled });
  } catch (caught) {
    message.error(caught instanceof Error ? caught.message : String(caught));
  }
}

function editBinding(binding: PromptShortcutBinding): void {
  const prompt = promptFor(binding.promptUUID);
  if (!prompt) return;
  editingBinding.value = binding;
  showBindingModal.value = true;
}

async function bindingSaved(): Promise<void> {
  showBindingModal.value = false;
  await load();
}

async function removeBinding(id: string): Promise<void> {
  state.value = await window.electronAPI.shortcuts.removePromptBinding(id);
}

async function updateDefaultAction(action: ShortcutAction): Promise<void> {
  if (!state.value) return;
  await window.electronAPI.preferences.set({ shortcuts: { ...state.value.preferences, defaultAction: action } });
  await window.electronAPI.shortcuts.reregister();
  state.value = await window.electronAPI.shortcuts.getState();
}

async function requestPastePermission(): Promise<void> {
  await window.electronAPI.shortcuts.requestPastePermission();
  state.value = await window.electronAPI.shortcuts.getState();
}

async function resetAll(): Promise<void> {
  await window.electronAPI.preferences.set({
    shortcuts: {
      version: 2,
      defaultAction: 'copy',
      commands: {
        launcher: { accelerator: 'CommandOrControl+Shift+G', enabled: true },
        showMainWindow: { accelerator: '', enabled: false },
      },
      promptBindings: [],
      recentPromptUUIDs: state.value?.preferences.recentPromptUUIDs || [],
    },
  });
  await window.electronAPI.shortcuts.reregister();
  await load();
  message.success(t('shortcuts.resetSuccess'));
}

window.addEventListener('keydown', handleCaptureKey, true);
onMounted(load);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCaptureKey, true);
  void restoreShortcuts();
});
</script>

<style scoped>
.shortcut-row { display: grid; grid-template-columns: minmax(180px, 1fr) auto 190px auto; gap: 12px; align-items: center; }
.binding-row { grid-template-columns: minmax(180px, 1fr) auto 190px auto auto; }
.shortcut-copy { min-width: 0; }
.description { display: block; margin-top: 4px; font-size: 12px; }
.accelerator-button { justify-content: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.capture-card { width: min(420px, calc(100vw - 32px)); }
.captured-key { font-size: 20px; color: var(--n-color-target); }
@media (max-width: 800px) {
  .shortcut-row, .binding-row { grid-template-columns: 1fr auto; }
  .accelerator-button { grid-column: 1 / -1; }
}
</style>
