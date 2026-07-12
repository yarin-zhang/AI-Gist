<template>
  <div class="launcher-shell" @keydown="handleKeydown">
    <div v-if="mode === 'search'" class="launcher-panel">
      <NInput
        ref="searchInput"
        v-model:value="query"
        size="large"
        clearable
        :placeholder="t('shortcuts.launcherPlaceholder')"
        @update:value="selectedIndex = 0"
      >
        <template #prefix><NIcon><Search /></NIcon></template>
      </NInput>

      <div class="result-list">
        <button
          v-for="(item, index) in results"
          :key="item.key"
          class="result-row"
          :class="{ selected: index === selectedIndex }"
          @mouseenter="selectedIndex = index"
          @click="executeItem(item, state?.preferences.defaultAction || 'copy')"
        >
          <NIcon size="20"><component :is="item.kind === 'prompt' ? FileText : item.icon" /></NIcon>
          <div class="result-copy">
            <NText strong>{{ item.label }}</NText>
            <NText depth="3" class="result-description">{{ item.description }}</NText>
          </div>
          <NTag v-if="item.kind === 'prompt' && bindingFor(item.prompt.uuid)" size="small" :bordered="false">
            {{ displayAccelerator(bindingFor(item.prompt.uuid)!.accelerator) }}
          </NTag>
          <NTag v-else-if="item.kind === 'prompt' && runtimeVariables(item.prompt).length" size="small" type="info" :bordered="false">
            {{ t('shortcuts.variablesCount', { count: runtimeVariables(item.prompt).length }) }}
          </NTag>
        </button>
        <NEmpty v-if="results.length === 0" :description="t('shortcuts.noLauncherResults')" size="small" />
      </div>

      <div class="launcher-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('shortcuts.navigate') }}</span>
        <span><kbd>Enter</kbd> {{ state?.preferences.defaultAction === 'paste' ? t('shortcuts.actionPaste') : t('shortcuts.actionCopy') }}</span>
        <span><kbd>{{ modifierLabel }}</kbd><kbd>Enter</kbd> {{ t('shortcuts.actionPaste') }}</span>
        <span><kbd>{{ modifierLabel }}</kbd><kbd>K</kbd> {{ t('shortcuts.actions') }}</span>
      </div>
    </div>

    <div v-else class="launcher-panel variable-panel">
      <NFlex align="center" justify="space-between">
        <div>
          <NText strong class="variable-title">{{ activePrompt?.title }}</NText>
          <NText depth="3" class="result-description">{{ t('shortcuts.fillVariablesDesc') }}</NText>
        </div>
        <NButton text @click="backToSearch"><NIcon><X /></NIcon></NButton>
      </NFlex>
      <div class="variable-form">
        <NFormItem
          v-for="variable in activeVariables"
          :key="variable.name"
          :label="variable.name"
          :required="variable.required"
        >
          <NSwitch v-if="variable.type === 'boolean' || variable.type === 'bool'" v-model:value="variableValues[variable.name]" />
          <NInputNumber
            v-else-if="['number', 'int', 'float'].includes(variable.type)"
            v-model:value="variableValues[variable.name]"
            style="width: 100%"
          />
          <NSelect
            v-else-if="variable.type === 'select'"
            v-model:value="variableValues[variable.name]"
            :options="(variable.options || []).map(option => ({ label: option, value: option }))"
          />
          <NInput
            v-else
            v-model:value="variableValues[variable.name]"
            :type="variable.type === 'textarea' ? 'textarea' : 'text'"
            :placeholder="variable.placeholder || variable.description"
          />
        </NFormItem>
      </div>
      <NAlert v-if="executionError" type="error" :show-icon="false">{{ executionError }}</NAlert>
      <NFlex justify="flex-end">
        <NButton @click="backToSearch">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="executing" :disabled="missingRequired" @click="executeActivePrompt">
          {{ desiredAction === 'paste' ? t('shortcuts.copyAndPaste') : t('shortcuts.copyPrompt') }}
        </NButton>
      </NFlex>
    </div>

    <ShortcutBindingModal
      v-if="bindingPrompt"
      :show="showBindingModal"
      :prompt-uuid="bindingPrompt.uuid"
      :prompt-title="bindingPrompt.title"
      :existing-binding="bindingFor(bindingPrompt.uuid)"
      @close="showBindingModal = false"
      @saved="handleBindingSaved"
    />

    <NModal :show="showActionModal" @update:show="value => showActionModal = value">
      <NCard v-if="bindingPrompt" class="action-card" :title="bindingPrompt.title">
        <NFlex vertical :size="8">
          <NButton block @click="openPromptDetail">{{ t('promptManagement.detailModal.detail') }}</NButton>
          <NButton block type="primary" @click="openBindingEditor">
            {{ bindingFor(bindingPrompt.uuid) ? t('shortcuts.editPromptBinding') : t('shortcuts.assignPromptBinding') }}
          </NButton>
        </NFlex>
      </NCard>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  NAlert, NButton, NEmpty, NFlex, NFormItem, NIcon, NInput, NInputNumber,
  NSelect, NSwitch, NTag, NText, NModal, NCard, type InputInst,
} from 'naive-ui';
import { FilePlus, FileText, Keyboard, Search, Settings, X } from '@vicons/tabler';
import { useI18n } from 'vue-i18n';
import type { PromptShortcutBinding, PromptWithRelations, ShortcutAction, ShortcutInvocation, ShortcutState } from '@shared/types';
import { apiClientManager } from '@/lib/api';
import {
  createDefaultVariableValues,
  getRuntimeVariables,
  hasMissingRequiredValues,
  renderPromptContent,
} from '@/lib/utils/prompt-runtime';
import ShortcutBindingModal from './ShortcutBindingModal.vue';

