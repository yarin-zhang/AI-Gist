<template>
    <NCard size="small">
        <NFlex vertical :size="16">
            <NText strong>{{ t('closeBehavior.closeBehaviorMode') }}</NText>
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

            <template v-if="props.modelValue.closeBehaviorMode === 'fixed'">
                <NDivider />
                <NText strong>{{ t('closeBehavior.closeAction') }}</NText>
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
            </template>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NCard, NFlex, NRadioGroup, NRadio, NText, NDivider } from "naive-ui";
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
