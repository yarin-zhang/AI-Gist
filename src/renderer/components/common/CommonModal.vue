<template>
  <NModal 
    :show="show" 
    @update:show="$emit('update:show', $event)" 
    :style="{
      width: `${modalWidth}px`,
      height: `${modalHeight}px`
    }"
  >
    <NLayout position="absolute">
      <!-- 固定在右上角的关闭按钮 -->
      <NButton 
        @click="handleClose" 
        size="small" 
        circle 
        :style="{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1
        }"
      >
        <template #icon>
          <NIcon size="18">
            <X />
          </NIcon>
        </template>
      </NButton>

      <!-- 顶部固定区域 -->
      <NLayoutHeader 
        :height="headerHeight" 
        bordered 
        content-style="padding: 24px;"
      >
        <slot name="header" />
      </NLayoutHeader>

      <!-- 中间可操作区域 -->
      <NLayoutContent 
        :height="contentHeight" 
        content-style="padding: 24px;"
      >
        <slot name="content" />
      </NLayoutContent>

      <!-- 底部固定区域 -->
      <NLayoutFooter 
        :height="footerHeight" 
        bordered 
        content-style="padding: 24px;" 
        position="absolute"
      >
        <slot name="footer" />
      </NLayoutFooter>
    </NLayout>
  </NModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  NModal,
  NButton,
  NIcon,
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NLayoutFooter
} from 'naive-ui'
import { X } from '@vicons/tabler'
import { useWindowSize } from '@/composables/useWindowSize'

interface Props {
  show: boolean
  headerHeight?: number
  footerHeight?: number
  contentPadding?: number
}

interface Emits {
  (e: 'update:show', value: boolean): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  headerHeight: 180,
  footerHeight: 60,
  contentPadding: 24
})

const emit = defineEmits<Emits>()

// 使用窗口尺寸 composable
const { modalMaxHeight, modalWidth } = useWindowSize()

// 响应式布局计算
const modalHeight = computed(() => {
  return modalMaxHeight.value
})

// 中间内容区域高度
const contentHeight = computed(() => {
  return modalHeight.value - props.headerHeight - props.footerHeight - props.contentPadding * 2
})

// 关闭弹窗
const handleClose = () => {
  emit('update:show', false)
  emit('close')
}

// 暴露计算属性供父组件使用
defineExpose({
  modalHeight,
  contentHeight,
  modalWidth
})
</script>

<style scoped>
/* 移除自定义样式，依赖 NaiveUI 原生组件 */
</style>