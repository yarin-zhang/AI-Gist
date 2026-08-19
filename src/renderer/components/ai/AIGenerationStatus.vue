<template>
    <div class="ai-generation-status" role="status">
        <NSpin size="small" />
        <NText depth="2" class="ai-generation-status-text">{{ statusText }}</NText>
    </div>
</template>

<script setup lang="ts">
// 独立展示流式生成状态（已生成字符数 / 速率）。
// 这段文字在流式生成期间高频更新，单独拆成组件后，
// 其局部重渲染不会波及父组件里标题、提示语、操作按钮等静态兄弟节点，
// 从而避免"生成结果"面板顶部整体跟着高频闪烁。
import { computed } from 'vue'
import { NSpin, NText } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
    charCount: number
    isStreaming: boolean
    isActive: boolean
    growthRate: number
}>()

const { t } = useI18n()

const statusText = computed(() => {
    if (props.isStreaming && props.charCount > 0) {
        if (props.isActive && props.growthRate > 0) {
            return t('aiGenerator.generatingWithRate', {
                count: props.charCount,
                rate: props.growthRate.toFixed(1),
            })
        }
        return t('aiGenerator.generatingWithCount', { count: props.charCount })
    }
    return t('aiGenerator.generating')
})
</script>

<style scoped>
.ai-generation-status { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; min-height: 22px; }
.ai-generation-status-text { font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
</style>
