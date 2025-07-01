<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFormItem :label="t('closeBehavior.closeBehaviorMode')">
                <NRadioGroup v-model:value="props.modelValue.closeBehaviorMode" @update:value="handleUpdate">
                    <NFlex vertical :size="12">
                        <NRadio value="ask">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('closeBehavior.ask') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('closeBehavior.askTip') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="fixed">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('closeBehavior.fixed') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('closeBehavior.fixedTip') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
                </NRadioGroup>
            </NFormItem>

            <NFormItem v-if="props.modelValue.closeBehaviorMode === 'fixed'" :label="t('closeBehavior.closeAction')" style="margin-left: 24px">
                <NRadioGroup v-model:value="props.modelValue.closeAction" @update:value="handleUpdate">
                    <NFlex vertical :size="8">
                        <NRadio value="quit">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('closeBehavior.quit') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('closeBehavior.quitDesc') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                        <NRadio value="minimize">
                            <NFlex align="center" :size="8">
                                <div>
                                    <div>{{ t('closeBehavior.minimize') }}</div>
                                    <NText depth="3" style="font-size: 12px">
                                        {{ t('closeBehavior.minimizeDesc') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NRadio>
                    </NFlex>
                </NRadioGroup>
            </NFormItem>

            <NAlert v-if="props.modelValue.closeBehaviorMode === 'ask'" type="info" show-icon>
                <template #header>{{ t('closeBehavior.currentSetting') }}</template>
                {{ t('closeBehavior.askOnClose') }}
            </NAlert>

            <NAlert v-if="props.modelValue.closeBehaviorMode === 'fixed'" type="success" show-icon>
                <template #header>{{ t('closeBehavior.currentSetting') }}</template>
                {{ t('closeBehavior.directAction', { action: props.modelValue.closeAction === "quit" ? t('closeBehavior.quit') : t('closeBehavior.minimize') }) }}
            </NAlert>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NFormItem, NRadioGroup, NRadio, NText, NAlert } from "naive-ui";
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()

const handleUpdate = () => {
    // 重新发送整个对象
    emit("update:modelValue", {
        closeBehaviorMode: props.modelValue.closeBehaviorMode,
        closeAction: props.modelValue.closeAction
    });
};
</script>
