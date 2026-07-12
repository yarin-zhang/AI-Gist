<template>
    <NCard size="small">
        <NFlex vertical :size="12">
            <NText strong>{{ t('appearance.theme') }}</NText>
            <NRadioGroup v-model:value="props.modelValue.themeSource" @update:value="handleUpdate">
                    <NFlex vertical :size="12">
                        <NRadio value="system">
                            <NFlex align="center" :size="8">
                                <div>{{ t('appearance.auto') }}</div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="light">
                            <NFlex align="center" :size="8">
                                <div>{{ t('appearance.light') }}</div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="dark">
                            <NFlex align="center" :size="8">
                                <div>{{ t('appearance.dark') }}</div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
            </NRadioGroup>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NRadioGroup, NRadio, NText } from "naive-ui";
import { useI18n } from 'vue-i18n'

interface AppearanceSettings {
    themeSource: "system" | "light" | "dark";
}

const props = defineProps<{
    modelValue: AppearanceSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: AppearanceSettings];
}>();

const { t } = useI18n()

const handleUpdate = (value: string) => {
    emit("update:modelValue", { themeSource: value as "system" | "light" | "dark" });
};
</script>
