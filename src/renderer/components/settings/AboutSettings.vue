<template>
    <div class="about">
        <header class="about__head">
            <img :src="appIcon" :alt="t('about.appName')" class="about__logo" />
            <div class="about__titles">
                <h1 class="ui-title-page">{{ t('about.appName') }}</h1>
                <p class="about__description">{{ t('about.appDescription') }}</p>
            </div>
        </header>

        <UiPanel :title="t('about.versionInfo')" body="rows">
            <template v-if="capabilities.electronUpdates" #actions>
                <NButton size="tiny" :loading="checking" @click="handleCheckForUpdates">{{ t('about.checkForUpdates') }}</NButton>
            </template>
            <UiSettingRow :title="t('about.currentVersion')">
                <span class="ui-mono about__version">{{ currentVersion }}</span>
            </UiSettingRow>
            <UiSettingRow v-if="latestVersion" :title="t('about.latestVersion')">
                <span class="about__inline">
                    <span class="ui-mono about__version">{{ latestVersion }}</span>
                    <span v-if="hasUpdate" class="ui-tag ui-tag--warning">{{ t('about.hasUpdate') }}</span>
                    <span v-else class="ui-tag ui-tag--success">{{ t('about.isLatest') }}</span>
                </span>
            </UiSettingRow>
            <UiSettingRow v-if="publishedAt" :title="t('about.publishedAt')">
                <span class="about__secondary">{{ publishedAt }}</span>
            </UiSettingRow>
            <UiSettingRow v-if="capabilities.electronUpdates" :title="t('about.autoCheckUpdates')"
                :description="t('about.autoCheckUpdatesTip')">
                <NSwitch :value="autoCheckUpdates" :aria-label="t('about.autoCheckUpdates')"
                    @update:value="handleAutoCheckChange" />
            </UiSettingRow>
            <div v-if="hasUpdate || checkFailed" class="about__notices">
                <div v-if="hasUpdate" class="ui-alert about__update">
                    <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><InfoCircle /></NIcon>
                    <span class="about__update-text">{{ t('about.newVersionDesc', { version: latestVersion }) }}</span>
                    <NButton v-if="releaseNotes" quaternary size="tiny" @click="showReleaseNotes = !showReleaseNotes">
                        {{ showReleaseNotes ? t('about.hideReleaseNotes') : t('about.viewReleaseNotes') }}
                    </NButton>
                    <NButton type="primary" size="tiny" @click="handleOpenDownloadPage">{{ t('about.downloadNewVersion') }}</NButton>
                </div>
                <div v-if="hasUpdate && releaseNotes && showReleaseNotes" class="ui-muted-box">{{ releaseNotes }}</div>
                <!-- 检查失败只在这里说一次，不再另外弹提示 -->
                <UiAlert v-if="checkFailed" tone="error">{{ t('about.checkFailed') }}</UiAlert>
            </div>
        </UiPanel>

        <UiPanel :title="t('about.projectInfo')" body="rows">
            <UiSettingRow :title="t('about.developer')"><span>{{ t('about.developerName') }}</span></UiSettingRow>
            <UiSettingRow :title="t('about.github')">
                <NButton text type="primary" @click="openGitHub">{{ t('about.githubRepo') }}</NButton>
            </UiSettingRow>
            <UiSettingRow :title="t('about.license')"><span>{{ t('about.licenseType') }}</span></UiSettingRow>
        </UiPanel>

        <UiPanel :title="t('about.feedbackSupport')">
            <div class="about__feedback">
                <NButton @click="openIssues">
                    <template #icon><NIcon><Bug /></NIcon></template>{{ t('about.reportIssue') }}
                </NButton>
                <NButton @click="openFeatureRequest">
                    <template #icon><NIcon><Bulb /></NIcon></template>{{ t('about.featureRequest') }}
                </NButton>
            </div>
        </UiPanel>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NIcon, NSwitch, useMessage } from 'naive-ui';
import { Bug, Bulb, InfoCircle } from '@vicons/tabler';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';
import appIcon from '~/assets/images/logo.png';
import { useUpdate } from '~/composables/useUpdate';
import { openExternalUrl } from '~/lib/platform/shell';
import { preferencesClient } from '~/lib/platform/preferences';
import { PlatformDetector } from '@shared/platform';

const { t } = useI18n();
const capabilities = PlatformDetector.getCapabilities();

// 使用更新服务
const {
    currentVersion,
    updateInfo,
    checking,
    checkFailed,
    hasUpdate,
    isLatest,
    latestVersion,
    releaseNotes,
    downloadUrl,
    publishedAt,
    checkForUpdates,
    openDownloadPage,
    initVersion
} = useUpdate();

// 状态管理
const message = useMessage();
const showReleaseNotes = ref(false);
const autoCheckUpdates = ref(true);

// 自动检查更新的开关：状态栏每次自动检查前都会重新读这项设置，改完不用重启
const loadAutoCheckUpdates = async () => {
    try {
        autoCheckUpdates.value = (await preferencesClient.get()).checkUpdates !== false;
    } catch (error) {
        console.error('读取自动检查更新设置失败:', error);
    }
};

const handleAutoCheckChange = async (value: boolean) => {
    autoCheckUpdates.value = value;
    try {
        await preferencesClient.set({ checkUpdates: value });
    } catch (error) {
        console.error('保存自动检查更新设置失败:', error);
        autoCheckUpdates.value = !value;
        message.error(t('settingsMessages.saveSettingsFailed'));
    }
};

// 检查更新
const handleCheckForUpdates = async () => {
    const result = await checkForUpdates();
    // 失败时版本信息面板里已经有说明；连点时上一次检查还没结束，不用提示
    if (!result.success) return;
    if (result.data?.hasUpdate) {
        message.success(t('about.updateFound', { version: result.data.latestVersion }));
    } else {
        message.info(t('about.alreadyLatest'));
    }
};

// 打开下载页面
const handleOpenDownloadPage = async () => {
    if (!downloadUrl.value) return;

    const result = await openDownloadPage(downloadUrl.value);
    if (!result.success) {
        message.error(t('about.openDownloadFailed'));
    }
};

// 打开 GitHub 仓库
const openGitHub = async () => {
    const result = await openExternalUrl('https://github.com/yarin-zhang/AI-Gist');
    if (!result.success) {
        message.error(t('about.openPageFailed'));
    }
};

// 打开问题报告页面
const openIssues = async () => {
    const result = await openExternalUrl('https://github.com/yarin-zhang/AI-Gist/issues');
    if (!result.success) {
        message.error(t('about.openPageFailed'));
    }
};

// 打开功能建议页面
const openFeatureRequest = async () => {
    const result = await openExternalUrl('https://github.com/yarin-zhang/AI-Gist/issues/new?template=feature_request.md');
    if (!result.success) {
        message.error(t('about.openPageFailed'));
    }
};

// 组件挂载时初始化
onMounted(async () => {
    await initVersion();
    if (capabilities.electronUpdates) void loadAutoCheckUpdates();

    // 监听更新通知
    window.electronAPI?.app?.onUpdateAvailable?.((info: any) => {
        message.info(t('about.updateFound', { version: info.latestVersion }));
    });
});
</script>

<style scoped>
.about {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.about__head {
    display: flex;
    align-items: center;
    gap: 16px;
}

.about__logo {
    display: block;
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 13px;
}

.about__titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.about__description {
    margin: 0;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.about__version {
    font-size: var(--font-size-base);
}

.about__inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.about__secondary {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.about__notices {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 0 16px;
}

.about__update {
    align-items: center;
}

.about__update-text {
    flex: 1;
    min-width: 0;
}

.about__feedback {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
