<template>
  <div>
    <NButton @click="showModal = true">测试 NSplit 模态框</NButton>
    
    <CommonModal 
      v-model:show="showModal"
      :min-header-height="80"
      :min-footer-height="70"
      :content-padding="20"
      :header-resizable="true"
      :footer-resizable="true"
      :header-default-size="0.2"
      :footer-default-size="0.7"
    >
      <template #header>
        <div style="background: var(--app-surface-color); padding: 10px; border-radius: 4px; border: 1px solid var(--app-border-color);">
          <h2 style="margin: 0 0 8px 0; color: var(--app-text-color);">NSplit 模态框演示</h2>
          <p style="margin: 0; color: var(--app-text-color); opacity: 0.7;">这个头部区域可以调整大小（如果启用了 headerResizable）</p>
          <div style="margin-top: 10px;">
            <NTag type="info">可调整大小的头部</NTag>
          </div>
        </div>
      </template>

      <template #content>
        <div style="padding: 20px;">
          <h3 style="color: var(--app-text-color);">内容区域</h3>
          <p style="color: var(--app-text-color);">这个区域会自动调整高度，以适应头部和底部的实际大小。</p>
          
          <div style="background: var(--app-surface-color); padding: 15px; border-radius: 4px; margin: 15px 0; border: 1px solid var(--app-border-color);">
            <h4 style="color: var(--app-text-color);">优势：</h4>
            <ul style="color: var(--app-text-color);">
              <li>✅ 不需要复杂的高度计算</li>
              <li>✅ NSplit 自动处理分割区域的大小</li>
              <li>✅ 支持用户手动调整区域大小（可选）</li>
              <li>✅ 更加健壮和稳定</li>
              <li>✅ 响应式设计，适应不同窗口大小</li>
            </ul>
          </div>

          <div style="height: 200px; background: linear-gradient(45deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; margin: 20px 0;">
            测试滚动区域 - 高度内容
          </div>

          <div style="height: 200px; background: linear-gradient(45deg, #a18cd1 0%, #fbc2eb 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; margin: 20px 0;">
            更多内容来测试滚动
          </div>

          <NSpace vertical size="medium">
            <NCard title="配置选项" style="background: var(--app-surface-color); border: 1px solid var(--app-border-color);">
              <template #header-extra>
                <NTag>可配置</NTag>
              </template>
              <NSpace vertical>
                <NCheckbox v-model:checked="headerResizable" style="color: var(--app-text-color);">头部可调整大小</NCheckbox>
                <NCheckbox v-model:checked="footerResizable" style="color: var(--app-text-color);">底部可调整大小</NCheckbox>
              </NSpace>
            </NCard>
          </NSpace>
        </div>
      </template>

      <template #footer>
        <div style="background: var(--app-surface-color); padding: 10px; border-radius: 4px; border: 1px solid var(--app-border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <NTag type="success">可调整大小的底部</NTag>
              <span style="margin-left: 10px; color: var(--app-text-color); opacity: 0.7;">
                你可以拖拽分割线来调整各区域的大小
              </span>
            </div>
            <div>
              <NButton @click="resetModal" style="margin-right: 8px;">
                重置
              </NButton>
              <NButton @click="showModal = false" type="primary">
                关闭
              </NButton>
            </div>
          </div>
        </div>
      </template>
    </CommonModal>

    <!-- 无底部的模态框 -->
    <NButton @click="showSimpleModal = true" style="margin-left: 10px;">
      测试无底部模态框
    </NButton>
    
    <CommonModal 
      v-model:show="showSimpleModal"
      :min-header-height="60"
      :content-padding="16"
    >
      <template #header>
        <div style="background: var(--app-surface-color); padding: 10px; border-radius: 4px; border: 1px solid var(--app-border-color);">
          <h3 style="margin: 0; color: var(--app-text-color);">简单模态框</h3>
          <p style="margin: 5px 0 0 0; color: var(--app-text-color); opacity: 0.7;">只有头部和内容，没有底部</p>
        </div>
      </template>

      <template #content>
        <div style="padding: 20px;">
          <p style="color: var(--app-text-color);">这是一个没有底部的模态框示例。</p>
          <p style="color: var(--app-text-color);">内容区域会自动扩展到底部。</p>
          
          <div style="height: 300px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; margin: 20px 0;">
            无底部布局
          </div>
          
          <NButton @click="showSimpleModal = false" type="primary" block>
            关闭
          </NButton>
        </div>
      </template>
    </CommonModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { 
  NButton, 
  NTag, 
  NSpace, 
  NCard, 
  NCheckbox 
} from 'naive-ui'
import CommonModal from '@/components/common/CommonModal.vue'

const showModal = ref(false)
const showSimpleModal = ref(false)
const headerResizable = ref(true)
const footerResizable = ref(true)

const resetModal = () => {
  // 这里可以重置模态框的状态
  console.log('重置模态框')
}
</script>

<style scoped>
/* 一些自定义样式 */
</style>
