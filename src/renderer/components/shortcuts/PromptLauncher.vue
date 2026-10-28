<template>
  <div class="launcher" role="dialog" :aria-label="t('launcher.title')">
    <label class="launcher__search">
      <NIcon :size="18" class="launcher__search-icon"><Search /></NIcon>
      <input ref="searchInput" v-model="query" class="launcher__input" autofocus spellcheck="false"
        :placeholder="t('shortcuts.launcherPlaceholder')" v-bind="searchInputProps" @input="handleQueryChanged" />
      <span class="launcher__count">{{ t('shortcuts.resultCount', { count: results.length }) }}</span>
      <span class="ui-kbd">esc</span>
    </label>

    <div class="launcher__body">
      <div id="prompt-launcher-results" ref="resultList" class="launcher__results" role="listbox"
        :aria-label="t('launcher.title')">
        <template v-for="(item, index) in results" :key="item.key">
          <span v-if="index === 0 && item.kind === 'prompt'" class="ui-overline launcher__group">{{ t('launcher.prompts') }}</span>
          <span v-if="item.kind === 'command' && (index === 0 || results[index - 1].kind === 'prompt')"
            class="ui-overline launcher__group">{{ t('launcher.commands') }}</span>
          <button :id="resultDomId(item)" :ref="element => setResultElement(element, index)" type="button" tabindex="-1"
            role="option" class="launcher__item" :class="{ 'is-selected': index === selectedIndex, 'launcher__item--prompt': item.kind === 'prompt' }"
            :aria-selected="index === selectedIndex" @mousemove="selectResult(index)" @click="handleItemClick(index)">
            <template v-if="item.kind === 'prompt'">
              <span class="launcher__item-text">
                <span class="launcher__item-title">{{ item.label }}</span>
                <span class="launcher__item-meta">{{ promptMeta(item.prompt) }}</span>
              </span>
              <span v-if="bindingFor(item.prompt.uuid)" class="ui-kbd">{{ displayAccelerator(bindingFor(item.prompt.uuid)!.accelerator) }}</span>
            </template>
            <template v-else>
              <NIcon :size="16" class="launcher__item-icon"><component :is="item.icon" /></NIcon>
              <span class="launcher__item-title">{{ item.label }}</span>
            </template>
          </button>
        </template>
        <div v-if="!results.length" class="launcher__empty">{{ t('shortcuts.noLauncherResults') }}</div>
      </div>

      <section class="launcher__detail">
        <template v-if="selectedPrompt">
          <div class="launcher__detail-head">
            <span class="launcher__hint">{{ fillHint }}</span>
            <NButton quaternary size="tiny" @click="openBindingEditor(selectedPrompt)">
              {{ bindingFor(selectedPrompt.uuid) ? t('launcher.editShortcut') : t('launcher.setShortcut') }}
            </NButton>
          </div>
          <div ref="detailScroll" class="launcher__detail-body">
            <VariableFieldList v-if="selectedPrompt.isJinjaTemplate && selectedVariables.length" ref="fieldListRef" jinja
              :variables="selectedVariables" :values="selectedValues" :reveal-missing="revealedMissing"
              @update:values="updateSelectedValues" />
            <LauncherInlineFill v-else-if="selectedVariables.length" ref="inlineFillRef" :prompt="selectedPrompt"
              :values="selectedValues" :reveal-missing="revealedMissing" @update:values="updateSelectedValues" />
            <p v-else class="launcher__plain">{{ selectedPrompt.content }}</p>
          </div>
          <p v-if="executionError" class="launcher__error" role="alert">{{ executionError }}</p>
        </template>
        <div v-else-if="selectedCommand" class="launcher__command">
          <NIcon :size="24" class="launcher__command-icon"><component :is="selectedCommand.icon" /></NIcon>
          <span class="launcher__command-title">{{ selectedCommand.label }}</span>
          <span class="launcher__hint">{{ selectedCommand.description }}</span>
        </div>
      </section>
    </div>

    <footer class="launcher__footer">
      <span><span class="ui-kbd">↑↓</span> {{ t('shortcuts.navigate') }}</span>
      <span><span class="ui-kbd">tab</span> {{ t('launcher.nextVariable') }}</span>
      <button v-if="selectedPrompt" type="button" class="launcher__link" @click="openPromptDetail(selectedPrompt)">
        {{ t('launcher.detail') }}
      </button>
      <span class="launcher__spacer" />
      <span v-if="defaultAction !== 'paste'"><span class="ui-kbd">{{ pasteHint }}</span> {{ t('shortcuts.copyAndPaste') }}</span>
      <span class="launcher__primary-hint"><span class="ui-kbd">↵</span> {{ selectedCommand ? t('launcher.run') : defaultActionLabel }}</span>
    </footer>

    <ShortcutBindingModal
      v-if="bindingPrompt"
      :show="showBindingModal"
      :prompt-uuid="bindingPrompt.uuid"
      :prompt-title="bindingPrompt.title"
      :existing-binding="bindingFor(bindingPrompt.uuid)"
      @close="showBindingModal = false"
      @saved="handleBindingSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component, type ComponentPublicInstance } from 'vue';
