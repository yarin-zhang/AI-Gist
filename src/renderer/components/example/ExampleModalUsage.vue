<template>
    <div>
        <!-- 示例：在其他组件中使用新的 NSplit 模态框 -->
        <NButton @click="showModal = true">打开示例模态框</NButton>

        <CommonModal v-model:show="showModal" :min-header-height="minHeaderHeight" :min-footer-height="minFooterHeight"
            :content-padding="contentPadding" :header-resizable="false" :footer-resizable="false">
            <template #header>
                <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                    示例标题
                </NText>
                <NText depth="3">
                    这是一个演示如何使用新的 NSplit 模态框布局的示例
                </NText>
            </template>

            <template #content>
                <div>
                    <p>新的 NSplit 实现的优势：</p>
                    <ul>
                        <li>✅ 不需要复杂的高度计算</li>
                        <li>✅ 自动处理区域大小调整</li>
                        <li>✅ 更加稳定和健壮</li>
                        <li>✅ 支持用户手动调整大小（可选）</li>
                    </ul>

                    <p>模态框总高度: {{ modalMaxHeight }}px</p>
                    <p>内容区域内边距: {{ contentPadding }}px</p>

                    <div
                        style="height: 120px; margin: 16px 0; padding: 16px; border: 1px solid aliceblue; border-radius: 4px; background: #f8f9fa;">
                        <p>这是一个固定高度的内容区域，用于测试滚动</p>
                        <p>NSplit 会自动处理内容区域的高度调整</p>
                    </div>

                    <div
                        style="height: 200px; background: linear-gradient(45deg, #74b9ff, #0984e3); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; margin: 16px 0;">
                        测试内容区域滚动
                    </div>
                </div>
            </template>

            <template #footer>
                <NFlex justify="space-between" align="center">
                    <div>
                        <!-- 左侧区域 -->
                        <NText depth="3">Footer 内容 - 使用 NSplit 自动布局</NText>
                    </div>
                    <div>
                        <!-- 右侧区域 -->
                        <NFlex size="small">
                            <NButton @click="testAction">
                                测试操作
                            </NButton>
                            <NButton @click="showModal = false" type="primary">
                                关闭
                            </NButton>
                        </NFlex>
                    </div>
                </NFlex>
            </template>
        </CommonModal>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton,NFlex,NText } from 'naive-ui'
import CommonModal from '~/components/common/CommonModal.vue'
import { useWindowSize } from '@/composables/useWindowSize'

const showModal = ref(false)

// 使用窗口尺寸功能
const { modalMaxHeight } = useWindowSize()

const minHeaderHeight = 60
const minFooterHeight = 70
const contentPadding = 16

// 测试操作
const testAction = () => {
    console.log('测试操作 - NSplit 模态框工作正常')
}
</script>
