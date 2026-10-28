<template>
  <div class="shortcut-settings">
    <UiPageHeader :title="t('settings.sections.shortcuts')" :description="t('settings.sectionDescriptions.shortcuts.description')">
      <template #actions>
        <NButton quaternary @click="resetAll">{{ t('shortcuts.resetToDefault') }}</NButton>
      </template>
    </UiPageHeader>

    <div v-if="state && !state.pasteCapability.permissionGranted" class="ui-alert ui-alert--warning shortcut-settings__alert">
      <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><AlertTriangle /></NIcon>
      <span class="shortcut-settings__alert-text">
        {{ t('shortcuts.autoPasteUnavailable') }}<template v-if="state.pasteCapability.reason">：{{ state.pasteCapability.reason }}</template>
      </span>
      <NButton v-if="state.pasteCapability.supported" size="tiny" @click="requestPastePermission">{{ t('shortcuts.requestPermission') }}</NButton>
    </div>

    <UiPanel :title="t('shortcuts.globalCommands')" body="rows">
      <UiSettingRow v-for="command in commandRows" :key="command.id" :title="command.label" :description="command.description">
        <span class="shortcut-settings__controls">
          <span class="ui-tag" :class="statusClass(command.binding.accelerator ? command.status?.state : undefined, !command.binding.accelerator)">
            {{ command.binding.accelerator ? statusLabel(command.status?.state) : t('shortcuts.notSet') }}
          </span>
          <NButton class="shortcut-settings__key" :class="{ 'ui-mono': command.binding.accelerator }" @click="startCommandCapture(command.id)">
            {{ command.binding.accelerator ? displayAccelerator(command.binding.accelerator) : t('shortcuts.inputShortcut') }}
          </NButton>
          <NSwitch :value="command.binding.enabled" :aria-label="command.label" @update:value="enabled => toggleCommand(command.id, enabled)" />
        </span>
      </UiSettingRow>
    </UiPanel>

    <UiPanel :title="t('shortcuts.behavior')" body="rows">
      <UiSettingRow :title="t('shortcuts.defaultAction')" :description="t('shortcuts.defaultActionDesc')">
        <UiSegmented :model-value="state?.preferences.defaultAction || 'copy'" :options="actionOptions"
          :label="t('shortcuts.defaultAction')" @update:model-value="updateDefaultAction" />
      </UiSettingRow>
    </UiPanel>

    <UiPanel :title="t('shortcuts.promptBindings')" body="flush">
      <template #actions><span class="shortcut-settings__hint">{{ t('shortcuts.assignFromPromptHint') }}</span></template>
      <div v-if="!state?.preferences.promptBindings.length" class="shortcut-settings__empty">{{ t('shortcuts.noPromptBindings') }}</div>
      <table v-else class="binding-table">
        <thead>
          <tr>
            <th>{{ t('shortcuts.bindingPrompt') }}</th>
            <th>{{ t('shortcuts.bindingKey') }}</th>
            <th>{{ t('shortcutBinding.afterPress') }}</th>
            <th>{{ t('shortcuts.bindingStatus') }}</th>
            <th class="binding-table__actions"><span class="sr-only">{{ t('shortcuts.actions') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="binding in state.preferences.promptBindings" :key="binding.id">
            <td class="binding-table__title">{{ promptTitle(binding.promptUUID) }}</td>
            <td class="ui-mono binding-table__key">{{ displayAccelerator(binding.accelerator) }}</td>
            <td>{{ binding.action === 'paste' ? t('shortcuts.actionPaste') : t('shortcuts.actionCopy') }}</td>
            <td><span class="ui-tag" :class="statusClass(bindingStatus(binding.id)?.state)">{{ statusLabel(bindingStatus(binding.id)?.state) }}</span></td>
            <td class="binding-table__actions">
              <span class="binding-table__buttons">
                <NSwitch size="small" :value="binding.enabled" :aria-label="t('shortcuts.enableBinding', { name: promptTitle(binding.promptUUID) })"
                  @update:value="enabled => toggleBinding(binding, enabled)" />
                <NButton v-if="promptFor(binding.promptUUID)" quaternary size="tiny" class="binding-table__icon"
                  :aria-label="t('shortcuts.editBindingFor', { name: promptTitle(binding.promptUUID) })" @click="editBinding(binding)">
                  <template #icon><NIcon :size="14"><Edit /></NIcon></template>
                </NButton>
                <NButton v-else quaternary size="tiny" type="error" class="binding-table__icon"
                  :aria-label="t('shortcuts.removeBindingFor', { name: promptTitle(binding.promptUUID) })" @click="removeBinding(binding.id)">
                  <template #icon><NIcon :size="14"><Trash /></NIcon></template>
                </NButton>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </UiPanel>

    <UiModal :show="showCommandCapture" :title="t('shortcuts.inputShortcut')" :close-label="t('common.close')" @close="cancelCommandCapture">
      <div class="capture">
        <span class="capture__hint">{{ t('shortcuts.pressShortcut') }}</span>
        <span class="capture__keys">
          <template v-if="capturedKeys.length">
            <span v-for="key in capturedKeys" :key="key" class="ui-kbd capture__key">{{ key }}</span>
          </template>
          <span v-else class="capture__waiting">{{ t('shortcuts.waitingInput') }}</span>
        </span>
        <span v-if="captureError" class="capture__error" role="alert">{{ captureError }}</span>
      </div>
      <template #footer>
        <NButton @click="cancelCommandCapture">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :disabled="!capturedAccelerator" @click="saveCommandCapture">{{ t('common.confirm') }}</NButton>
      </template>
    </UiModal>

    <ShortcutBindingModal
      v-if="editingBinding && promptFor(editingBinding.promptUUID)"
      :show="showBindingModal"
      :prompt-uuid="promptFor(editingBinding.promptUUID)!.uuid"
      :prompt-title="promptFor(editingBinding.promptUUID)!.title"
      :existing-binding="editingBinding"
      @close="showBindingModal = false"
      @saved="bindingSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NIcon, NSwitch, useMessage } from 'naive-ui';
import { AlertTriangle, Edit, Trash } from '@vicons/tabler';
import { useI18n } from 'vue-i18n';
import type {
  PromptShortcutBinding, PromptWithRelations, ShortcutAction, ShortcutCommandId,
  ShortcutRegistrationState, ShortcutRegistrationStatus, ShortcutState,
} from '@shared/types';
import { apiClientManager } from '@/lib/api';
import ShortcutBindingModal from '@/components/shortcuts/ShortcutBindingModal.vue';
import UiModal from '@/components/ui/UiModal.vue';
import UiPageHeader from '@/components/ui/UiPageHeader.vue';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';
import { displayAccelerator } from '@/lib/utils/accelerator';

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
  { label: t('shortcuts.actionCopy'), value: 'copy' as ShortcutAction },
  { label: t('shortcuts.actionPaste'), value: 'paste' as ShortcutAction },
]);
const capturedKeys = computed(() => {
  const display = displayAccelerator(capturedAccelerator.value);
  if (!display) return [];
  return display.includes('+') ? display.split('+') : Array.from(display.match(/[⌘⌃⌥⇧]|[^⌘⌃⌥⇧]+/g) || []);
});

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

