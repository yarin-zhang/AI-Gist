<template>
    <NModal :show="show">
        <div :style="{
            width: `${modalWidth}px`,
            height: `${modalHeight}px`,
            position: 'relative'
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
            <NLayout position="absolute">
                <!-- 顶部固定区域 -->
                <NLayoutHeader ref="headerRef" bordered position="absolute"
                    :style="{ zIndex: 5, padding: `${props.contentPadding}px`, height: `${headerHeight}px`, minHeight: `${props.minHeaderHeight}px` }">
                    <slot name="header" />
                </NLayoutHeader>
                
                <!-- 中间可滚动区域 -->
                <NLayout position="absolute" :style="{
                    top: `${Math.max(headerHeight, props.minHeaderHeight)}px`,
                    bottom: hasFooter ? `${Math.max(footerHeight, props.minFooterHeight)}px` : '0px'
                }">
                    <NLayoutContent :style="`padding: ${props.contentPadding}px;`">
                        <slot name="content" />
                    </NLayoutContent>
                </NLayout>

                <!-- 底部固定区域（仅在有内容时显示） -->
                <NLayoutFooter v-if="hasFooter" ref="footerRef" bordered position="absolute"
                    :style="`padding: ${props.contentPadding}px; height: ${footerHeight}px; min-height: ${props.minFooterHeight}px; z-index: 5;`">
                    <slot name="footer" />
                </NLayoutFooter>
            </NLayout>
        </div>
    </NModal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, useSlots, toRef } from "vue";
import {
    NModal,
    NButton,
    NIcon,
    NLayout,
    NLayoutHeader,
    NLayoutContent,
    NLayoutFooter,
} from "naive-ui";
import { X } from "@vicons/tabler";
import { useModalLayout } from "@/composables/useWindowSize";

interface Props {
    show: boolean;
    minHeaderHeight?: number;
    minFooterHeight?: number;
    contentPadding?: number;
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
    minHeaderHeight: 60, // 最小头部高度
    minFooterHeight: 60, // 最小底部高度
    contentPadding: 16, // 内容边距
});

const emit = defineEmits<Emits>();
const slots = useSlots();

// 组件引用
const headerRef = ref<InstanceType<typeof NLayoutHeader>>();
const footerRef = ref<InstanceType<typeof NLayoutFooter>>();

// 是否有底部内容
const hasFooter = computed(() => {
    return !!slots.footer;
});

// 使用增强的模态框布局 composable
const {
    headerHeight,
    footerHeight,
    contentHeight,
    modalHeight,
    modalWidth,
    updateActualHeights,
    resetHeights,
    setupLayoutWatchers
} = useModalLayout({
    minHeaderHeight: props.minHeaderHeight,
    minFooterHeight: props.minFooterHeight,
    contentPadding: props.contentPadding,
    show: toRef(props, 'show'),
    hasFooter: toRef(hasFooter)
});

// 组件挂载后设置布局监听器
onMounted(() => {
    setupLayoutWatchers(headerRef, footerRef);
});

// 关闭弹窗
const handleClose = () => {
    emit("update:show", false);
    emit("close");
};
</script>

<style scoped>
/* 移除自定义样式，依赖 NaiveUI 原生组件 */
</style>
