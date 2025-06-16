<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem label="启动模式">
                <NCheckbox v-model:checked="props.modelValue.startMinimized" @update:checked="handleUpdate">
                    <NFlex align="center" :size="8">
                        <div>
                            <div>启动时最小化到托盘</div>
                            <NText depth="3" style="font-size: 12px">
                                启动时不显示主窗口
                            </NText>
                        </div>
                    </NFlex>
                </NCheckbox>
            </NFormItem>

            <NDivider />

            <NFormItem label="自启动设置">
                <NCheckbox v-model:checked="props.modelValue.autoLaunch" @update:checked="handleUpdate">
                    <NFlex align="center" :size="8">
                        <div>
                            <div>开机自动启动</div>
                            <NText depth="3" style="font-size: 12px">
                                系统启动时自动运行
                            </NText>
                        </div>
                    </NFlex>
                </NCheckbox>
            </NFormItem>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NFormItem, NCheckbox, NText, NDivider } from "naive-ui";

interface StartupBehaviorSettings {
    startMinimized: boolean;
    autoLaunch: boolean;
}

const props = defineProps<{
    modelValue: StartupBehaviorSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: StartupBehaviorSettings];
}>();

const handleUpdate = () => {
    emit("update:modelValue", {
        startMinimized: props.modelValue.startMinimized,
        autoLaunch: props.modelValue.autoLaunch
    });
};
</script>
