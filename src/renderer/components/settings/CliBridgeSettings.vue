<template>
    <div class="cli-settings">
        <UiPanel body="rows">
            <UiSettingRow :title="t('cliBridge.enable')" :description="t('cliBridge.enableTip')">
                <span class="cli-settings__status">
                    <span v-if="status.running" class="ui-tag ui-tag--success">
                        <span class="ui-dot ui-dot--success" />{{ t('cliBridge.statusRunning', { port: status.port }) }}
                    </span>
                    <span v-else class="ui-tag">{{ t('cliBridge.statusStopped') }}</span>
                    <NSwitch :value="enabled" :loading="loading" :aria-label="t('cliBridge.enable')" @update:value="handleToggle" />
                </span>
            </UiSettingRow>
        </UiPanel>

        <UiPanel v-if="status.running" :title="t('cliBridge.tryItTitle')">
            <div class="cli-settings__try">
                <div class="cli-settings__field">
                    <span class="cli-settings__label">{{ t('cliBridge.tryItAgentLabel') }}</span>
                    <div class="cli-settings__copy">
                        <span class="cli-settings__text">{{ t('cliBridge.tryItHintAgentExample') }}</span>
                        <NButton quaternary size="tiny" class="cli-settings__copy-button" :aria-label="t('cliBridge.copyPhrase')"
                            @click="copyText(t('cliBridge.tryItHintAgentExample'))">
                            <template #icon><NIcon :size="14"><Copy /></NIcon></template>
                        </NButton>
                    </div>
                </div>
                <div class="cli-settings__field">
                    <span class="cli-settings__label">{{ t('cliBridge.tryItTerminalLabel') }}</span>
                    <div class="cli-settings__copy">
                        <span class="cli-settings__text ui-mono">{{ STATUS_COMMAND }}</span>
                        <NButton quaternary size="tiny" class="cli-settings__copy-button" :aria-label="t('cliBridge.copyCommand')"
                            @click="copyText(STATUS_COMMAND)">
                            <template #icon><NIcon :size="14"><Copy /></NIcon></template>
                        </NButton>
                    </div>
                </div>
            </div>
        </UiPanel>
    </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { NButton, NIcon, NSwitch, useMessage } from 'naive-ui';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';
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

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        message.success(t('cliBridge.copySuccess'));
    } catch (error) {
        console.error('复制失败:', error);
        message.error(t('cliBridge.copyFailed'));
    }
};

onMounted(refreshStatus);
</script>

<style scoped>
.cli-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.cli-settings__status {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.cli-settings__status .ui-tag {
    gap: 6px;
}

.cli-settings__try {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.cli-settings__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cli-settings__label {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.cli-settings__copy {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-height-sm);
    padding: 4px 4px 4px 10px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-control);
    background: var(--surface-secondary);
}

.cli-settings__text {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-base);
    overflow-wrap: anywhere;
}

.cli-settings__text.ui-mono {
    font-size: var(--font-size-sm);
}

.cli-settings__copy-button {
    width: 22px;
    padding: 0;
}
</style>
