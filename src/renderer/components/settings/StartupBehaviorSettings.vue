<template>
    <UiPanel body="rows">
        <UiSettingRow :title="t('startup.autoStart')" :description="t('startup.autoStartTip')">
            <NSwitch :value="modelValue.autoLaunch" :aria-label="t('startup.autoStart')"
                @update:value="value => handleUpdate({ autoLaunch: value })" />
        </UiSettingRow>
        <UiSettingRow :title="t('startup.minimized')">
            <NSwitch :value="modelValue.startMinimized" :aria-label="t('startup.minimized')"
                @update:value="value => handleUpdate({ startMinimized: value })" />
        </UiSettingRow>
    </UiPanel>
</template>

<script setup lang="ts">
import { NSwitch } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSettingRow from '@/components/ui/UiSettingRow.vue'

interface StartupBehaviorSettings {
    startMinimized: boolean
    autoLaunch: boolean
}

const props = defineProps<{
    modelValue: StartupBehaviorSettings
}>()

const emit = defineEmits<{
    'update:modelValue': [value: StartupBehaviorSettings]
}>()

const { t } = useI18n()

const handleUpdate = (patch: Partial<StartupBehaviorSettings>) => {
    emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>
