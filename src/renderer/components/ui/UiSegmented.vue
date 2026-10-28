<template>
  <div
    class="ui-seg"
    :class="{ 'ui-seg--fill': fill || wrap, 'ui-seg--wrap': wrap }"
    role="radiogroup"
    :aria-label="label || undefined"
  >
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      role="radio"
      class="ui-seg__item"
      :class="{ 'is-active': option.value === modelValue }"
      :aria-checked="option.value === modelValue"
      :disabled="disabled || option.disabled"
      @mouseenter="syncTitle($event, option.label)"
      @click="emit('update:modelValue', option.value)"
    >
      <NIcon v-if="option.icon" :size="14" class="ui-seg__icon"><component :is="option.icon" /></NIcon>
      <span class="ui-seg__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import type { Component } from 'vue'
import { NIcon } from 'naive-ui'

defineProps<{
  modelValue: T
  options: Array<{ value: T; label: string; icon?: Component; disabled?: boolean }>
  /** 读屏用的分组名 */
  label?: string
  /** 撑满父容器宽度，剩余空间平分给各项；放不下时选项收缩，文字显示省略号，悬停看全名 */
  fill?: boolean
  /** 在 fill 的基础上允许文字换成两行（窄侧栏里选项多、译文长时用），仍放不下才省略 */
  wrap?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

// 文字被省略时才用 title 给出全名，完整显示时不出原生提示
const syncTitle = (event: MouseEvent, text: string) => {
  const button = event.currentTarget as HTMLElement
  const label = button.querySelector<HTMLElement>('.ui-seg__label')
  const clipped = Boolean(label && (label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1))
  if (clipped) button.title = text
  else button.removeAttribute('title')
}
</script>

<style scoped>
/*
 * 不用 align-self：在横向容器里跟随容器的 align-items（页头、筛选行里垂直居中），
 * 固定高度防止被 stretch 拉高；在纵向容器里靠 fit-content 保持内容宽度、不被拉宽。
 */
.ui-seg {
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  gap: 2px;
  width: fit-content;
  max-width: 100%;
  height: var(--control-height-sm);
  padding: 2px;
  border-radius: var(--radius-control);
  background: var(--surface-tertiary);
}

.ui-seg--fill {
  display: flex;
  flex: 0 1 auto;
  align-self: stretch;
  width: auto;
  min-width: 0;
}

/* 从文字宽度起步再平分剩余空间：放得下时不省略任何一项，放不下时按长短一起收缩 */
.ui-seg--fill .ui-seg__item {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 8px;
}

.ui-seg__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--content-secondary);
  font: inherit;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  cursor: pointer;
}

.ui-seg__icon {
  flex: none;
}

.ui-seg__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 允许换行：轨道随内容长高，单个选项最多两行，单词本身放不下时仍省略 */
.ui-seg--wrap {
  height: auto;
  min-height: var(--control-height-sm);
}

.ui-seg--wrap .ui-seg__item {
  height: auto;
  min-height: 24px;
  padding: 3px 6px;
  line-height: var(--line-height-tight);
  white-space: normal;
}

.ui-seg--wrap .ui-seg__label {
  display: -webkit-box;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ui-seg__item:hover:not(:disabled) {
  color: var(--content-primary);
}

.ui-seg__item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.ui-seg__item.is-active {
  background: var(--surface-primary);
  color: var(--accent-soft-text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--hairline-ring);
}

.ui-seg__item:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