function statusClass(status?: ShortcutRegistrationState, unset = false): string {
  if (unset || status === 'disabled') return '';
  if (status === 'registered') return 'ui-tag--success';
  if (status === 'conflict' || status === 'invalid-target') return 'ui-tag--error';
  return 'ui-tag--warning';
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
.shortcut-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shortcut-settings__alert {
  align-items: center;
}

.shortcut-settings__alert-text {
  flex: 1;
  min-width: 0;
}

.shortcut-settings__controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.shortcut-settings__key.ui-mono {
  font-size: var(--font-size-sm);
}

.shortcut-settings__hint {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.shortcut-settings__empty {
  padding: 24px 16px;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.binding-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.binding-table th {
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-align: left;
}

.binding-table td {
  height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--content-primary);
}

.binding-table tr:last-child td {
  border-bottom: 0;
}

.binding-table__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.binding-table__actions {
  width: 1%;
  white-space: nowrap;
}

.binding-table__buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.binding-table__icon {
  width: 22px;
  padding: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.capture {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.capture__hint {
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.capture__keys {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
}

.capture__key {
  min-width: 32px;
  height: 32px;
  font-size: var(--font-size-base);
}

.capture__waiting {
  color: var(--content-tertiary);
}

.capture__error {
  color: var(--accent-error);
  font-size: var(--font-size-sm);
}
</style>
