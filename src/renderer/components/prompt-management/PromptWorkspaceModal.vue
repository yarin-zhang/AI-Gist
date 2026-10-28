<template>
    <!-- Esc 和点遮罩都只发出请求，由外层先收起页面里的浮层、做未保存确认，再决定关不关 -->
    <NModal :show="show" :mask-closable="false" :close-on-esc="false" @esc="handleEsc"
        @mask-click="$emit('request-close')">
        <div class="prompt-workspace-modal" role="dialog" aria-modal="true">
            <slot />
        </div>
    </NModal>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { NModal } from 'naive-ui'
import { hasOpenFloatingLayer, isEscapeConsumed } from '@/lib/utils/escape-layers'

// 卡片、表格、文件夹视图里打开提示词时的弹窗外壳，内容是完整的提示词页
const props = defineProps<{
    show: boolean
}>()

const emit = defineEmits<{
    'request-close': []
    /** 这次 Esc 没有被下拉、气泡或输入框用掉，交给外层：先收起页面里的面板，没有可收起的再关弹窗 */
    esc: []
}>()

// Naive 的 @esc 不带事件对象，下拉也会在同一次按键里先把自己收起，所以在捕获阶段先记下按键当时的状态
let pendingEscape: { event: KeyboardEvent, layerOpen: boolean } | null = null

const recordEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') pendingEscape = { event, layerOpen: hasOpenFloatingLayer() }
}

const handleEsc = () => {
    const pending = pendingEscape
    pendingEscape = null
    if (pending && (pending.layerOpen || isEscapeConsumed(pending.event))) return
    emit('esc')
}

watch(() => props.show, show => {
    if (show) window.addEventListener('keydown', recordEscape, true)
    else window.removeEventListener('keydown', recordEscape, true)
}, { immediate: true })

onBeforeUnmount(() => window.removeEventListener('keydown', recordEscape, true))
</script>

<style scoped>
.prompt-workspace-modal {
    display: flex;
    width: min(1320px, calc(100vw - 48px));
    height: calc(100vh - 48px);
    min-width: 0;
    min-height: 0;
    /* clip 而不是 hidden：hidden 的容器仍能被程序滚动，获得焦点的控件会把整页内容推偏 */
    overflow: clip;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-modal);
    background: var(--surface-primary);
    box-shadow: var(--shadow-overlay);
}

@media (max-width: 760px) {
    .prompt-workspace-modal {
        width: 100vw;
        height: 100vh;
        border: 0;
        border-radius: 0;
    }
}
</style>
