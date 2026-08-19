<template>
  <span class="key-combo" :class="{ 'key-combo--empty': !keys.length }">
    <template v-if="keys.length">
      <template v-for="(key, index) in keys" :key="index">
        <span class="key-cap">{{ key }}</span>
        <span v-if="index < keys.length - 1" class="key-combo-sep" aria-hidden="true">+</span>
      </template>
    </template>
    <span v-else class="key-cap key-cap--empty">{{ emptyLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * Renders an Electron accelerator string (e.g. "CommandOrControl+Shift+G") as a row of
 * uniformly sized keycaps, one per key, instead of a single line of concatenated text.
 * When no accelerator is set, renders a single keycap-shaped placeholder so the "not set"
 * state keeps the exact same height as an actual key combination.
 */
const props = defineProps<{
  /** Raw accelerator string using Electron's modifier tokens, or empty when unset. */
  accelerator?: string;
  /** Localized label shown when no accelerator is set. */
  emptyLabel: string;
}>();

const MODIFIER_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
};

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

function tokenLabel(token: string): string {
  if (isMac) return MODIFIER_SYMBOLS[token] ?? token;
  if (token === 'CommandOrControl' || token === 'Control') return 'Ctrl';
  if (token === 'Option') return 'Alt';
  return token;
}

const keys = computed(() => (
  props.accelerator ? props.accelerator.split('+').filter(Boolean).map(tokenLabel) : []
));
</script>

<style scoped>
.key-combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}

.key-cap {
  display: inline-flex;
  box-sizing: border-box;
  height: 22px;
  min-width: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--surface-tertiary);
  color: var(--content-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.key-combo-sep {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.key-cap--empty {
  min-width: 0;
  border-style: dashed;
  border-color: var(--border-strong);
  background: transparent;
  color: var(--content-tertiary);
  font-family: inherit;
  font-weight: var(--font-weight-normal);
}
</style>
