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
                top: '26px',
                right: '26px',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }">
                <template #icon>
                    <NIcon size="16">
                        <X />
                    </NIcon>
                </template>
            </NButton>
              <!-- 如果有 Footer，使用 flexbox 布局确保底部固定高度 -->
            <div v-if="hasFooter" :style="{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }">
                <!-- 上部分：Header + Content，占据剩余空间 -->
                <div :style="{ flex: 1, minHeight: 0, overflow: 'hidden' }">
                    <NSplit
                        direction="vertical"
                        :style="{ height: '100%' }"
                        :default-size="`${headerDefaultHeight}px`"
                        :min="`${minHeaderHeight}px`"
                        :max="`${headerMaxHeight}px`"
                        :disabled="!headerResizable"
                        :resize-trigger-size="3"
                        :pane1-style="{ overflow: 'hidden' }"
                        :pane2-style="{ overflow: 'hidden' }"
                    >
                        <!-- Header -->
                        <template #1>
                            <NFlex 
                                class="modal-header" 
                                vertical 
                                justify="center" 
                                :style="{ 
                                    padding: `0 ${contentPadding}px`,
                                    height: '100%',
                                    borderBottom: '1px solid var(--app-border-color)',
                                    backgroundColor: 'var(--app-surface-color)'
                                }"
                            >
                                <slot name="header" />
                            </NFlex>
                        </template>
                          <!-- Content -->
                        <template #2>
                            <div class="modal-content" :style="{ 
                                padding: `${contentPadding}px`,
                                height: '100%',
                                overflow: 'hidden',
                                backgroundColor: 'var(--app-bg-color)',
                                display: 'flex',
                                flexDirection: 'column'
                            }">
                                <div :style="{ flex: 1, height: '100%', overflow: 'hidden' }">
                                    <slot name="content" :contentHeight="contentHeight" />
                                </div>
                            </div>
                        </template>
                    </NSplit>
                </div>                <!-- Footer：固定高度 -->
                <div :style="{ height: `${footerDefaultHeight}px`, flexShrink: 0 }">
                    <NFlex 
                        class="modal-footer" 
                        vertical 
                        justify="center" 
                        :style="{ 
                            padding: `0 ${contentPadding}px`,
                            height: '100%',
                            borderTop: '1px solid var(--app-border-color)',
                            backgroundColor: 'var(--app-surface-color)'
                        }"
                    >
                        <slot name="footer" />
                    </NFlex>
                </div>
            </div>
            
            <!-- 如果没有 Footer，只使用 Header + Content -->
            <NSplit 
                v-else
                direction="vertical" 
                :style="{ height: '100%', width: '100%' }"
                :default-size="`${headerDefaultHeight}px`"
                :min="`${minHeaderHeight}px`"
                :max="`${headerMaxHeight}px`"
                :disabled="!headerResizable"
                :resize-trigger-size="3"
                :pane1-style="{ overflow: 'hidden' }"
                :pane2-style="{ overflow: 'hidden' }"
            >
                <!-- Header -->
                <template #1>
                    <NFlex 
                        class="modal-header" 
                        vertical 
                        justify="center" 
                        :style="{ 
                            padding: `0 ${contentPadding}px`,
                            height: '100%',
                            borderBottom: '1px solid var(--app-border-color)',
                            backgroundColor: 'var(--app-surface-color)'
                        }"
                    >
                        <slot name="header" />
                    </NFlex>
                </template>
                  <!-- Content -->
                <template #2>
                    <div class="modal-content" :style="{ 
                        padding: `${contentPadding}px`,
                        height: '100%',
                        overflow: 'hidden',
                        backgroundColor: 'var(--app-bg-color)',
                        display: 'flex',
                        flexDirection: 'column'
                    }">
                        <div :style="{ flex: 1, height: '100%', overflow: 'hidden' }">
                            <slot name="content" :contentHeight="contentHeight" />
                        </div>
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
    NFlex,
} from "naive-ui";
import { X } from "@vicons/tabler";
import { useWindowSize } from "@/composables/useWindowSize";

interface Props {
    show: boolean;
    minHeaderHeight?: number;
    contentPadding?: number;
    headerResizable?: boolean;
    headerDefaultHeight?: number; // 头部默认高度（像素）
    footerDefaultHeight?: number; // 底部默认高度（像素）
    headerMaxHeight?: number; // 头部最大高度（像素）
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
    minHeaderHeight: 60, // 最小头部高度
    contentPadding: 16, // 内容边距
    headerResizable: false, // 头部是否可调整大小
    headerDefaultHeight: 80, // 头部默认高度（像素）
    footerDefaultHeight: 80, // 底部默认高度（像素）
    headerMaxHeight: 300, // 头部最大高度（像素）
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

// 计算内容区域的实际可用高度
const contentHeight = computed(() => {
    let availableHeight = modalHeight.value;
    
    // 减去 Header 的高度
    availableHeight -= props.headerDefaultHeight;
    
    // 如果有 Footer，减去 Footer 的高度
    if (hasFooter.value) {
        availableHeight -= props.footerDefaultHeight;
    }
    
    // 减去内容区域的内边距 (上下各一份)
    availableHeight -= props.contentPadding * 2;
    
    return Math.max(0, availableHeight);
});

// 直接使用像素值，让 NSplit 自己处理布局
const headerDefaultHeight = computed(() => props.headerDefaultHeight);
const headerMaxHeight = computed(() => `${props.headerMaxHeight}px`);
const footerDefaultHeight = computed(() => props.footerDefaultHeight);

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

</style>
