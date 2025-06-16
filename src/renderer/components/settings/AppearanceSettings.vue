<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem label="主题模式">
                <NRadioGroup v-model:value="props.modelValue.themeSource" @update:value="handleUpdate">
                    <NFlex vertical :size="8">
                        <NRadio value="system">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>跟随系统</div>
                                    <NText depth="3" style="font-size: 12px">
                                        自动切换主题
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="light">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>浅色主题</div>
                                    <NText depth="3" style="font-size: 12px">
                                        始终使用浅色
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="dark">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>深色主题</div>
                                    <NText depth="3" style="font-size: 12px">
                                        始终使用深色
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
                </NRadioGroup>
            </NFormItem>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NFormItem, NRadioGroup, NRadio, NText } from "naive-ui";

interface AppearanceSettings {
    themeSource: "system" | "light" | "dark";
}

const props = defineProps<{
    modelValue: AppearanceSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: AppearanceSettings];
}>();

const handleUpdate = (value: string) => {
    emit("update:modelValue", { themeSource: value as "system" | "light" | "dark" });
};
</script>
