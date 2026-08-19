<template>
    <NCard size="small">
        <NFlex vertical :size="16">
            <NFlex justify="space-between" align="center" :size="16">
                <div>
                    <NText>{{ t('cliBridge.enable') }}</NText>
                    <NText depth="3" class="setting-description">{{ t('cliBridge.enableTip') }}</NText>
                </div>
                <NSwitch :value="enabled" :loading="loading" @update:value="handleToggle" />
            </NFlex>

            <NDivider />

            <NFlex vertical :size="8">
                <NFlex align="center" :size="8">
                    <NTag :type="status.running ? 'success' : 'default'" size="small" :bordered="false">
                        {{ status.running ? t('cliBridge.statusRunning', { port: status.port }) : t('cliBridge.statusStopped') }}
                    </NTag>
                </NFlex>

                <template v-if="status.running">
                    <NText depth="3" class="setting-description">{{ t('cliBridge.tryItHint') }}</NText>
                    <code class="code-inline">node bin/ai-gist.js status</code>
                </template>
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { NCard, NDivider, NFlex, NSwitch, NTag, NText, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import type { CliBridgeStatus } from '@shared/types';

const { t } = useI18n();
const message = useMessage();

const enabled = ref(false);
const loading = ref(false);
const status = reactive<CliBridgeStatus>({ enabled: false, running: false, port: undefined });

const applyStatus = (next: CliBridgeStatus) => {
    enabled.value = next.enabled;
    status.enabled = next.enabled;
    status.running = next.running;
    status.port = next.port;
};

const refreshStatus = async () => {
    try {
        applyStatus(await window.electronAPI.cliBridge.getStatus());
    } catch (error) {
        console.error('获取本地 CLI 桥接状态失败:', error);
    }
};

const handleToggle = async (value: boolean) => {
    loading.value = true;
    try {
        const next = await window.electronAPI.cliBridge.setEnabled(value);
        applyStatus(next);
        if (value && !next.running) {
            message.error(t('cliBridge.startFailed'));
        }
    } catch (error) {
        console.error('切换本地 CLI 桥接状态失败:', error);
        message.error(t('cliBridge.toggleFailed'));
    } finally {
        loading.value = false;
    }
};

onMounted(refreshStatus);
</script>

<style scoped>
.setting-description {
    display: block;
    margin-top: 4px;
    font-size: 12px;
}
</style>