type PromptResult = { kind: 'prompt'; key: string; label: string; description: string; prompt: PromptWithRelations };
type CommandResult = {
  kind: 'command'; key: string; label: string; description: string; icon: any;
  target: 'home' | 'new-prompt' | 'shortcuts';
};
type LauncherResult = PromptResult | CommandResult;

const { t } = useI18n();
const searchInput = ref<InputInst | null>(null);
const prompts = ref<PromptWithRelations[]>([]);
const state = ref<ShortcutState | null>(null);
const query = ref('');
const selectedIndex = ref(0);
const mode = ref<'search' | 'variables'>('search');
const activePrompt = ref<PromptWithRelations | null>(null);
const activeVariables = computed(() => activePrompt.value ? getRuntimeVariables(activePrompt.value) : []);
const variableValues = ref<Record<string, any>>({});
const desiredAction = ref<ShortcutAction>('copy');
const executing = ref(false);
const executionError = ref('');
const showBindingModal = ref(false);
const showActionModal = ref(false);
const bindingPrompt = ref<PromptWithRelations | null>(null);
const modifierLabel = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

const commands = computed<CommandResult[]>(() => [
  { kind: 'command', key: 'command:home', label: t('shortcuts.commandOpenApp'), description: t('shortcuts.commandOpenAppDesc'), icon: markRaw(FileText), target: 'home' },
  { kind: 'command', key: 'command:new', label: t('shortcuts.commandNewPrompt'), description: t('shortcuts.commandNewPromptDesc'), icon: markRaw(FilePlus), target: 'new-prompt' },
  { kind: 'command', key: 'command:settings', label: t('shortcuts.commandManage'), description: t('shortcuts.commandManageDesc'), icon: markRaw(Settings), target: 'shortcuts' },
]);

function normalizedTags(prompt: PromptWithRelations): string {
  return Array.isArray(prompt.tags) ? prompt.tags.join(' ') : String(prompt.tags || '');
}

function scorePrompt(prompt: PromptWithRelations, search: string): number {
  const needle = search.toLowerCase().trim();
  let score = prompt.isFavorite ? 30 : 0;
  score += Math.min(prompt.useCount || 0, 100);
  const recentIndex = state.value?.preferences.recentPromptUUIDs.indexOf(prompt.uuid) ?? -1;
  if (recentIndex >= 0) score += 100 - recentIndex * 3;
  if (!needle) return score;
  const title = prompt.title.toLowerCase();
  const tags = normalizedTags(prompt).toLowerCase();
  const category = prompt.category?.name?.toLowerCase() || '';
  const content = prompt.content.toLowerCase();
  let matchScore = 0;
  if (title === needle) matchScore += 1000;
  else if (title.startsWith(needle)) matchScore += 700;
  else if (title.includes(needle)) matchScore += 500;
  if (tags.includes(needle)) matchScore += 300;
  if (category.includes(needle)) matchScore += 250;
  if (content.includes(needle)) matchScore += 100;
  if (matchScore === 0) return -1;
  score += matchScore;
  return score;
}

