<template>
    <NCard>
        <NFlex vertical :size="20">
            <!-- 启用 WebDAV 同步 -->
            <NFormItem label="启用 WebDAV 同步">
                <NCheckbox v-model:checked="props.modelValue.webdav.enabled" @update:checked="handleEnabledChange">
                    <NFlex align="center" :size="8">
                        <div>
                            <div>启用 WebDAV 数据同步</div>
                            <NText depth="3" style="font-size: 12px">
                                将数据同步到 WebDAV 服务器
                            </NText>
                        </div>
                    </NFlex>
                </NCheckbox>
            </NFormItem>

            <!-- WebDAV 服务器配置 -->
            <div v-if="props.modelValue.webdav.enabled">
                <NFlex vertical :size="16">
                    <NFormItem label="服务器地址">
                        <NInput v-model:value="props.modelValue.webdav.serverUrl" placeholder="https://example.com/webdav" type="url" @update:value="handleConfigChange">
                            <template #prefix>
                                <NIcon>
                                    <Cloud />
                                </NIcon>
                            </template>
                        </NInput>
                    </NFormItem>

                    <NFlex :size="16">
                        <NFormItem label="用户名" style="flex: 1">
                            <NInput v-model:value="props.modelValue.webdav.username" placeholder="用户名" @update:value="handleConfigChange" />
                        </NFormItem>
                        <NFormItem label="密码" style="flex: 1">
                            <NInput v-model:value="props.modelValue.webdav.password" type="password" placeholder="密码" @update:value="handleConfigChange" />
                        </NFormItem>
                    </NFlex>

                    <NFlex :size="12">
                        <NButton type="success" @click="saveSettings">
                            <template #icon>
                                <NIcon>
                                    <DeviceFloppy />
                                </NIcon>
                            </template>
                            保存配置
                        </NButton>
                        
                        <NButton type="primary" @click="testConnection">
                            <template #icon>
                                <NIcon>
                                    <CloudStorm />
                                </NIcon>
                            </template>
                            测试连接
                        </NButton>
                    </NFlex>

                    <NDivider />

                    <!-- 手动同步操作 -->
                    <div>
                        <NFlex vertical :size="16">
                            <div>
                                <NText depth="2" style="font-size: 16px; font-weight: 600;">📋 手动同步操作</NText>
                                <NText depth="3" style="font-size: 12px; margin-top: 4px; display: block;">
                                    完全控制数据的上传和下载过程，遇到差异时可以详细比较并手动选择处理方式
                                </NText>
                            </div>
                            
                            <NCard size="small" style="background-color: var(--info-color-suppl); border: 1px solid var(--info-color);">
                                <NFlex vertical :size="12">
                                    <div>
                                        <div style="font-weight: 600; margin-bottom: 4px;">🔄 推荐的同步流程</div>
                                        <div style="font-size: 12px; line-height: 1.5;">
                                            1. <strong>比较数据</strong> - 查看本地与远程的差异<br>
                                            2. <strong>上传到服务器</strong> - 将本地数据推送到服务器<br>
                                            3. <strong>从服务器下载</strong> - 获取服务器数据并处理冲突
                                        </div>
                                    </div>
                                </NFlex>
                            </NCard>
                            
                            <NFlex :size="12" style="flex-wrap: wrap;">
                                <NButton 
                                    type="info" 
                                    @click="handleCompareData"
                                    :loading="compareLoading"
                                    size="medium"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <GitCompare />
                                        </NIcon>
                                    </template>
                                    比较数据
                                </NButton>
                                
                                <NButton 
                                    type="success" 
                                    @click="handleManualUpload"
                                    :loading="uploadLoading"
                                    size="medium"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <Upload />
                                        </NIcon>
                                    </template>
                                    上传到服务器
                                </NButton>
                                
                                <NButton 
                                    type="warning" 
                                    @click="handleManualDownload"
                                    :loading="downloadLoading"
                                    size="medium"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <Download />
                                        </NIcon>
                                    </template>
                                    从服务器下载
                                </NButton>
                                
                                <NButton 
                                    @click="handleGetRemotePreview"
                                    :loading="previewLoading"
                                    size="medium"
                                >
                                    <template #icon>
                                        <NIcon>
                                            <Eye />
                                        </NIcon>
                                    </template>
                                    预览远程数据
                                </NButton>
                            </NFlex>
                            
                            <!-- 操作说明 -->
                            <NAlert type="info" show-icon style="margin-top: 8px;">
                                <template #header>💡 操作提示</template>
                                <div style="font-size: 12px;">
                                    <strong>上传</strong>：将本地数据推送到服务器，覆盖服务器上的数据<br>
                                    <strong>下载</strong>：从服务器获取数据，如有差异会显示详细比较界面<br>
                                    <strong>比较</strong>：查看本地与服务器数据的详细差异，不进行任何修改<br>
                                    <strong>预览</strong>：查看服务器上的数据概览，不下载到本地
                                </div>
                            </NAlert>
                        </NFlex>
                    </div>

                    <NDivider />

                    <!-- 自动同步设置 -->
                    <div>
                        <NFlex vertical :size="16">
                            <NText depth="2">自动同步设置</NText>
                            <NCheckbox v-model:checked="props.modelValue.webdav.autoSync" @update:checked="handleConfigChange">
                                启用自动同步
                            </NCheckbox>
                            
                            <div v-if="props.modelValue.webdav.autoSync">
                                <NFormItem label="同步间隔（分钟）">
                                    <NInputNumber 
                                        v-model:value="props.modelValue.webdav.syncInterval" 
                                        :min="5" 
                                        :max="1440"
                                        @update:value="handleConfigChange"
                                    />
                                </NFormItem>
                                
                                <NButton @click="syncNow" :loading="syncLoading">
                                    <template #icon>
                                        <NIcon>
                                            <BrandSoundcloud />
                                        </NIcon>
                                    </template>
                                    立即同步
                                </NButton>
                            </div>
                        </NFlex>
                    </div>

                    <NAlert v-if="props.modelValue.dataSync.lastSyncTime" type="info" show-icon>
                        <template #header>上次同步时间</template>
                        {{ formatSyncTime(props.modelValue.dataSync.lastSyncTime) }}
                    </NAlert>
                </NFlex>
            </div>
        </NFlex>

        <!-- 冲突解决对话框 -->
        <ConflictResolutionDialog
            v-model:show="showConflictDialog"
            :conflict-data="conflictData"
            :loading="resolveLoading"
            @resolve="handleConflictResolve"
            @cancel="handleConflictCancel"
        />

        <!-- 数据预览对话框 -->
        <NModal v-model:show="showPreviewDialog" preset="card" title="远程数据预览" style="width: 80%; max-width: 800px;">
            <div v-if="remotePreviewData">
                <NFlex vertical :size="16">
                    <NAlert type="info" show-icon>
                        <template #header>数据概览</template>
                        <div>
                            <div>上次同步时间: {{ formatSyncTime(remotePreviewData.timestamp) }}</div>
                            <div>分类数: {{ remotePreviewData.data?.categories?.length || 0 }}</div>
                            <div>提示词数: {{ remotePreviewData.data?.prompts?.length || 0 }}</div>
                            <div>AI配置数: {{ remotePreviewData.data?.aiConfigs?.length || 0 }}</div>
                        </div>
                    </NAlert>
                    
                    <NTabs type="line">
                        <NTabPane name="categories" tab="分类">
                            <div v-if="remotePreviewData.data?.categories?.length">
                                <div v-for="category in remotePreviewData.data.categories.slice(0, 10)" :key="category.id" class="preview-item">
                                    <NText strong>{{ category.name }}</NText>
                                    <NText depth="3" style="font-size: 12px;">{{ category.description }}</NText>
                                </div>
                                <NText v-if="remotePreviewData.data.categories.length > 10" depth="3" style="font-size: 12px;">
                                    ... 还有 {{ remotePreviewData.data.categories.length - 10 }} 个分类
                                </NText>
                            </div>
                            <NEmpty v-else description="无分类数据" />
                        </NTabPane>
                        
                        <NTabPane name="prompts" tab="提示词">
                            <div v-if="remotePreviewData.data?.prompts?.length">
                                <div v-for="prompt in remotePreviewData.data.prompts.slice(0, 10)" :key="prompt.id" class="preview-item">
                                    <NText strong>{{ prompt.title }}</NText>
                                    <NText depth="3" style="font-size: 12px;">{{ prompt.description }}</NText>
                                </div>
                                <NText v-if="remotePreviewData.data.prompts.length > 10" depth="3" style="font-size: 12px;">
                                    ... 还有 {{ remotePreviewData.data.prompts.length - 10 }} 个提示词
                                </NText>
                            </div>
                            <NEmpty v-else description="无提示词数据" />
                        </NTabPane>
                    </NTabs>
                </NFlex>
            </div>
        </NModal>

        <!-- 数据比较对话框 -->
        <NModal v-model:show="showCompareDialog" preset="card" title="数据比较结果" style="width: 80%; max-width: 1000px;">
            <div v-if="compareData">
                <NFlex vertical :size="16">
                    <NAlert type="info" show-icon>
                        <template #header>比较概览</template>
                        <div>
                            <div>本地记录数: {{ compareData.summary?.localTotal || 0 }}</div>
                            <div>远程记录数: {{ compareData.summary?.remoteTotal || 0 }}</div>
                            <div>新增项: {{ compareData.added?.length || 0 }}</div>
                            <div>修改项: {{ compareData.modified?.length || 0 }}</div>
                            <div>删除项: {{ compareData.deleted?.length || 0 }}</div>
                        </div>
                    </NAlert>
                    
                    <NTabs type="line">
                        <NTabPane name="added" tab="新增项" v-if="compareData.added?.length">
                            <div v-for="item in compareData.added" :key="`${item._type}-${item.id}`" class="compare-item">
                                <NFlex align="center" :size="8">
                                    <NTag type="success" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                                    <NText>{{ item.name || item.title || item.id }}</NText>
                                </NFlex>
                            </div>
                        </NTabPane>
                        
                        <NTabPane name="modified" tab="修改项" v-if="compareData.modified?.length">
                            <div v-for="item in compareData.modified" :key="`${item._type}-${item.id}`" class="compare-item">
                                <NFlex align="center" :size="8">
                                    <NTag type="warning" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                                    <NText>{{ item.local?.name || item.local?.title || item.id }}</NText>
                                    <NText depth="3" style="font-size: 12px;">（本地和远程都有修改）</NText>
                                </NFlex>
                            </div>
                        </NTabPane>
                        
                        <NTabPane name="deleted" tab="删除项" v-if="compareData.deleted?.length">
                            <div v-for="item in compareData.deleted" :key="`${item._type}-${item.id}`" class="compare-item">
                                <NFlex align="center" :size="8">
                                    <NTag type="error" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                                    <NText>{{ item.name || item.title || item.id }}</NText>
                                    <NText depth="3" style="font-size: 12px;">（本地存在，远程已删除）</NText>
                                </NFlex>
                            </div>
                        </NTabPane>
                    </NTabs>
                </NFlex>
            </div>
        </NModal>
    </NCard>
