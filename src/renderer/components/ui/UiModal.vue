<template>
  <NModal :show="show" :mask-closable="maskClosable" :auto-focus="autoFocus" @update:show="value => !value && emit('close')"
    @after-leave="emit('after-leave')">
    <div class="ui-modal" role="dialog" aria-modal="true" :aria-label="title"
      :style="{ width: `min(${width}, calc(100vw - 32px))`, height: height ? `min(${height}, calc(100vh - 32px))` : undefined }">
      <header class="ui-modal__header">
        <div class="ui-modal__titles">
          <h2 class="ui-title-section">{{ title }}</h2>
          <span v-if="subtitle" class="ui-modal__subtitle">{{ subtitle }}</span>
        </div>
        <slot name="header-extra" />
        <NButton quaternary size="small" class="ui-modal__close" :aria-label="closeLabel" @click="emit('close')">
          <template #icon><NIcon :size="16"><X /></NIcon></template>
        </NButton>
      </header>
      <slot name="before-body" />
      <div class="ui-modal__body" :class="{ 'ui-modal__body--flush': flush }">
        <slot />
      </div>
      <footer v-if="$slots.footer || $slots['footer-start']" class="ui-modal__footer">
        <div class="ui-modal__footer-start"><slot name="footer-start" /></div>
        <div class="ui-modal__footer-actions"><slot name="footer" /></div>
      </footer>
    </div>
  </NModal>
</template>

<script setup lang="ts">
import { NButton, NIcon, NModal } from 'naive-ui'
import { X } from '@vicons/tabler'

withDefaults(defineProps<{
  show: boolean
  title: string
  subtitle?: string
  /** 宽度用设计令牌里的浮层尺寸：确认 460、表单 560、多步 880、工作区 960 */
  width?: string
  height?: string
  /** 正文不加内边距，由内容自己排（左右分栏的工作区弹窗） */
  flush?: boolean
  maskClosable?: boolean
  autoFocus?: boolean
  closeLabel?: string
}>(), {
  subtitle: '',
  width: 'var(--overlay-width-confirm)',
  height: '',
  flush: false,
  maskClosable: false,
  autoFocus: true,
  closeLabel: 'Close',
})

const emit = defineEmits<{
  close: []
  'after-leave': []
}>()
</script>

<style scoped>
/*
 * 根节点不裁剪：弹窗里的下拉、气泡都挂在这个节点上（Naive 的弹层默认挂到所在弹窗），
 * 裁剪会把靠近底部的下拉菜单切掉。圆角改由头、正文、底栏各自处理。
 */
.ui-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-modal);
  background: var(--surface-primary);
  box-shadow: var(--shadow-overlay);
  --ui-modal-inner-radius: calc(var(--radius-modal) - 1px);
}

.ui-modal__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--border-default);
  border-radius: var(--ui-modal-inner-radius) var(--ui-modal-inner-radius) 0 0;
  background: var(--surface-secondary);
}

.ui-modal__titles .ui-title-section {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-modal__titles {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.ui-modal__subtitle {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-modal__close {
  width: 28px;
  padding: 0;
}

.ui-modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.ui-modal__body:not(:has(~ .ui-modal__footer)) {
  border-radius: 0 0 var(--ui-modal-inner-radius) var(--ui-modal-inner-radius);
}

.ui-modal__body--flush {
  display: flex;
  padding: 0;
  overflow: hidden;
}

.ui-modal__footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-default);
  border-radius: 0 0 var(--ui-modal-inner-radius) var(--ui-modal-inner-radius);
  background: var(--surface-secondary);
}

.ui-modal__footer-start {
  flex: 1;
  min-width: 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.ui-modal__footer-actions {
  display: flex;
  flex: none;
  gap: 8px;
}
</style>
