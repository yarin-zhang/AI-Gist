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
                    <NText depth="3" class="setting-description">{{ t('cliBridge.tryItHintAgent') }}</NText>
                    <NText depth="3" class="setting-description">{{ t('cliBridge.tryItHint') }}</NText>
                    <NFlex align="center" :size="8" class="cli-command-row">
                        <code class="code-inline cli-command-code">{{ STATUS_COMMAND }}</code>
                        <NButton quaternary circle size="tiny" :title="t('cliBridge.copyCommand')" @click="copyStatusCommand">
                            <template #icon><NIcon size="14"><Copy /></NIcon></template>
                        </NButton>
                    </NFlex>
                </template>
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NDivider, NFlex, NIcon, NSwitch, NTag, NText, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { Copy } from '@vicons/tabler';
import type { CliBridgeStatus } from '@shared/types';

const { t } = useI18n();
const message = useMessage();

const STATUS_COMMAND = 'node bin/ai-gist.js status';

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

const copyStatusCommand = async () => {
    try {
        await navigator.clipboard.writeText(STATUS_COMMAND);
        message.success(t('cliBridge.copySuccess'));
    } catch (error) {
        console.error('复制命令失败:', error);
        message.error(t('cliBridge.copyFailed'));
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

.cli-command-row {
    max-width: 100%;
}

.cli-command-code {
    overflow-wrap: anywhere;
}
</style>