</template>

<script setup lang="ts">
import {
    NCard,
    NFlex,
    NFormItem,
    NCheckbox,
    NInput,
    NInputNumber,
    NButton,
    NText,
    NIcon,
    NAlert,
    NDivider,
    NModal,
    NTabs,
    NTabPane,
    NTag,
    NEmpty,
    useMessage,
} from "naive-ui";
import {
    Cloud,
    DeviceFloppy,
    CloudStorm,
    BrandSoundcloud,
    Upload,
    Download,
    GitCompare,
    Eye,
} from "@vicons/tabler";
import { ref } from "vue";
import ConflictResolutionDialog from './ConflictResolutionDialog.vue';
import { AppService } from '../../lib/utils/app.service';

interface WebDAVSettings {
    webdav: {
        enabled: boolean;
        serverUrl: string;
        username: string;
        password: string;
        autoSync: boolean;
        syncInterval: number;
    };
    dataSync: {
        lastSyncTime: string | null;
        autoBackup: boolean;
        backupInterval: number;
    };
}

const props = defineProps<{
    modelValue: WebDAVSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: WebDAVSettings];
    "save-webdav": [];
    "test-connection": [];
    "sync-now": [];
}>();

const message = useMessage();
const appService = AppService.getInstance();

// 加载状态
const uploadLoading = ref(false);
const downloadLoading = ref(false);
const syncLoading = ref(false);
const resolveLoading = ref(false);
const compareLoading = ref(false);
const previewLoading = ref(false);

