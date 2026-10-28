<template>
    <UiPanel>
        <div class="close-behavior">
            <div class="close-behavior__field">
                <span class="close-behavior__label">{{ t('closeBehavior.closeBehaviorMode') }}</span>
                <UiChoiceCards :model-value="modelValue.closeBehaviorMode" :options="modeOptions"
                    :label="t('closeBehavior.closeBehaviorMode')" @update:model-value="value => handleUpdate({ closeBehaviorMode: value })" />
            </div>
            <div v-if="modelValue.closeBehaviorMode === 'fixed'" class="close-behavior__field">
                <span class="close-behavior__label">{{ t('closeBehavior.closeAction') }}</span>
                <UiChoiceCards :model-value="modelValue.closeAction" :options="actionOptions"
                    :label="t('closeBehavior.closeAction')" @update:model-value="value => handleUpdate({ closeAction: value })" />
            </div>
        </div>
    </UiPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiChoiceCards from '@/components/ui/UiChoiceCards.vue'
import UiPanel from '@/components/ui/UiPanel.vue'

interface CloseBehaviorSettings {
    closeBehaviorMode: 'ask' | 'fixed'
    closeAction: 'quit' | 'minimize'
}

const props = defineProps<{
    modelValue: CloseBehaviorSettings
}>()

const emit = defineEmits<{
    'update:modelValue': [value: CloseBehaviorSettings]
}>()

const { t } = useI18n()

const modeOptions = computed(() => [
    { value: 'ask' as const, label: t('closeBehavior.ask'), description: t('closeBehavior.askTip') },
    { value: 'fixed' as const, label: t('closeBehavior.fixed'), description: t('closeBehavior.fixedTip') },
])

const actionOptions = computed(() => [
    { value: 'minimize' as const, label: t('closeBehavior.minimize'), description: t('closeBehavior.minimizeDesc') },
    { value: 'quit' as const, label: t('closeBehavior.quit'), description: t('closeBehavior.quitDesc') },
])

const handleUpdate = (patch: Partial<CloseBehaviorSettings>) => {
    emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<style scoped>
.close-behavior {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.close-behavior__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.close-behavior__label {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}
</style>