import { NButton, NIcon } from 'naive-ui';
import { FilePlus, Home, Keyboard, Search } from '@vicons/tabler';
import { useI18n } from 'vue-i18n';
import type { PromptShortcutBinding, PromptWithRelations, ShortcutAction, ShortcutInvocation, ShortcutState } from '@shared/types';
import { useTagColors } from '@/composables/useTagColors';
import { apiClientManager } from '@/lib/api';
import { displayAccelerator, displayShortcutHint } from '@/lib/utils/accelerator';
import { clampLauncherSelection, moveLauncherSelection } from '@/lib/utils/launcher-navigation';
import {
  createPromptDraft, getActivePromptVariables, getMissingPromptVariables, getUnfilledPromptVariables,
  isEmptyPromptValue, renderPrompt,
} from '@/lib/utils/prompt-template';
import { getLastUsedValues, recordPromptUsage } from '@/lib/utils/prompt-usage';
import VariableFieldList from '@/components/prompts/VariableFieldList.vue';
import LauncherInlineFill from './LauncherInlineFill.vue';
import ShortcutBindingModal from './ShortcutBindingModal.vue';

type PromptResult = { kind: 'prompt'; key: string; label: string; prompt: PromptWithRelations };
type CommandResult = {
  kind: 'command'; key: string; label: string; description: string; icon: Component;
  target: 'home' | 'new-prompt' | 'shortcuts';
};
type LauncherResult = PromptResult | CommandResult;

const { t } = useI18n();
const { getTagsArray } = useTagColors();
const searchInput = ref<HTMLInputElement | null>(null);
const resultList = ref<HTMLElement | null>(null);
const inlineFillRef = ref<InstanceType<typeof LauncherInlineFill>>();
const fieldListRef = ref<InstanceType<typeof VariableFieldList>>();
const prompts = ref<PromptWithRelations[]>([]);
const state = ref<ShortcutState | null>(null);
const query = ref('');
const selectedIndex = ref(0);
// 通过提示词快捷键唤起时，把这条提示词放在结果最前面，并按快捷键设定的动作执行
const pinned = ref<{ uuid: string; action: ShortcutAction } | null>(null);
// 本次唤起期间每条提示词填过的值，上下切换时不丢
const valuesByPrompt = ref<Record<string, Record<string, any>>>({});
const revealedMissing = ref(new Set<string>());
const executing = ref(false);
const executionError = ref('');
const showBindingModal = ref(false);
const bindingPrompt = ref<PromptWithRelations | null>(null);
const resultElements = new Map<number, HTMLElement>();

const defaultAction = computed<ShortcutAction>(() => state.value?.preferences.defaultAction || 'copy');
const defaultActionLabel = computed(() => defaultAction.value === 'paste' ? t('shortcuts.copyAndPaste') : t('shortcuts.actionCopy'));
const pasteHint = displayShortcutHint('⌘↵', 'Ctrl ↵');

const commands = computed<CommandResult[]>(() => [
  { kind: 'command', key: 'command:new', label: t('shortcuts.commandNewPrompt'), description: t('shortcuts.commandNewPromptDesc'), icon: markRaw(FilePlus), target: 'new-prompt' },
  { kind: 'command', key: 'command:home', label: t('shortcuts.commandOpenApp'), description: t('shortcuts.commandOpenAppDesc'), icon: markRaw(Home), target: 'home' },
  { kind: 'command', key: 'command:settings', label: t('shortcuts.commandManage'), description: t('shortcuts.commandManageDesc'), icon: markRaw(Keyboard), target: 'shortcuts' },
]);


