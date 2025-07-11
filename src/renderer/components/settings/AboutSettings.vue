<template>
    <NCard>
        <NFlex vertical :size="24">
            <!-- 应用信息 -->
            <NFlex vertical :size="16" align="center">
                <div style="text-align: center;">
                    <NAvatar size="large" :src="appIcon" style="width: 80px; height: 80px; margin-bottom: 16px;" />
                    <div>
                        <NText strong style="font-size: 24px; display: block; margin-bottom: 8px;">
                            {{ t('about.appName') }}
                        </NText>
                        <NText depth="3" style="font-size: 14px; display: block; margin-bottom: 4px;">
                            {{ t('about.appDescription') }}
                        </NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('about.appFeatures') }}
                        </NText>
                    </div>
                </div>
            </NFlex>

            <NDivider />

            <!-- 版本信息 -->
            <NFlex vertical :size="12">
                <NText strong style="font-size: 16px; margin-bottom: 8px;">{{ t('about.versionInfo') }}</NText>
                <NFlex vertical :size="8">
                    <NFlex justify="space-between">
                        <NText depth="2">{{ t('about.currentVersion') }}</NText>
                        <NText>{{ currentVersion }}</NText>
                    </NFlex>
                    <NFlex justify="space-between" v-if="latestVersion">
                        <NText depth="2">{{ t('about.latestVersion') }}</NText>
                        <NFlex align="center" :size="8">
                            <NText>{{ latestVersion }}</NText>
                            <NTag v-if="hasUpdate" type="warning" size="small">
                                {{ t('about.hasUpdate') }}
                            </NTag>
                            <NTag v-else type="success" size="small">
                                {{ t('about.isLatest') }}
                            </NTag>
                        </NFlex>
                    </NFlex>
                    <NFlex justify="space-between" v-if="publishedAt">
                        <NText depth="2">{{ t('about.publishedAt') }}</NText>
                        <NText>{{ publishedAt }}</NText>
                    </NFlex>
                </NFlex>
            </NFlex>

            <!-- 更新检查 -->
            <NFlex vertical :size="12">
                <NFlex justify="space-between" align="center">
                    <NText strong style="font-size: 16px;">{{ t('about.updateCheck') }}</NText>
                    <NButton @click="handleCheckForUpdates" :loading="checking" secondary type="primary">
                        <template #icon>
                            <NIcon>
                                <Refresh />
                            </NIcon>
                        </template>
                        {{ t('about.checkForUpdates') }}
                    </NButton>
                </NFlex>

                <!-- 更新信息 -->
                <div v-if="hasUpdate && releaseNotes">
                    <NAlert type="info" :title="t('about.newVersionAvailable')" style="margin-bottom: 12px;">
                        <NFlex vertical :size="8">
                            <NText>
                                {{ t('about.newVersionDesc', { version: latestVersion }) }}
                            </NText>
                            <NFlex :size="8">
                                <NButton @click="handleOpenDownloadPage" type="primary" size="small">
                                    {{ t('about.downloadNewVersion') }}
                                </NButton>
                                <NButton @click="showReleaseNotes = !showReleaseNotes" quaternary size="small">
                                    {{ showReleaseNotes ? t('about.hideReleaseNotes') : t('about.viewReleaseNotes') }}
                                </NButton>
                            </NFlex>
                        </NFlex>
                    </NAlert>

                    <!-- 更新说明 -->
                    <NCollapse v-if="showReleaseNotes" style="margin-top: 12px;">
                        <NCollapseItem :title="t('about.releaseNotes')" name="release-notes">
                            <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
                                {{ releaseNotes }}
                            </div>
                        </NCollapseItem>
                    </NCollapse>
                </div>

                <!-- 检查失败提示 -->
                <NAlert v-if="checkError" type="error" :title="checkError" closable @close="checkError = ''" />
            </NFlex>

            <NDivider />

            <!-- 项目信息 -->
            <NFlex vertical :size="12">
                <NText strong style="font-size: 16px; margin-bottom: 8px;">{{ t('about.projectInfo') }}</NText>
                <NFlex vertical :size="8">
                    <NFlex justify="space-between">
                        <NText depth="2">{{ t('about.developer') }}</NText>
                        <NText>{{ t('about.developerName') }}</NText>
                    </NFlex>
                    <NFlex justify="space-between">
                        <NText depth="2">{{ t('about.github') }}</NText>
                        <NButton text type="primary" @click="openGitHub" style="padding: 0; font-size: 14px;">
                            {{ t('about.githubRepo') }}
                        </NButton>
                    </NFlex>
                    <NFlex justify="space-between">
                        <NText depth="2">{{ t('about.license') }}</NText>
                        <NText>{{ t('about.licenseType') }}</NText>
                    </NFlex>
                </NFlex>
            </NFlex>

            <!-- 反馈与支持 -->
            <NFlex vertical :size="12">
                <NText strong style="font-size: 16px; margin-bottom: 8px;">{{ t('about.feedbackSupport') }}</NText>
                <NFlex :size="12" wrap>
                    <NButton @click="openIssues" secondary>
                        <template #icon>
                            <NIcon>
                                <Bug />
                            </NIcon>
                        </template>
                        {{ t('about.reportIssue') }}
                    </NButton>
                    <NButton @click="openFeatureRequest" secondary>
                        <template #icon>
                            <NIcon>
                                <Bulb />
                            </NIcon>
                        </template>
                        {{ t('about.featureRequest') }}
                    </NButton>
                </NFlex>
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NTag,
    NAlert,
    NCollapse,
    NCollapseItem,
    NDivider,
    NAvatar,
    useMessage
} from 'naive-ui';
import { Refresh, Bug, Bulb, MessageCircle } from '@vicons/tabler';
import { useUpdate } from '~/composables/useUpdate';

