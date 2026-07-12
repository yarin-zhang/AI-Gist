<template>
  <div class="launcher-shell">
    <NCard v-if="mode === 'search'" class="launcher-card" size="small" :bordered="true">
      <template #header>
        <NInput
          ref="searchInput"
          v-model:value="query"
          size="medium"
          clearable
          autofocus
          :placeholder="t('shortcuts.launcherPlaceholder')"
          :input-props="searchInputProps"
          @update:value="handleQueryChanged"
        >
          <template #prefix><NIcon><Search /></NIcon></template>
          <template #suffix><NText depth="3" class="escape-hint">Esc</NText></template>
        </NInput>
      </template>

      <NScrollbar ref="resultScrollbar" class="result-scrollbar">
        <NList id="prompt-launcher-results" v-if="results.length" hoverable clickable :show-divider="false">
          <NListItem
            v-for="(item, index) in results"
            :id="resultDomId(item)"
            :key="item.key"
            :ref="element => setResultElement(element, index)"
            class="launcher-result"
            :class="{
              'launcher-result--selected': index === selectedIndex,
              'launcher-result--with-extra': item.kind === 'prompt' && hasPromptExtra(item.prompt),
            }"
            role="option"
            :aria-selected="index === selectedIndex"
            @mouseenter="selectResult(index)"
            @click="executeItem(item, state?.preferences.defaultAction || 'copy')"
          >
            <NThing>
              <template #avatar>
                <NIcon size="16" class="result-icon" :class="{ 'result-icon--selected': index === selectedIndex }">
                  <component :is="item.kind === 'prompt' ? FileText : item.icon" />
                </NIcon>
              </template>
              <template #header>
                <NText :strong="index === selectedIndex">{{ item.label }}</NText>
              </template>
              <template #description>
                <NText depth="3" class="result-description">{{ item.description }}</NText>
              </template>
              <template #header-extra>
                <NFlex
                  v-if="item.kind === 'prompt' && hasPromptExtra(item.prompt)"
                  :size="6"
                  :wrap="false"
                  align="center"
                  justify="end"
                  class="result-extra"
                >
                  <NFlex
                    v-if="item.prompt.category?.name || promptTags(item.prompt).length"
                    :size="4"
                    :wrap="false"
                    align="center"
                    justify="end"
                    class="result-taxonomy"
                  >
                    <NTag
                      v-if="item.prompt.category?.name"
                      size="small"
                      :bordered="false"
                      :color="getCategoryTagColor(item.prompt.category)"
                      class="result-category"
                    >
                      {{ item.prompt.category.name }}
                    </NTag>
                    <NTag
                      v-for="tag in visiblePromptTags(item.prompt)"
                      :key="tag"
                      size="small"
                      :bordered="false"
                      :color="getTagColor(tag)"
                      class="result-tag"
                    >
                      {{ tag }}
                    </NTag>
                    <NText v-if="hiddenPromptTagCount(item.prompt)" depth="3" class="result-tag-overflow">
                      +{{ hiddenPromptTagCount(item.prompt) }}
                    </NText>
                  </NFlex>
                  <NDivider
                    v-if="hasPromptTaxonomy(item.prompt) && (bindingFor(item.prompt.uuid) || runtimeVariables(item.prompt).length)"
                    vertical
                  />
                  <NText v-if="bindingFor(item.prompt.uuid)" depth="3" class="result-meta">
                    {{ displayAccelerator(bindingFor(item.prompt.uuid)!.accelerator) }}
                  </NText>
                  <NText v-else-if="runtimeVariables(item.prompt).length" depth="3" class="result-meta">
                    {{ t('shortcuts.variablesCount', { count: runtimeVariables(item.prompt).length }) }}
                  </NText>
                </NFlex>
              </template>
            </NThing>
          </NListItem>
        </NList>
        <NEmpty v-else :description="t('shortcuts.noLauncherResults')" size="small" />
      </NScrollbar>

      <template #footer>
        <NFlex justify="space-between" align="center" :wrap="false">
          <NText depth="3" class="result-count">{{ t('shortcuts.resultCount', { count: results.length }) }}</NText>
          <NFlex :size="8" :wrap="false" align="center" class="keyboard-hints">
            <span><span class="key-cap">↑↓</span> {{ t('shortcuts.navigate') }}</span>
            <NDivider vertical />
            <span><span class="key-cap">Enter</span> {{ defaultActionLabel }}</span>
            <NDivider vertical />
            <span><span class="key-cap">{{ modifierLabel }} K</span> {{ t('shortcuts.actions') }}</span>
          </NFlex>
        </NFlex>
      </template>
    </NCard>

    <NCard v-else class="launcher-card variable-card" size="small" :bordered="true">
      <template #header>
        <NFlex align="center" justify="space-between">
          <div>
            <NText strong class="variable-title">{{ activePrompt?.title }}</NText>
            <NText depth="3" class="variable-description">{{ t('shortcuts.fillVariablesDesc') }}</NText>
          </div>
          <NButton circle quaternary @click="backToSearch"><template #icon><NIcon><X /></NIcon></template></NButton>
        </NFlex>
      </template>
      <NScrollbar class="variable-scrollbar">
        <NForm label-placement="top">
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
        </NForm>
      </NScrollbar>
      <NAlert v-if="executionError" type="error" :show-icon="false">{{ executionError }}</NAlert>
      <template #footer>
        <NFlex justify="flex-end">
          <NButton @click="backToSearch">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="executing" :disabled="missingRequired" @click="executeActivePrompt">
            {{ desiredAction === 'paste' ? t('shortcuts.copyAndPaste') : t('shortcuts.copyPrompt') }}
          </NButton>
        </NFlex>
      </template>
    </NCard>

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
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import {
  NAlert, NButton, NCard, NDivider, NEmpty, NFlex, NForm, NFormItem, NIcon, NInput, NInputNumber,
  NList, NListItem, NModal, NScrollbar, NSelect, NSwitch, NTag, NText, NThing, type InputInst, type ScrollbarInst,
} from 'naive-ui';
import { FilePlus, FileText, Search, Settings, X } from '@vicons/tabler';
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
import { clampLauncherSelection, moveLauncherSelection } from '@/lib/utils/launcher-navigation';
import { useTagColors } from '@/composables/useTagColors';
import { recordPromptUsage } from '@/lib/utils/prompt-usage';

