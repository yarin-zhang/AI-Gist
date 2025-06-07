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
                <NLayoutHeader ref="headerRef" bordered position="absolute" :style="{ zIndex: 5, padding: `${props.contentPadding}px` }">
                    <slot name="header" />
                </NLayoutHeader> <!-- 中间可滚动区域 -->
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
                     :style="`padding: ${props.contentPadding}px;`">
                    <slot name="footer" />
                </NLayoutFooter>
            </NLayout>
        </div>
    </NModal>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted } from "vue";
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
import { useWindowSize, useModalLayout } from "@/composables/useWindowSize";
import { useSlots } from "vue";

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

// 使用窗口尺寸 composable
const { modalMaxHeight, modalWidth } = useWindowSize();

// 使用模态框布局 composable
const {
    headerHeight,
    footerHeight,
    contentHeight,
    updateActualHeights,
    resetHeights
} = useModalLayout({
    minHeaderHeight: props.minHeaderHeight,
    minFooterHeight: props.minFooterHeight,
    contentPadding: props.contentPadding
}, modalMaxHeight);

// 组件引用
const headerRef = ref<InstanceType<typeof NLayoutHeader>>();
const footerRef = ref<InstanceType<typeof NLayoutFooter>>();

// 响应式布局计算
const modalHeight = computed(() => {
    return modalMaxHeight.value;
});

// 是否有底部内容
const hasFooter = computed(() => {
    return !!slots.footer;
});

// 监听显示状态变化，更新高度
watch(() => props.show, (newShow) => {
    if (newShow) {
        // 延迟一点确保DOM完全渲染
        setTimeout(() => {
            updateActualHeights(headerRef, footerRef, hasFooter.value);
        }, 100);
    } else {
        // 关闭时重置高度
        resetHeights();
    }
});

// 监听插槽内容变化，重新计算高度
watch(() => [slots.header, slots.footer], () => {
    if (props.show) {
        setTimeout(() => {
            updateActualHeights(headerRef, footerRef, hasFooter.value);
        }, 100);
    }
}, { deep: true });

// 组件挂载后初始化
onMounted(() => {
    if (props.show) {
        setTimeout(() => {
            updateActualHeights(headerRef, footerRef, hasFooter.value);
        }, 100);
    }
});

// 关闭弹窗
const handleClose = () => {
    emit("update:show", false);
    emit("close");
};


// 暴露计算属性供父组件使用
defineExpose({
    modalHeight,
    contentHeight,
    modalWidth,
    updateActualHeights: () => updateActualHeights(headerRef, footerRef, hasFooter.value),
    resetHeights,
    headerHeight,
    footerHeight
});
</script>

<style scoped>
/* 移除自定义样式，依赖 NaiveUI 原生组件 */
</style>