// 对话框状态
const showConflictDialog = ref(false);
const showPreviewDialog = ref(false);
const showCompareDialog = ref(false);

// 数据状态
const conflictData = ref(null);
const remotePreviewData = ref(null);
const compareData = ref(null);

// 启用/禁用 WebDAV 同步
const handleEnabledChange = () => {
    emit("update:modelValue", props.modelValue);
};

// 配置变更
const handleConfigChange = () => {
    emit("update:modelValue", props.modelValue);
};

// 保存设置
const saveSettings = () => {
    emit("save-webdav");
};

// 测试连接
const testConnection = () => {
    emit("test-connection");
};

// 立即同步
const syncNow = () => {
    emit("sync-now");
};

// 手动上传
const handleManualUpload = async () => {
    uploadLoading.value = true;
    try {
        const result = await appService.manualUploadWebDAV();
        if (result.success) {
            message.success(result.data.message || '上传成功');
            emit("update:modelValue", {
                ...props.modelValue,
                dataSync: {
                    ...props.modelValue.dataSync,
                    lastSyncTime: result.data.timestamp
                }
            });
        } else {
            message.error(result.error || '上传失败');
        }
    } catch (error) {
        message.error('上传失败: ' + error.message);
    } finally {
        uploadLoading.value = false;
    }
};