const results = computed<LauncherResult[]>(() => {
  const needle = query.value.trim().toLowerCase();
  const promptResults = prompts.value
    .filter(prompt => prompt.isActive !== false)
    .map(prompt => ({ prompt, score: scorePrompt(prompt, needle) }))
    .filter(item => !needle || item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ prompt }): PromptResult => ({
      kind: 'prompt', key: `prompt:${prompt.uuid}`, label: prompt.title,
      description: [prompt.category?.name, normalizedTags(prompt)].filter(Boolean).join(' · ') || prompt.content.slice(0, 80),
      prompt,
    }));
  const commandResults = commands.value.filter(command => !needle || `${command.label} ${command.description}`.toLowerCase().includes(needle));
  return [...promptResults, ...commandResults];
});

const missingRequired = computed(() => activePrompt.value ? hasMissingRequiredValues(activePrompt.value, variableValues.value) : true);

function bindingFor(promptUUID: string): PromptShortcutBinding | undefined {
  return state.value?.preferences.promptBindings.find(binding => binding.promptUUID === promptUUID);
}

function runtimeVariables(prompt: PromptWithRelations) {
  return getRuntimeVariables(prompt);
}

function displayAccelerator(accelerator: string): string {
  if (!navigator.platform.includes('Mac')) return accelerator.replace(/CommandOrControl/g, 'Ctrl').replace(/Control/g, 'Ctrl');
  return accelerator.replace(/CommandOrControl|Command/g, '⌘').replace(/Control/g, '⌃').replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '');
}

async function loadData(): Promise<void> {
  const [allPrompts, shortcutState] = await Promise.all([
    apiClientManager.prompt.prompts.getAllForTags.query(),
    window.electronAPI.shortcuts.getState(),
  ]);
  prompts.value = allPrompts;
  state.value = shortcutState;
  const invalidBindingIds: string[] = [];
  const boundPromptUUIDs = new Set<string>();
  for (const binding of shortcutState.preferences.promptBindings) {
    const target = binding.promptUUID.startsWith('legacy-id:')
      ? allPrompts.find(prompt => prompt.id === Number(binding.promptUUID.slice('legacy-id:'.length)))
      : allPrompts.find(prompt => prompt.uuid === binding.promptUUID);
    if (!target) invalidBindingIds.push(binding.id);
    else {
      boundPromptUUIDs.add(target.uuid);
      if (binding.promptUUID.startsWith('legacy-id:')) {
        await window.electronAPI.shortcuts.resolveLegacyBinding(binding.id, target.uuid);
      }
    }
  }
  for (const prompt of allPrompts) {
    if (!prompt.isShortcutTrigger || !prompt.shortcutKey) continue;
    if (boundPromptUUIDs.has(prompt.uuid)) continue;
    try {
      await window.electronAPI.shortcuts.upsertPromptBinding({
        promptUUID: prompt.uuid,
        accelerator: prompt.shortcutKey,
        action: 'copy',
        enabled: true,
      });
      boundPromptUUIDs.add(prompt.uuid);
    } catch (error) {
      console.warn('无法迁移旧提示词快捷键:', prompt.title, error);
    }
  }
  for (const bindingId of invalidBindingIds) {
    await window.electronAPI.shortcuts.markInvalidTarget(bindingId);
  }
  state.value = await window.electronAPI.shortcuts.getState();
}

async function findPrompt(promptUUID: string): Promise<PromptWithRelations | null> {
  if (promptUUID.startsWith('legacy-id:')) {
    const id = Number(promptUUID.slice('legacy-id:'.length));
    return Number.isFinite(id) ? apiClientManager.prompt.prompts.getById.query(id) : null;
  }
  return apiClientManager.prompt.prompts.getByUUID.query(promptUUID);
}

async function handleInvocation(invocation: ShortcutInvocation): Promise<void> {
  executionError.value = '';
  if (invocation.kind === 'launcher') {
    mode.value = 'search';
    query.value = '';
    selectedIndex.value = 0;
    await loadData();
    await nextTick();
    searchInput.value?.focus();
    return;
  }
  if (!invocation.promptUUID) return;
  const prompt = await findPrompt(invocation.promptUUID);
  if (!prompt) {
    if (invocation.bindingId) await window.electronAPI.shortcuts.markInvalidTarget(invocation.bindingId);
    return;
  }
  if (invocation.promptUUID.startsWith('legacy-id:') && invocation.bindingId) {
    await window.electronAPI.shortcuts.resolveLegacyBinding(invocation.bindingId, prompt.uuid);
  }
  await preparePrompt(prompt, invocation.action || 'copy');
}

async function preparePrompt(prompt: PromptWithRelations, action: ShortcutAction): Promise<void> {
  activePrompt.value = prompt;
  desiredAction.value = action;
  variableValues.value = createDefaultVariableValues(prompt);
  if (getRuntimeVariables(prompt).length > 0) {
    mode.value = 'variables';
    await window.electronAPI.shortcuts.showLauncher();
    return;
  }
  await executeActivePrompt();
}

