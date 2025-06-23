<template>
    <NCard>
        <NFlex vertical :size="24">
            <!-- 应用信息 -->
            <NFlex vertical :size="16" align="center">
                <div style="text-align: center;">
                    <NAvatar size="large" :src="appIcon" style="width: 80px; height: 80px; margin-bottom: 16px;" />
                    <div>
                        <NText strong style="font-size: 24px; display: block; margin-bottom: 8px;">
                            AI Gist
                        </NText>
                        <NText depth="3" style="font-size: 14px; display: block; margin-bottom: 4px;">
                            本地优先的 AI 提示词管理工具
                        </NText>
                        <NText depth="3" style="font-size: 12px;">
                            管理 AI 提示词 + 变量填充 + 分类标签
                        </NText>
                    </div>
                </div>
            </NFlex>

            <NDivider />

            <!-- 版本信息 -->
            <NFlex vertical :size="12">
                <NText strong style="font-size: 16px; margin-bottom: 8px;">版本信息</NText>
                <NFlex vertical :size="8">
                    <NFlex justify="space-between">
                        <NText depth="2">当前版本</NText>
                        <NText>{{ currentVersion }}</NText>
                    </NFlex>
                    <NFlex justify="space-between" v-if="updateInfo">
                        <NText depth="2">最新版本</NText>
                        <NFlex align="center" :size="8">
                            <NText>{{ updateInfo.latestVersion }}</NText>
                            <NTag v-if="updateInfo.hasUpdate" type="warning" size="small">
                                有新版本
                            </NTag>
                            <NTag v-else type="success" size="small">
                                已是最新
                            </NTag>
                        </NFlex>
                    </NFlex>
                    <NFlex justify="space-between" v-if="updateInfo?.publishedAt">
                        <NText depth="2">发布日期</NText>
                        <NText>{{ formatDate(updateInfo.publishedAt) }}</NText>
                    </NFlex>
                </NFlex>
            </NFlex>

            <!-- 更新检查 -->
            <NFlex vertical :size="12">
                <NFlex justify="space-between" align="center">
                    <NText strong style="font-size: 16px;">更新检查</NText>
                    <NButton 
                        @click="checkForUpdates" 
                        :loading="checking" 
                        secondary
                        type="primary"
                    >
                        <template #icon>
                            <NIcon>
                                <Refresh />
                            </NIcon>
                        </template>
                        检查更新
                    </NButton>
                </NFlex>

                <!-- 更新信息 -->
                <div v-if="updateInfo?.hasUpdate && updateInfo.releaseNotes">
                    <NAlert type="info" title="发现新版本" style="margin-bottom: 12px;">
                        <NFlex vertical :size="8">
                            <NText>
                                新版本 {{ updateInfo.latestVersion }} 已发布，建议您及时更新。
                            </NText>
                            <NFlex :size="8">
                                <NButton 
                                    @click="openDownloadPage" 
                                    type="primary" 
                                    size="small"
                                >
                                    下载新版本
                                </NButton>
                                <NButton 
                                    @click="showReleaseNotes = !showReleaseNotes" 
                                    quaternary 
                                    size="small"
                                >
                                    {{ showReleaseNotes ? '隐藏' : '查看' }}更新说明
                                </NButton>
                            </NFlex>
                        </NFlex>
                    </NAlert>

                    <!-- 更新说明 -->
                    <NCollapse v-if="showReleaseNotes" style="margin-top: 12px;">
                        <NCollapseItem title="更新说明" name="release-notes">
                            <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
                                {{ updateInfo.releaseNotes }}
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
                <NText strong style="font-size: 16px; margin-bottom: 8px;">项目信息</NText>
                <NFlex vertical :size="8">
                    <NFlex justify="space-between">
                        <NText depth="2">开发者</NText>
                        <NText>Yarin Zhang</NText>
                    </NFlex>
                    <NFlex justify="space-between">
                        <NText depth="2">GitHub</NText>
                        <NButton 
                            text 
                            type="primary" 
                            @click="openGitHub"
                            style="padding: 0; font-size: 14px;"
                        >
                            yarin-zhang/AI-Gist
                        </NButton>
                    </NFlex>
                    <NFlex justify="space-between">
                        <NText depth="2">许可证</NText>
                        <NText>MIT License</NText>
                    </NFlex>
                </NFlex>
            </NFlex>

            <!-- 反馈与支持 -->
            <NFlex vertical :size="12">
                <NText strong style="font-size: 16px; margin-bottom: 8px;">反馈与支持</NText>
                <NFlex :size="12" wrap>
                    <NButton @click="openIssues" secondary>
                        <template #icon>
                            <NIcon>
                                <Bug />
                            </NIcon>
                        </template>
                        报告问题
                    </NButton>
                    <NButton @click="openFeatureRequest" secondary>
                        <template #icon>
                            <NIcon>
                                <Bulb />
                            </NIcon>
                        </template>
                        功能建议
                    </NButton>
                    <NButton @click="openDiscussions" secondary>
                        <template #icon>
                            <NIcon>
                                <MessageCircle />
                            </NIcon>
                        </template>
                        社区讨论
                    </NButton>
                </NFlex>
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

// 应用图标
const appIcon = new URL('/src/assets/icon.png', import.meta.url).href;

// 状态管理
const message = useMessage();
const currentVersion = ref('');
const updateInfo = ref<any>(null);
const checking = ref(false);
const checkError = ref('');
const showReleaseNotes = ref(false);

// 格式化日期
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

// 检查更新
const checkForUpdates = async () => {
    if (checking.value) return;
    
    checking.value = true;
    checkError.value = '';
    
    try {
        const result = await window.electronAPI.app.checkUpdates();
        if (result.success) {
            updateInfo.value = result.data;
            if (result.data.hasUpdate) {
                message.success(`发现新版本 ${result.data.latestVersion}！`);
            } else {
                message.info('当前已是最新版本');
            }
        } else {
            checkError.value = result.error || '检查更新失败';
        }
    } catch (error: any) {
        checkError.value = error.message || '检查更新失败';
    }
    
    checking.value = false;
};

// 打开下载页面
const openDownloadPage = async () => {
    if (!updateInfo.value?.downloadUrl) return;
    
    try {
        await window.electronAPI.app.openDownloadPage(updateInfo.value.downloadUrl);
    } catch (error) {
        message.error('打开下载页面失败');
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

// 打开讨论页面
const openDiscussions = async () => {
    try {
        await window.electronAPI.app.openDownloadPage('https://github.com/yarin-zhang/AI-Gist/discussions');
    } catch (error) {
        message.error('打开页面失败');
    }
};

// 获取当前版本
const getCurrentVersion = async () => {
    try {
        currentVersion.value = await window.electronAPI.app.getVersion();
    } catch (error) {
        console.error('获取版本失败:', error);
    }
};

// 组件挂载时初始化
onMounted(async () => {
    await getCurrentVersion();
    
    // 监听更新通知
    window.electronAPI.app.onUpdateAvailable((info: any) => {
        updateInfo.value = info;
        message.info(`发现新版本 ${info.latestVersion}！`);
    });
});
</script>

<style scoped>
/* 自定义样式 */
</style>
