<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search } from '@vicons/tabler';
import { useI18n } from 'vue-i18n';
import type { ShortcutState } from '@shared/types';

const { t } = useI18n();
const state = ref<ShortcutState | null>(null);
const tooltipVisible = ref(false);

const emit = defineEmits<{
  activate: [];
}>();

const launcherBinding = computed(() => state.value?.preferences.commands.launcher);
const launcherRegistration = computed(() => (
  state.value?.registrations.find(status => status.id === 'command:launcher')
));
const shortcutLabel = computed(() => displayAccelerator(launcherBinding.value?.accelerator || ''));

const tooltipText = computed(() => {
  if (!launcherBinding.value?.accelerator) {
    return t('shortcuts.launcherStatusNotSet');
  }

  if (!launcherBinding.value.enabled) {
    return t('shortcuts.launcherStatusDisabled', { shortcut: shortcutLabel.value });
  }

  if (launcherRegistration.value && launcherRegistration.value.state !== 'registered') {
    return t('shortcuts.launcherStatusUnavailable', { shortcut: shortcutLabel.value });
  }

  return t('shortcuts.launcherStatusHint', { shortcut: shortcutLabel.value });
});

const ariaLabel = computed(() => (
  `${t('shortcuts.launcherCommand')}。${tooltipText.value} ${t('shortcuts.commandManageDesc')}`
));

function displayAccelerator(accelerator: string): string {
  if (!navigator.platform.includes('Mac')) {
    return accelerator
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/Control/g, 'Ctrl');
  }

  return accelerator
    .replace(/CommandOrControl|Command/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt|Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '');
}

async function loadState(): Promise<void> {
  const shortcutApi = window.electronAPI?.shortcuts;
  if (!shortcutApi) return;

  try {
    state.value = await shortcutApi.getState();
  } catch {
    // Keep the indicator usable as a navigation entry if shortcut state cannot be read.
  }
}

function showTooltip(): void {
  tooltipVisible.value = true;
  void loadState();
}

function hideTooltip(): void {
  tooltipVisible.value = false;
}

async function handleActivate(): Promise<void> {
  tooltipVisible.value = false;
  emit('activate');

  try {
    await window.electronAPI?.shortcuts?.openLauncher();
  } catch {
    // The shortcut settings page remains available even if the launcher cannot open.
  }
}

onMounted(() => {
  void loadState();
});
</script>

<template>
  <div
    class="prompt-launcher-indicator"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
  >
    <button
      class="prompt-launcher-button"
      type="button"
      :aria-label="ariaLabel"
      aria-describedby="prompt-launcher-status-tooltip"
      @click="handleActivate"
      @focus="showTooltip"
      @blur="hideTooltip"
    >
      <Search class="prompt-launcher-icon" />
    </button>

    <div
      v-show="tooltipVisible"
      id="prompt-launcher-status-tooltip"
      class="prompt-launcher-tooltip"
      role="tooltip"
    >
      <strong>{{ t('shortcuts.launcherCommand') }}</strong>
      <span>{{ tooltipText }}</span>
    </div>
  </div>
</template>

<style scoped>
.prompt-launcher-indicator {
  position: relative;
  z-index: 20;
  display: inline-flex;
  height: 100%;
  align-items: center;
}

.prompt-launcher-button {
  display: grid;
  width: 24px;
  height: 22px;
  box-sizing: border-box;
  flex: 0 0 24px;
  place-items: center;
  padding: 0;
  color: var(--content-secondary);
  line-height: 1;
  appearance: none;
  background: var(--surface-primary);
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease;
}

.prompt-launcher-button:hover,
.prompt-launcher-button:focus-visible {
  color: var(--content-primary);
  border-color: var(--border-default);
  background: var(--surface-secondary);
  outline: none;
}

.prompt-launcher-icon {
  display: block;
  width: 15px;
  height: 15px;
}

.prompt-launcher-tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  display: flex;
  width: max-content;
  max-width: min(340px, calc(100vw - 32px));
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  color: var(--content-primary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-popover);
  pointer-events: none;
}

.prompt-launcher-tooltip strong {
  font-size: 13px;
  font-weight: 600;
}
</style>