type PromptResult = { kind: 'prompt'; key: string; label: string; description: string; prompt: PromptWithRelations };
type CommandResult = {
  kind: 'command'; key: string; label: string; description: string; icon: any;
  target: 'home' | 'new-prompt' | 'shortcuts';
};
type LauncherResult = PromptResult | CommandResult;

const { t } = useI18n();
const { getCategoryTagColor, getTagColor, getTagsArray } = useTagColors();
const searchInput = ref<InputInst | null>(null);
const resultScrollbar = ref<ScrollbarInst | null>(null);
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
const resultElements = new Map<number, HTMLElement>();
const defaultActionLabel = computed(() => state.value?.preferences.defaultAction === 'paste'
  ? t('shortcuts.actionPaste')
  : t('shortcuts.actionCopy'));
const activeDescendant = computed(() => {
  const item = results.value[selectedIndex.value];
  return item ? resultDomId(item) : undefined;
});
const searchInputProps = computed(() => ({
  role: 'combobox',
  'aria-autocomplete': 'list',
  'aria-controls': 'prompt-launcher-results',
  'aria-activedescendant': activeDescendant.value,
}));

const commands = computed<CommandResult[]>(() => [
  { kind: 'command', key: 'command:home', label: t('shortcuts.commandOpenApp'), description: t('shortcuts.commandOpenAppDesc'), icon: markRaw(FileText), target: 'home' },
  { kind: 'command', key: 'command:new', label: t('shortcuts.commandNewPrompt'), description: t('shortcuts.commandNewPromptDesc'), icon: markRaw(FilePlus), target: 'new-prompt' },
  { kind: 'command', key: 'command:settings', label: t('shortcuts.commandManage'), description: t('shortcuts.commandManageDesc'), icon: markRaw(Settings), target: 'shortcuts' },
]);

