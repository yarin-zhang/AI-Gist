<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem label="关闭行为模式">                    <NRadioGroup v-model:value="props.modelValue.closeBehaviorMode" @update:value="handleUpdate">
                    <NFlex vertical :size="12">
                        <NRadio value="ask">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>每次询问</div>
                                    <NText depth="3" style="font-size: 12px">
                                        弹出对话框让您选择
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="fixed">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>固定行为</div>
                                    <NText depth="3" style="font-size: 12px">
                                        直接执行指定动作
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
                </NRadioGroup>
            </NFormItem>

            <NFormItem v-if="props.modelValue.closeBehaviorMode === 'fixed'" label="关闭动作" style="margin-left: 24px">
                <NRadioGroup v-model:value="props.modelValue.closeAction" @update:value="handleUpdate">
                    <NFlex vertical :size="8">
                        <NRadio value="quit">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>退出应用</div>
                                    <NText depth="3" style="font-size: 12px">
                                        完全退出程序
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="minimize">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>最小化到托盘</div>
                                    <NText depth="3" style="font-size: 12px">
                                        后台继续运行
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
                </NRadioGroup>
            </NFormItem>

            <NAlert v-if="props.modelValue.closeBehaviorMode === 'ask'" type="info" show-icon>
                <template #header>当前设置</template>
                关闭时弹出选择对话框
            </NAlert>

            <NAlert v-if="props.modelValue.closeBehaviorMode === 'fixed'" type="success" show-icon>
                <template #header>当前设置</template>
                关闭时直接{{ props.modelValue.closeAction === "quit" ? "退出应用" : "最小化到托盘" }}
            </NAlert>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NFormItem, NRadioGroup, NRadio, NText, NAlert } from "naive-ui";

interface CloseBehaviorSettings {
    closeBehaviorMode: "ask" | "fixed";
    closeAction: "quit" | "minimize";
}

const props = defineProps<{
    modelValue: CloseBehaviorSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: CloseBehaviorSettings];
}>();

const handleUpdate = () => {
    // 重新发送整个对象
    emit("update:modelValue", {
        closeBehaviorMode: props.modelValue.closeBehaviorMode,
        closeAction: props.modelValue.closeAction
    });
};
</script>
