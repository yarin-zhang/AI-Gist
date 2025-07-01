<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem :label="t('appearance.theme')">
                <NRadioGroup v-model:value="props.modelValue.themeSource" @update:value="handleUpdate">
                    <NFlex vertical :size="8">
                        <NRadio value="system">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('appearance.auto') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('appearance.autoSwitchTip') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="light">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('appearance.light') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('appearance.alwaysLight') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="dark">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('appearance.dark') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('appearance.alwaysDark') }}
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
