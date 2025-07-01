<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem :label="t('startup.startupMode')">
                <NCheckbox v-model:checked="props.modelValue.startMinimized" @update:checked="handleUpdate">
                    <NFlex align="center" :size="8">
                        <div>
                            <div>{{ t('startup.minimized') }}</div>
                            <NText depth="3" style="font-size: 12px">
                                {{ t('startup.minimizedTip') }}
                            </NText>
                        </div>
                    </NFlex>
                </NCheckbox>
            </NFormItem>

            <NDivider />

            <NFormItem :label="t('startup.autoStartSetting')">
                <NCheckbox v-model:checked="props.modelValue.autoLaunch" @update:checked="handleUpdate">
                    <NFlex align="center" :size="8">
                        <div>
                            <div>{{ t('startup.autoStart') }}</div>
                            <NText depth="3" style="font-size: 12px">
                                {{ t('startup.autoStartTip') }}
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
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()

const handleUpdate = () => {
    emit("update:modelValue", {
        startMinimized: props.modelValue.startMinimized,
        autoLaunch: props.modelValue.autoLaunch
    });
};
</script>