async function executeActivePrompt(): Promise<void> {
  if (!activePrompt.value || missingRequired.value) return;
  executing.value = true;
  executionError.value = '';
  try {
    const content = renderPromptContent(activePrompt.value, variableValues.value);
    await window.electronAPI.shortcuts.executeText({
      promptUUID: activePrompt.value.uuid,
      title: activePrompt.value.title,
      content,
      action: desiredAction.value,
    });
    if (activePrompt.value.id) await apiClientManager.prompt.prompts.incrementUseCount.mutate(activePrompt.value.id);
    const historyKey = `prompt_history_${activePrompt.value.id}`;
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    history.unshift({ date: new Date().toISOString(), content, variables: { ...variableValues.value } });
    localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 50)));
    state.value = await window.electronAPI.shortcuts.getState();
    mode.value = 'search';
  } catch (caught) {
    executionError.value = caught instanceof Error ? caught.message : String(caught);
    await window.electronAPI.shortcuts.showLauncher();
  } finally {
    executing.value = false;
  }
}

async function executeItem(item: LauncherResult, action: ShortcutAction): Promise<void> {
  if (item.kind === 'command') {
    await window.electronAPI.shortcuts.navigateMain(item.target);
    return;
  }
  await preparePrompt(item.prompt, action);
}

function backToSearch(): void {
  mode.value = 'search';
  activePrompt.value = null;
  executionError.value = '';
  nextTick(() => searchInput.value?.focus());
}

function openActions(): void {
  const item = results.value[selectedIndex.value];
  if (!item || item.kind !== 'prompt') return;
  bindingPrompt.value = item.prompt;
  showActionModal.value = true;
}

function openBindingEditor(): void {
  showActionModal.value = false;
  showBindingModal.value = true;
}

async function openPromptDetail(): Promise<void> {
  if (!bindingPrompt.value) return;
  showActionModal.value = false;
  await window.electronAPI.shortcuts.navigateMain('home', bindingPrompt.value.uuid);
}

async function handleBindingSaved(): Promise<void> {
  showBindingModal.value = false;
  await loadData();
  await window.electronAPI.shortcuts.showLauncher();
}

function handleKeydown(event: KeyboardEvent): void {
  if (showBindingModal.value) return;
  if (showActionModal.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      showActionModal.value = false;
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (mode.value === 'variables') backToSearch();
    else void window.electronAPI.shortcuts.hideLauncher();
    return;
  }
  if (mode.value !== 'search') {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void executeActivePrompt();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    selectedIndex.value = (selectedIndex.value + direction + results.value.length) % Math.max(results.value.length, 1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const item = results.value[selectedIndex.value];
    if (item) void executeItem(item, event.ctrlKey || event.metaKey ? 'paste' : (state.value?.preferences.defaultAction || 'copy'));
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openActions();
  }
}

let removeInvocationListener: (() => void) | undefined;
onMounted(async () => {
  removeInvocationListener = window.electronAPI.shortcuts.onLauncherInvocation(invocation => void handleInvocation(invocation));
  await loadData();
  window.electronAPI.shortcuts.launcherReady();
});
onBeforeUnmount(() => removeInvocationListener?.());
</script>

<style scoped>
.launcher-shell { width: 100vw; height: 100vh; padding: 12px; box-sizing: border-box; background: transparent; }
.launcher-panel { height: 100%; box-sizing: border-box; padding: 16px; border-radius: 14px; background: var(--n-color); box-shadow: 0 18px 60px rgba(0, 0, 0, .28); border: 1px solid var(--n-border-color); display: flex; flex-direction: column; gap: 12px; }
.result-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.result-row { width: 100%; border: 0; background: transparent; color: inherit; border-radius: 8px; padding: 9px 10px; display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; }
.result-row.selected { background: var(--n-color-hover); }
.result-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.result-description { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.launcher-footer { border-top: 1px solid var(--n-border-color); padding-top: 10px; display: flex; gap: 16px; color: var(--n-text-color-3); font-size: 12px; }
kbd { padding: 1px 5px; border: 1px solid var(--n-border-color); border-radius: 4px; background: var(--n-color-embedded); margin-right: 2px; }
.variable-panel { gap: 16px; }
.variable-title { font-size: 16px; }
.variable-form { flex: 1; overflow-y: auto; padding-right: 4px; }
.action-card { width: min(360px, calc(100vw - 32px)); }
</style>