const { t } = useI18n();

// 应用图标
const appIcon = new URL('../../assets/images/logo.png', import.meta.url).href;

// 使用更新服务
const {
    currentVersion,
    updateInfo,
    checking,
    checkError,
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

// 检查更新
const handleCheckForUpdates = async () => {
    const result = await checkForUpdates();
    if (result.success) {
        if (result.data?.hasUpdate) {
            message.success(`发现新版本 ${result.data.latestVersion}！`);
        } else {
            message.info('当前已是最新版本');
        }
    } else {
        message.error(result.error || '检查更新失败');
    }
};

// 打开下载页面
const handleOpenDownloadPage = async () => {
    if (!downloadUrl.value) return;

    const result = await openDownloadPage(downloadUrl.value);
    if (!result.success) {
        message.error(result.error || '打开下载页面失败');
    }
};

// 打开 GitHub 仓库
const openGitHub = async () => {
    try {
        await window.electronAPI.app.openDownloadPage('https://github.com/yarin-zhang/AI-Gist');
    } catch (error) {
        message.error('打开 GitHub 失败');
    }
};

// 打开问题报告页面
const openIssues = async () => {
    try {
        await window.electronAPI.app.openDownloadPage('https://github.com/yarin-zhang/AI-Gist/issues');
    } catch (error) {
        message.error('打开页面失败');
    }
};

// 打开功能建议页面
const openFeatureRequest = async () => {
    try {
        await window.electronAPI.app.openDownloadPage('https://github.com/yarin-zhang/AI-Gist/issues/new?template=feature_request.md');
    } catch (error) {
        message.error('打开页面失败');
    }
};

// 组件挂载时初始化
onMounted(async () => {
    await initVersion();

    // 监听更新通知
    window.electronAPI.app.onUpdateAvailable((info: any) => {
        message.info(`发现新版本 ${info.latestVersion}！`);
    });
});
</script>

<style scoped>
/* 自定义样式 */
</style>
