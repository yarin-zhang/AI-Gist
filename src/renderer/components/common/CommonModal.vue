<template>
    <NModal :show="show" style="background-color: var(--app-bg-color);">
        <div :style="{
            width: `${modalWidth}px`,
            height: `${modalHeight}px`,
            position: 'relative',
            backgroundColor: 'var(--app-bg-color)',
            color: 'var(--app-text-color)',
            borderRadius: '8px',
            overflow: 'hidden'
        }">
            <!-- 固定在右上角的关闭按钮 -->
            <NButton @click="handleClose" size="small" circle :style="{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 1000,
            }">
                <template #icon>
                    <NIcon size="18">
                        <X />
                    </NIcon>
                </template>
            </NButton>
            
            <!-- 使用 NSplit 进行布局分割 -->
            <NSplit 
                direction="vertical" 
                :style="{ height: '100%', width: '100%' }"
                :default-size="headerDefaultSize"
                :min="headerMinSize"
                :max="headerMaxSize"
                :disabled="!headerResizable"
            >
                <!-- 顶部区域 -->
                <template #1>
                    <div class="modal-header" :style="{ 
                        padding: `${contentPadding}px`,
                        minHeight: `${minHeaderHeight}px`,
                        height: '100%',
                        borderBottom: '1px solid var(--app-border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--app-surface-color)'
                    }">
                        <slot name="header" />
                    </div>
                </template>
                
                <!-- 剩余区域：内容 + 底部（如果有） -->
                <template #2>
                    <NSplit v-if="hasFooter"
                        direction="vertical" 
                        :style="{ height: '100%' }"
                        :default-size="contentDefaultSize"
                        :min="contentMinSize"
                        :max="contentMaxSize"
                        :disabled="!footerResizable"
                    >
                        <!-- 中间内容区域 -->
                        <template #1>
                            <div class="modal-content" :style="{ 
                                padding: `${contentPadding}px`,
                                height: '100%',
                                overflow: 'auto',
                                backgroundColor: 'var(--app-bg-color)'
                            }">
                                <slot name="content" />
                            </div>
                        </template>
                        
                        <!-- 底部区域 -->
                        <template #2>
                            <div class="modal-footer" :style="{ 
                                padding: `${contentPadding}px`,
                                minHeight: `${minFooterHeight}px`,
                                height: '100%',
                                borderTop: '1px solid var(--app-border-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                backgroundColor: 'var(--app-surface-color)'
                            }">
                                <slot name="footer" />
                            </div>
                        </template>
                    </NSplit>
                    
                    <!-- 只有内容区域，没有底部 -->
                    <div v-else class="modal-content" :style="{ 
                        padding: `${contentPadding}px`,
                        height: '100%',
                        overflow: 'auto',
                        backgroundColor: 'var(--app-bg-color)'
                    }">
                        <slot name="content" />
                    </div>
                </template>
            </NSplit>
        </div>
    </NModal>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";
import {
    NModal,
    NButton,
    NIcon,
    NSplit,
} from "naive-ui";
import { X } from "@vicons/tabler";
import { useWindowSize } from "@/composables/useWindowSize";

interface Props {
    show: boolean;
    minHeaderHeight?: number;
    minFooterHeight?: number;
    contentPadding?: number;
    headerResizable?: boolean;
    footerResizable?: boolean;
    headerDefaultSize?: number;
    footerDefaultSize?: number;
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
    minHeaderHeight: 60, // 最小头部高度
    minFooterHeight: 60, // 最小底部高度
    contentPadding: 16, // 内容边距
    headerResizable: false, // 头部是否可调整大小
    footerResizable: false, // 底部是否可调整大小
    headerDefaultSize: 0.15, // 头部默认占比（15%）
    footerDefaultSize: 0.8, // 内容区域默认占比（80%，底部占20%）
});

const emit = defineEmits<Emits>();
const slots = useSlots();

// 获取窗口尺寸
const { modalWidth, modalMaxHeight } = useWindowSize();

// 模态框高度就是窗口高度
const modalHeight = modalMaxHeight;

// 是否有底部内容
const hasFooter = computed(() => {
    return !!slots.footer;
});

// NSplit 相关配置
const headerMinSize = computed(() => {
    // 头部最小尺寸：最小高度 / 总高度
    return props.minHeaderHeight / modalHeight.value;
});

const headerMaxSize = computed(() => {
    // 头部最大尺寸：如果有底部，最大不超过 70%，否则不超过 80%
    return hasFooter.value ? 0.7 : 0.8;
});

const headerDefaultSize = computed(() => {
    // 如果指定的默认尺寸太小，使用最小尺寸
    return Math.max(props.headerDefaultSize, headerMinSize.value);
});

const contentMinSize = computed(() => {
    // 内容区域最小尺寸：如果有底部，至少 30%，否则至少 20%
    return hasFooter.value ? 0.3 : 0.2;
});

const contentMaxSize = computed(() => {
    // 内容区域最大尺寸：最大占用空间 - 底部最小空间
    const footerMinRatio = props.minFooterHeight / modalHeight.value;
    return 1 - footerMinRatio;
});

const contentDefaultSize = computed(() => {
    // 内容区域默认尺寸
    return Math.min(Math.max(props.footerDefaultSize, contentMinSize.value), contentMaxSize.value);
});

// 关闭弹窗
const handleClose = () => {
    emit("update:show", false);
    emit("close");
};
</script>

<style scoped>
.modal-header {
    background-color: var(--app-surface-color);
    color: var(--app-text-color);
    overflow: hidden;
    transition: background-color 0.3s ease, color 0.3s ease;
}

.modal-content {
    background-color: var(--app-bg-color);
    color: var(--app-text-color);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.modal-footer {
    background-color: var(--app-surface-color);
    color: var(--app-text-color);
    overflow: hidden;
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* 确保 NSplit 的分割线样式适配主题 */
:deep(.n-split-pane) {
    transition: all 0.3s ease;
}

:deep(.n-split-pane__split-bar) {
    background-color: var(--app-border-color);
    transition: background-color 0.3s ease;
}

:deep(.n-split-pane__split-bar:hover) {
    background-color: var(--primary-color, #007bff);
}

/* 明确设置模态框的背景，避免透明问题 */
:deep(.n-modal-container) {
    background-color: rgba(0, 0, 0, 0.5);
}

:deep(.n-modal) {
    background-color: var(--app-bg-color);
    border: 1px solid var(--app-border-color);
}

/* 确保滚动条适配主题 */
.modal-content::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.modal-content::-webkit-scrollbar-track {
    background: transparent;
}

.modal-content::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.3);
    border-radius: 3px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.5);
}

/* 深色主题下的滚动条 */
html.dark .modal-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
}

html.dark .modal-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
