<template>
  <div>
    <!-- 示例：在其他组件中使用模态框布局计算 -->
    <NButton @click="showModal = true">打开示例模态框</NButton>
    
    <CommonModal 
      v-model:show="showModal"
      :min-header-height="80"
      :min-footer-height="70"
      :content-padding="16"
    >
      <template #header>
        <div>
          <h2>示例标题</h2>
          <p>这是一个演示如何使用新的模态框布局计算功能的示例</p>
        </div>
      </template>

      <template #content>
        <div>
          <p>当前内容区域高度: {{ contentHeight }}px</p>
          <p>Header 高度: {{ headerHeight }}px</p>
          <p>Footer 高度: {{ footerHeight }}px</p>
          <p>模态框总高度: {{ modalMaxHeight }}px</p>
          <p>内容区域内边距: {{ contentPadding }}px</p>

          <div style="height: 120px;  margin: 16px 0; padding: 16px; border: 1px solid aliceblue;">
            <p>这是一个固定高度的内容区域，用于测试滚动</p>
            <p>你可以在这里添加任何内容...</p>
          </div>
        </div>
      </template>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>Footer 内容</span>
          <div>
            <NButton @click="updateLayout" style="margin-right: 8px;">
              更新布局
            </NButton>
            <NButton @click="showModal = false" type="primary">
              关闭
            </NButton>
          </div>
        </div>
      </template>
    </CommonModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton } from 'naive-ui'
import CommonModal from '~/components/common/CommonModal.vue'
import { useWindowSize, useModalLayout } from '@/composables/useWindowSize'

const showModal = ref(false)

// 使用窗口尺寸功能
const { modalMaxHeight } = useWindowSize()

// 使用模态框布局功能（也可以在这里单独使用）
const {
  headerHeight,
  footerHeight,
  contentHeight,
  updateActualHeights
} = useModalLayout({
  minHeaderHeight: 80,
  minFooterHeight: 70,
  contentPadding: 16
}, modalMaxHeight)

// 手动更新布局的示例
const updateLayout = () => {
  // 这里可以调用 updateActualHeights 来重新计算布局
  console.log('手动更新布局', {
    headerHeight: headerHeight.value,
    footerHeight: footerHeight.value,
    contentHeight: contentHeight.value
  })
}
</script>