function scorePrompt(prompt: PromptWithRelations, search: string): number {
  const needle = search.toLowerCase().trim();
  let score = prompt.isFavorite ? 30 : 0;
  score += Math.min(prompt.useCount || 0, 100);
  const recentIndex = state.value?.preferences.recentPromptUUIDs.indexOf(prompt.uuid) ?? -1;
  if (recentIndex >= 0) score += 100 - recentIndex * 3;
  if (!needle) return score;
  const title = prompt.title.toLowerCase();
  const tags = getTagsArray(prompt.tags).join(' ').toLowerCase();
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
  return score + matchScore;
}

const results = computed<LauncherResult[]>(() => {
  const needle = query.value.trim().toLowerCase();
  const pinnedUUID = !needle ? pinned.value?.uuid : undefined;
  const promptResults = prompts.value
    .filter(prompt => prompt.isActive !== false)
    .map(prompt => ({ prompt, score: prompt.uuid === pinnedUUID ? Number.MAX_SAFE_INTEGER : scorePrompt(prompt, needle) }))
    .filter(item => !needle || item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ prompt }): PromptResult => ({ kind: 'prompt', key: `prompt:${prompt.uuid}`, label: prompt.title, prompt }));
  const commandResults = commands.value.filter(command => !needle || `${command.label} ${command.description}`.toLowerCase().includes(needle));
  return [...promptResults, ...commandResults];
});

const selectedItem = computed(() => results.value[selectedIndex.value]);
const selectedPrompt = computed(() => selectedItem.value?.kind === 'prompt' ? selectedItem.value.prompt : null);
const selectedCommand = computed(() => selectedItem.value?.kind === 'command' ? selectedItem.value : null);
const selectedVariables = computed(() => selectedPrompt.value ? getActivePromptVariables(selectedPrompt.value) : []);
const selectedValues = computed(() => selectedPrompt.value ? valuesFor(selectedPrompt.value) : {});

const fillHint = computed(() => {
  if (!selectedVariables.value.length) return t('launcher.noVariablesHint');
  const unfilled = getUnfilledPromptVariables(selectedVariables.value, selectedValues.value).length;
  const filled = selectedVariables.value.length - unfilled;
  return t('launcher.fillProgress', { filled, total: selectedVariables.value.length }, filled);
});

const activeDescendant = computed(() => selectedItem.value ? resultDomId(selectedItem.value) : undefined);
const searchInputProps = computed(() => ({
  role: 'combobox',
  'aria-expanded': true,
  'aria-autocomplete': 'list' as const,
  'aria-controls': 'prompt-launcher-results',
  'aria-activedescendant': activeDescendant.value,
}));

function promptMeta(prompt: PromptWithRelations): string {
  const count = getActivePromptVariables(prompt).length;
  const variables = count ? t('shortcuts.variablesCount', { count }) : t('launcher.noVariables');
  return prompt.category?.name ? `${prompt.category.name} · ${variables}` : variables;
}

function bindingFor(promptUUID: string): PromptShortcutBinding | undefined {
  return state.value?.preferences.promptBindings.find(binding => binding.promptUUID === promptUUID);
}

// 还没填过的提示词先用上次复制时的值，没有记录的变量用默认值
function valuesFor(prompt: PromptWithRelations): Record<string, any> {
  const existing = valuesByPrompt.value[prompt.uuid];
  if (existing) return existing;
  const variables = getActivePromptVariables(prompt);
  const known = new Set(variables.map(variable => variable.name));
  const lastUsed = prompt.id ? getLastUsedValues(prompt.id) : {};
  return createPromptDraft(variables, Object.fromEntries(Object.entries(lastUsed)
    .filter(([name, value]) => known.has(name) && !isEmptyPromptValue(value))));
}

function updateSelectedValues(values: Record<string, any>): void {
  if (!selectedPrompt.value) return;
  valuesByPrompt.value = { ...valuesByPrompt.value, [selectedPrompt.value.uuid]: values };
  executionError.value = '';
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
  resultElements.get(selectedIndex.value)?.scrollIntoView({ block: 'nearest' });
}

