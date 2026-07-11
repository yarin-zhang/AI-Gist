<template>
    <NCard size="small">
        <NFlex vertical :size="16">
            <NFlex justify="space-between" align="center" :size="16">
                <div>
                    <NText>{{ t('startup.minimized') }}</NText>
                    <NText depth="3" class="setting-description">{{ t('startup.minimizedTip') }}</NText>
                </div>
                <NSwitch v-model:value="props.modelValue.startMinimized" @update:value="handleUpdate" />
            </NFlex>

            <NDivider />

            <NFlex justify="space-between" align="center" :size="16">
                <div>
                    <NText>{{ t('startup.autoStart') }}</NText>
                    <NText depth="3" class="setting-description">{{ t('startup.autoStartTip') }}</NText>
                </div>
                <NSwitch v-model:value="props.modelValue.autoLaunch" @update:value="handleUpdate" />
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NSwitch, NText, NDivider } from "naive-ui";
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

<style scoped>
.setting-description {
    display: block;
    margin-top: 4px;
    font-size: 12px;
}
</style>
