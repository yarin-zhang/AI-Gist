<template>
  <div class="ui-split-button">
    <NButton
      type="primary"
      :size="size"
      :disabled="disabled"
      :loading="loading"
      class="ui-split-button__main"
      @click="emit('click')"
    >
      <template v-if="$slots.icon" #icon>
        <slot name="icon" />
      </template>
      <slot />
      <span v-if="shortcut" class="ui-split-button__shortcut">{{ shortcut }}</span>
    </NButton>
    <NDropdown
      trigger="click"
      placement="top-end"
      :options="options"
      :disabled="disabled"
      @select="key => emit('select', key)"
    >
      <NButton
        type="primary"
        :size="size"
        :disabled="disabled"
        class="ui-split-button__menu"
        :aria-label="menuLabel"
      >
        <template #icon>
          <NIcon :size="14"><ChevronDown /></NIcon>
        </template>
      </NButton>
    </NDropdown>
  </div>
</template>

<script setup lang="ts">
import { NButton, NDropdown, NIcon, type DropdownOption } from 'naive-ui'
import { ChevronDown } from '@vicons/tabler'

withDefaults(defineProps<{
  options: DropdownOption[]
  /** 下拉按钮没有文字，必须给读屏一个名字 */
  menuLabel: string
  /** 主按钮里的快捷键提示，例如 ⌘↵ */
  shortcut?: string
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
}>(), {
  shortcut: '',
  size: 'large',
  disabled: false,
  loading: false
})

const emit = defineEmits<{
  click: []
  select: [key: string | number]
}>()
</script>

<style scoped>
.ui-split-button {
  display: inline-flex;
}

.ui-split-button__main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.ui-split-button__menu {
  position: relative;
  width: 30px;
  padding: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

/* 主按钮色在两种主题下相同，分隔线用半透明白色压在按钮色上 */
.ui-split-button__menu::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.22);
  content: "";
}

.ui-split-button__shortcut {
  margin-left: 6px;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
  opacity: 0.72;
}
</style>