// 手动下载
const handleManualDownload = async () => {
    downloadLoading.value = true;
    try {
        const result = await appService.manualDownloadWebDAV();
        if (result.success) {
            if (result.data.hasConflicts) {
                // 显示专业的冲突解决对话框
                conflictData.value = result.data;
                showConflictDialog.value = true;
                message.warning('检测到数据差异，请选择处理方式');
            } else {
                // 无冲突，直接应用远程数据
                const applyResult = await appService.applyDownloadedData({
                    strategy: 'use_remote'
                });
                if (applyResult.success) {
                    message.success('数据下载并应用成功，无差异');
                    emit("update:modelValue", {
                        ...props.modelValue,
                        dataSync: {
                            ...props.modelValue.dataSync,
                            lastSyncTime: result.data.timestamp
                        }
                    });
                } else {
                    message.error(applyResult.error || '应用数据失败');
                }
            }
        } else {
            message.error(result.error || '下载失败');
        }
    } catch (error) {
        message.error('下载失败: ' + error.message);
    } finally {
        downloadLoading.value = false;
    }
};

// 比较数据
const handleCompareData = async () => {
    compareLoading.value = true;
    try {
        const result = await appService.compareWebDAVData();
        if (result.success) {
            if (result.data.differences) {
                compareData.value = result.data.differences;
                showCompareDialog.value = true;
                message.success('数据比较完成');
            } else {
                message.info('数据比较完成，本地与远程数据完全一致');
            }
        } else {
            message.error(result.error || '数据比较失败');
        }
    } catch (error) {
        message.error('数据比较失败: ' + error.message);
    } finally {
        compareLoading.value = false;
    }
};

// 获取远程数据预览
const handleGetRemotePreview = async () => {
    previewLoading.value = true;
    try {
        const result = await appService.getRemoteDataPreview();
        if (result.success) {
            remotePreviewData.value = result.data;
            showPreviewDialog.value = true;
            message.success('远程数据预览加载完成');
        } else {
            message.error(result.error || '获取远程数据预览失败');
        }
    } catch (error) {
        message.error('获取远程数据预览失败: ' + error.message);
    } finally {
        previewLoading.value = false;
    }
};

// 处理冲突解决
const handleConflictResolve = async (resolution: any) => {
    resolveLoading.value = true;
    try {
        const result = await appService.applyDownloadedData(resolution);
        if (result.success) {
            message.success('冲突解决成功');
            showConflictDialog.value = false;
            conflictData.value = null;
            emit("update:modelValue", {
                ...props.modelValue,
                dataSync: {
                    ...props.modelValue.dataSync,
                    lastSyncTime: result.data.timestamp
                }
            });
        } else {
            message.error(result.error || '应用数据失败');
        }
    } catch (error) {
        message.error('解决冲突失败: ' + error.message);
    } finally {
        resolveLoading.value = false;
    }
};

// 处理冲突取消
const handleConflictCancel = () => {
    showConflictDialog.value = false;
    conflictData.value = null;
};

// 格式化同步时间
const formatSyncTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

// 获取数据类型标签
const getDataTypeLabel = (type: string) => {
    const labels = {
        categories: '分类',
        prompts: '提示词',
        aiConfigs: 'AI配置',
        history: '历史记录',
        settings: '设置'
    };
    return labels[type] || type;
};
</script>

<style scoped>
.preview-item {
    padding: 8px;
    border-left: 3px solid var(--primary-color);
    margin-bottom: 8px;
    background-color: var(--card-color);
    border-radius: 4px;
}

.compare-item {
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    margin-bottom: 8px;
}

.compare-item:hover {
    background-color: var(--hover-color);
}
</style>