function selectResult(index: number): void {
  if (index === selectedIndex.value) return;
  selectedIndex.value = clampLauncherSelection(index, results.value.length);
  void nextTick(scrollSelectedIntoView);
}

function handleQueryChanged(): void {
  pinned.value = null;
  selectedIndex.value = 0;
  void nextTick(scrollSelectedIntoView);
}

function focusSearch(select = false): void {
  searchInput.value?.focus();
  if (select) searchInput.value?.select();
}

function focusFirstField(): boolean {
  if (fieldListRef.value && selectedVariables.value[0]) {
    fieldListRef.value.focusField(selectedVariables.value[0].name);
    return true;
  }
  return inlineFillRef.value?.focusFirst() ?? false;
}

function focusField(name: string): void {
  if (fieldListRef.value) fieldListRef.value.focusField(name);
  else inlineFillRef.value?.focusField(name);
}

function resetSession(): void {
  query.value = '';
  selectedIndex.value = 0;
  valuesByPrompt.value = {};
  revealedMissing.value = new Set();
  executionError.value = '';
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
    pinned.value = null;
    resetSession();
    // 显示窗口不应等待数据库查询完成。Windows 下后台渲染器可能被节流，
    // 先显示空的启动器，再异步加载结果，避免快捷键唤起延迟数秒。
    await nextTick();
    await window.electronAPI.shortcuts.showLauncher();
    await loadData();
    await nextTick();
    focusSearch(true);
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
  await openPrompt(prompt, invocation.action || 'copy');
}

// 提示词快捷键：没有变量直接执行，有变量就在启动器里填好再执行
async function openPrompt(prompt: PromptWithRelations, action: ShortcutAction): Promise<void> {
  resetSession();
  prompts.value = [prompt, ...prompts.value.filter(item => item.uuid !== prompt.uuid)];
  pinned.value = { uuid: prompt.uuid, action };
  selectedIndex.value = 0;
  if (!getActivePromptVariables(prompt).length) {
    await executePrompt(prompt, action);
    return;
  }
  await nextTick();
  await window.electronAPI.shortcuts.showLauncher();
  await nextTick();
  if (!focusFirstField()) focusSearch();
}

async function executePrompt(prompt: PromptWithRelations, action: ShortcutAction): Promise<void> {
  if (executing.value) return;
  const variables = getActivePromptVariables(prompt);
  const values = valuesFor(prompt);
  const missing = getMissingPromptVariables(variables, values);
  if (missing.length) {
    revealedMissing.value = new Set([...revealedMissing.value, ...missing]);
    await window.electronAPI.shortcuts.showLauncher();
    await nextTick();
    focusField(missing[0]);
    return;
  }
  const rendered = renderPrompt(prompt, values, variables);
  if (rendered.error) {
    executionError.value = rendered.error;
    await window.electronAPI.shortcuts.showLauncher();
    return;
  }
  executing.value = true;
  executionError.value = '';
  try {
    await window.electronAPI.shortcuts.executeText({
      promptUUID: prompt.uuid,
      title: prompt.title,
      content: rendered.content,
      action,
    });
    if (prompt.id) {
      await recordPromptUsage({
        promptId: prompt.id,
        content: rendered.content,
        variables: { ...values },
        incrementUseCount: id => apiClientManager.prompt.prompts.incrementUseCount.mutate(id),
      });
    }
    state.value = await window.electronAPI.shortcuts.getState();
    pinned.value = null;
    revealedMissing.value = new Set();
  } catch (caught) {
    executionError.value = caught instanceof Error ? caught.message : String(caught);
    await window.electronAPI.shortcuts.showLauncher();
  } finally {
    executing.value = false;
  }
}

async function executeSelected(paste: boolean): Promise<void> {
  const item = selectedItem.value;
  if (!item) return;
  if (item.kind === 'command') {
    await window.electronAPI.shortcuts.navigateMain(item.target);
    return;
  }
  const pinnedAction = pinned.value?.uuid === item.prompt.uuid ? pinned.value.action : undefined;
  await executePrompt(item.prompt, paste ? 'paste' : (pinnedAction || defaultAction.value));
}