function promptTags(prompt: PromptWithRelations): string[] {
  return getTagsArray(prompt.tags);
}

function normalizedTags(prompt: PromptWithRelations): string {
  return promptTags(prompt).join(' ');
}

function visiblePromptTags(prompt: PromptWithRelations): string[] {
  return promptTags(prompt).slice(0, 3);
}

function hiddenPromptTagCount(prompt: PromptWithRelations): number {
  return Math.max(promptTags(prompt).length - 3, 0);
}

function hasPromptTaxonomy(prompt: PromptWithRelations): boolean {
  return Boolean(prompt.category?.name || promptTags(prompt).length);
}

function hasPromptExtra(prompt: PromptWithRelations): boolean {
  return Boolean(hasPromptTaxonomy(prompt) || bindingFor(prompt.uuid) || runtimeVariables(prompt).length);
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
      description: prompt.description?.trim() || prompt.content.slice(0, 80),
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

function resultDomId(item: LauncherResult): string {
  return `launcher-result-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function setResultElement(element: Element | ComponentPublicInstance | null, index: number): void {
  if (!element) {
    resultElements.delete(index);
    return;
  }
  const node = '$el' in element ? element.$el : element;
  if (node instanceof HTMLElement) resultElements.set(index, node);
}

function scrollSelectedIntoView(): void {
  const selected = resultElements.get(selectedIndex.value);
  const viewport = selected?.closest<HTMLElement>('.n-scrollbar-container');
  if (!selected || !viewport) return;

  const selectedRect = selected.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  let offset = 0;
  if (selectedRect.top < viewportRect.top) offset = selectedRect.top - viewportRect.top;
  else if (selectedRect.bottom > viewportRect.bottom) offset = selectedRect.bottom - viewportRect.bottom;
  if (offset !== 0) resultScrollbar.value?.scrollBy({ top: offset, behavior: 'auto' });
}

function selectResult(index: number): void {
  selectedIndex.value = clampLauncherSelection(index, results.value.length);
  void nextTick(scrollSelectedIntoView);
}

function handleQueryChanged(): void {
  selectedIndex.value = 0;
  void nextTick(scrollSelectedIntoView);
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
    await window.electronAPI.shortcuts.hideLauncher();
    mode.value = 'search';
    query.value = '';
    selectedIndex.value = 0;
    await loadData();
    await nextTick();
    await window.electronAPI.shortcuts.showLauncher();
    await nextTick();
    searchInput.value?.focus();
    searchInput.value?.select();
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
    await nextTick();
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
    if (activePrompt.value.id) {
      await recordPromptUsage({
        promptId: activePrompt.value.id,
        content,
        variables: { ...variableValues.value },
        incrementUseCount: id => apiClientManager.prompt.prompts.incrementUseCount.mutate(id),
      });
    }
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
  await nextTick();
  await window.electronAPI.shortcuts.showLauncher();
}

function handleWindowKeydown(event: KeyboardEvent): void {
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
    event.stopPropagation();
    if (mode.value === 'variables') backToSearch();
    else void window.electronAPI.shortcuts.hideLauncher();
    return;
  }
  if (mode.value !== 'search') {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      void executeActivePrompt();
    }
    return;
  }
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    selectedIndex.value = moveLauncherSelection(selectedIndex.value, results.value.length, direction);
    void nextTick(scrollSelectedIntoView);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const item = results.value[selectedIndex.value];
    if (item) void executeItem(item, event.ctrlKey || event.metaKey ? 'paste' : (state.value?.preferences.defaultAction || 'copy'));
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    event.stopPropagation();
    openActions();
  }
}

let removeInvocationListener: (() => void) | undefined;
onMounted(async () => {
  window.addEventListener('keydown', handleWindowKeydown, true);
  removeInvocationListener = window.electronAPI.shortcuts.onLauncherInvocation(invocation => void handleInvocation(invocation));
  await loadData();
  window.electronAPI.shortcuts.launcherReady();
});
watch(() => results.value.length, length => {
  selectedIndex.value = clampLauncherSelection(selectedIndex.value, length);
  void nextTick(scrollSelectedIntoView);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown, true);
  removeInvocationListener?.();
});
</script>

<style scoped>
.launcher-shell {
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  background: var(--surface-primary);
}

.launcher-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
}

.launcher-card :deep(.n-card-content) {
  display: flex;
  flex: 1 1 0;
  height: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.launcher-card :deep(.n-card-header) {
  flex: 0 0 auto;
  padding: var(--compact-padding) var(--compact-padding) var(--spacing-sm);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-secondary);
}

.launcher-card :deep(.n-card__footer) {
  flex: 0 0 auto;
  padding: var(--spacing-xs) var(--compact-padding);
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-secondary);
}

.result-scrollbar,
.variable-scrollbar {
  flex: 1;
  width: 100%;
  height: 100%;
  max-height: 100%;
  min-height: 0;
}

.result-scrollbar :deep(.n-scrollbar-container),
.variable-scrollbar :deep(.n-scrollbar-container) {
  max-height: 100%;
}

.launcher-card :deep(.n-list) {
  background: transparent;
  padding: var(--spacing-xs) var(--spacing-sm);
}

.launcher-card :deep(.n-list .launcher-result) {
  padding: 0;
  border-radius: var(--radius-sm);
  transition: background-color 100ms ease;
}

.launcher-card :deep(.launcher-result .n-list-item__main) {
  min-width: 0;
  padding: var(--spacing-xs) var(--spacing-sm);
}

.launcher-result--selected {
  background: var(--surface-tertiary);
}

.launcher-card :deep(.launcher-result .n-thing .n-thing-header__title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-base);
  line-height: var(--line-height-tight);
}

.launcher-card :deep(.launcher-result .n-thing-main) {
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.launcher-card :deep(.launcher-result .n-thing) {
  min-width: 0;
  width: 100%;
}

.launcher-card :deep(.launcher-result .n-thing-avatar-header-wrapper),
.launcher-card :deep(.launcher-result .n-thing-header-wrapper) {
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.launcher-card :deep(.launcher-result .n-thing-avatar) {
  margin-top: 1px;
  margin-right: var(--spacing-sm);
}

.launcher-card :deep(.launcher-result .n-thing-header) {
  min-width: 0;
  margin-bottom: var(--spacing-xs);
  gap: var(--spacing-sm);
}

.launcher-card :deep(.launcher-result .n-thing-header__extra) {
  min-width: 0;
  flex: 0 1 60%;
  width: 60%;
  max-width: 60%;
}

.launcher-card :deep(.launcher-result--with-extra .n-thing-header__title) {
  flex: 0 1 38%;
  max-width: 38%;
}

.launcher-card :deep(.launcher-result .n-thing-main__description) {
  min-width: 0;
  width: 100%;
  overflow: hidden;
  line-height: var(--line-height-tight);
}

.result-description {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-xs);
}

.result-extra,
.result-taxonomy {
  min-width: 0;
  overflow: hidden;
}

.result-extra {
  width: 100%;
}

.result-taxonomy {
  flex: 1 1 auto;
}

.result-category,
.result-tag {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 112px;
}

.result-taxonomy :deep(.n-tag__content) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-tag-overflow {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  color: var(--content-tertiary);
}

.result-icon {
  color: var(--content-tertiary);
  transition: color 100ms ease;
}

.result-icon--selected {
  color: var(--accent-primary);
}

.result-meta,
.escape-hint {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
}

.result-count,
.key-cap {
  font-size: var(--font-size-xs);
}

.key-cap {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: var(--font-weight-medium);
  color: var(--content-secondary);
}

.keyboard-hints {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.variable-card :deep(.n-card-content) {
  flex-direction: column;
  gap: var(--spacing-md);
  padding: 0 var(--spacing-lg);
}

.variable-title {
  font-size: var(--font-size-lg);
}

.variable-description {
  display: block;
  margin-top: var(--spacing-xs);
}

.action-card {
  width: min(360px, calc(100vw - 32px));
}
</style>