function handleItemClick(index: number): void {
  selectedIndex.value = index;
  const item = results.value[index];
  if (item?.kind === 'command') void executeSelected(false);
  else void nextTick(() => { if (!focusFirstField()) void executeSelected(false); });
}

function openBindingEditor(prompt: PromptWithRelations): void {
  bindingPrompt.value = prompt;
  showBindingModal.value = true;
}

async function openPromptDetail(prompt: PromptWithRelations): Promise<void> {
  await window.electronAPI.shortcuts.navigateMain('home', prompt.uuid);
}

async function handleBindingSaved(): Promise<void> {
  showBindingModal.value = false;
  await loadData();
  await nextTick();
  await window.electronAPI.shortcuts.showLauncher();
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (showBindingModal.value) return;
  if (event.isComposing || event.keyCode === 229) return;
  const target = event.target as HTMLElement | null;
  const inSearch = target === searchInput.value;
  const inDetail = Boolean(target?.closest('.launcher__detail'));

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    // 正在填变量时先回到搜索框，再按一次才关闭
    if (inDetail) focusSearch();
    else void window.electronAPI.shortcuts.hideLauncher();
    return;
  }
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (inSearch || !inDetail)) {
    event.preventDefault();
    event.stopPropagation();
    selectedIndex.value = moveLauncherSelection(selectedIndex.value, results.value.length, event.key === 'ArrowDown' ? 1 : -1);
    void nextTick(scrollSelectedIntoView);
    return;
  }
  if (event.key === 'Tab' && inSearch && !event.shiftKey) {
    if (focusFirstField()) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (event.key === 'Enter') {
    const modifier = event.metaKey || event.ctrlKey;
    // 多行输入框里回车是换行，⌘↵ / Ctrl+↵ 才执行
    if (!modifier && target instanceof HTMLTextAreaElement) return;
    if (!modifier && target instanceof HTMLButtonElement && !target.closest('[role="radiogroup"], .launcher__results')) return;
    event.preventDefault();
    event.stopPropagation();
    void executeSelected(modifier);
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
watch(selectedPrompt, () => {
  executionError.value = '';
  revealedMissing.value = new Set();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown, true);
  removeInvocationListener?.();
});
</script>

<style scoped>
.launcher {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--surface-primary);
  color: var(--content-primary);
}

.launcher__search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-default);
}

.launcher__search-icon {
  color: var(--content-tertiary);
}

.launcher__input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-lg);
}

.launcher__input::placeholder {
  color: var(--content-muted);
}

.launcher__count {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.launcher__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.launcher__results {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 280px;
  padding: 6px;
  overflow-y: auto;
  border-right: 1px solid var(--border-default);
}

.launcher__group {
  padding: 6px 10px 2px;
}

.launcher__group:not(:first-child) {
  padding-top: 10px;
}

.launcher__item {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
}

.launcher__item--prompt {
  min-height: 48px;
}

.launcher__item.is-selected {
  background: var(--accent-soft);
}

.launcher__item-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.launcher__item-title,
.launcher__item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher__item.is-selected .launcher__item-title {
  font-weight: var(--font-weight-medium);
}

.launcher__item-meta {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.launcher__item-icon {
  color: var(--content-tertiary);
}

.launcher__item.is-selected .launcher__item-icon {
  color: var(--accent-primary);
}

.launcher__empty {
  padding: 24px 10px;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.launcher__detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 20px;
}

.launcher__detail-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.launcher__hint {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.launcher__detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.launcher__plain {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--font-size-base);
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.launcher__error {
  flex: none;
  margin: 0;
  color: var(--accent-error);
  font-size: var(--font-size-sm);
}

.launcher__command {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding-top: 8px;
}

.launcher__command-icon {
  color: var(--accent-primary);
}

.launcher__command-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
}

.launcher__footer {
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-default);
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
}

.launcher__footer .ui-kbd {
  margin-right: 4px;
}

.launcher__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-secondary);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.launcher__link:hover {
  color: var(--content-primary);
}

.launcher__spacer {
  flex: 1;
}

.launcher__primary-hint {
  color: var(--content-primary);
  font-weight: var(--font-weight-medium);
}
</style>
