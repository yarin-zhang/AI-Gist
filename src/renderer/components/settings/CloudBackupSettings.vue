<template>
    <NCard>
        <NFlex vertical :size="20">

            <!-- 云端备份管理 - 使用标签页结构 -->
            <div v-if="storageConfigs.length > 0">
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('cloudBackup.backupManagement') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('cloudBackup.backupDescription') }}
                        </NText>
                    </NFlex>

                    <!-- 标签页结构 -->
                    <NTabs v-model:value="activeTabKey" type="line" animated>
                        <NTabPane v-for="config in storageConfigs" :key="config.id" :name="config.id" :tab="config.name"
                            :disabled="!config.enabled">
                            <NFlex vertical :size="16">
                                <!-- 备份操作按钮 -->
                                <NFlex :size="12">
                                    <NButton type="primary" @click="createCloudBackup(config.id)"
                                        :loading="loading.createBackup">
                                        <template #icon>
                                            <NIcon>
                                                <Upload />
                                            </NIcon>
                                        </template>
                                        {{ t('cloudBackup.createCloudBackup') }}
                                    </NButton>
                                    <NButton @click="refreshCloudBackupList(config.id)" :loading="loading.refreshList">
                                        <template #icon>
                                            <NIcon>
                                                <Refresh />
                                            </NIcon>
                                        </template>
                                        {{ t('cloudBackup.refreshBackupList') }}
                                    </NButton>
                                </NFlex>

                                <!-- 云端备份列表 -->
                                <div v-if="getPaginatedBackups(config.id).length > 0">
                                                                            <NFlex vertical :size="12">
                                            <NText depth="2">{{ t('cloudBackup.cloudBackupList') }}</NText>
                                        <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                            <NGridItem v-for="backup in getPaginatedBackups(config.id)" :key="backup.id"
                                                span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                                <NCard size="small" :title="backup.name">
                                                    <NFlex vertical :size="4">
                                                        <NFlex align="center" :size="8">
                                                            <NText strong>{{ backup.description || t('cloudBackup.cloudBackup') }}</NText>
                                                        </NFlex>
                                                        <NFlex align="center" :size="8">
                                                            <NTag type="info" size="small">{{
                                                                formatDate(backup.createdAt) }}</NTag>
                                                            <NTag type="success" size="small">{{ formatSize(backup.size)
                                                                }}</NTag>
                                                        </NFlex>
                                                    </NFlex>

                                                    <template #action>
                                                        <NFlex justify="space-between" align="center"
                                                            style="width: 100%;">
                                                            <NPopconfirm
                                                                @positive-click="restoreCloudBackup(config.id, backup.id)"
                                                                negative-text="取消" positive-text="确定恢复" placement="top"
                                                                :show-icon="false">
                                                                <template #trigger>
                                                                    <NButton type="primary" size="small"
                                                                        :loading="loading.restoreBackup"
                                                                        :disabled="loading.restoreBackup">
                                                                        <template #icon>
                                                                            <NIcon>
                                                                                <Recharging />
                                                                            </NIcon>
                                                                        </template>
                                                                        {{ t('cloudBackup.restore') }}
                                                                    </NButton>
                                                                </template>
                                                                <div style="max-width: 300px;">
                                                                    <p>{{ t('cloudBackup.restoreWarning') }}</p>
                                                                </div>
                                                            </NPopconfirm>
                                                            <NPopconfirm
                                                                @positive-click="deleteCloudBackup(config.id, backup.id)"
                                                                negative-text="取消" positive-text="确定">
                                                                <template #trigger>
                                                                    <NButton type="error" secondary size="small">
                                                                        <template #icon>
                                                                            <NIcon>
                                                                                <Trash />
                                                                            </NIcon>
                                                                        </template>
                                                                        {{ t('cloudBackup.delete') }}
                                                                    </NButton>
                                                                </template>
                                                                {{ t('cloudBackup.confirmDeleteBackup') }}
                                                            </NPopconfirm>
                                                        </NFlex>
                                                    </template>
                                                </NCard>
                                            </NGridItem>
                                        </NGrid>

                                        <!-- 分页组件 -->
                                        <div v-if="getPaginationData(config.id).totalPages > 1"
                                            class="pagination-container">
                                            <NPagination :page="getPaginationData(config.id).currentPage"
                                                @update:page="(page) => updatePaginationState(config.id, page, getPaginationData(config.id).pageSize)"
                                                :page-count="getPaginationData(config.id).totalPages"
                                                :page-size="getPaginationData(config.id).pageSize"
                                                :item-count="getPaginationData(config.id).totalItems" show-size-picker
                                                show-quick-jumper :page-sizes="[6, 12, 18]"
                                                @update:page-size="(size) => updatePaginationState(config.id, 1, size)" />
                                        </div>
                                    </NFlex>
                                </div>

                                <div v-else>
                                    <NText depth="3" style="font-size: 14px;">
                                        {{ t('cloudBackup.noCloudBackups') }}
                                    </NText>
                                </div>
                            </NFlex>
                        </NTabPane>
                    </NTabs>
                </NFlex>
            </div>


            <NDivider v-if="storageConfigs.length > 0" />

            <!-- 存储配置管理 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('cloudBackup.storageConfiguration') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('cloudBackup.storageDescription') }}
                        </NText>

                        <NFlex :size="12">
                            <NButton type="primary" @click="showAddConfigModal">
                                <template #icon>
                                    <NIcon>
                                        <Plus />
                                    </NIcon>
                                </template>
                                {{ t('cloudBackup.addStorageConfig') }}
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <!-- 存储配置列表 -->
                    <div v-if="storageConfigs.length > 0">
                                                    <NFlex vertical :size="12">
                                <NText depth="2">{{ t('cloudBackup.configuredStorage') }}</NText>
                            <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                <NGridItem v-for="config in storageConfigs" :key="config.id"
                                    span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                    <NCard size="small" :title="config.name">
                                        <NFlex vertical :size="8">
                                            <NFlex align="center" :size="8">
                                                <NTag :type="config.type === 'webdav' ? 'info' : 'success'"
                                                    size="small">
                                                    {{ config.type === 'webdav' ? 'WebDAV' : 'iCloud Drive' }}
                                                </NTag>
                                                <NTag :type="config.enabled ? 'success' : 'warning'" size="small">
                                                    {{ config.enabled ? t('cloudBackup.enabled') : t('cloudBackup.disabled') }}
                                                </NTag>
                                            </NFlex>
                                            <NText depth="3" style="font-size: 12px;">
                                                {{ getConfigDescription(config) }}
                                            </NText>
                                        </NFlex>

                                        <template #action>
                                            <NFlex justify="space-between" align="center" style="width: 100%;">
                                                <NButton size="small" @click="testConnection(config)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Wifi />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('cloudBackup.testConnection') }}
                                                </NButton>
                                                <NButton size="small" @click="editConfig(config)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Edit />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('cloudBackup.editConfig') }}
                                                </NButton>
                                                <NPopconfirm @positive-click="deleteConfig(config.id)"
                                                    negative-text="取消" positive-text="确定">
                                                    <template #trigger>
                                                        <NButton type="error" secondary size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                            删除
                                                        </NButton>
                                                    </template>
                                                    确定要删除这个存储配置吗？
                                                </NPopconfirm>
                                            </NFlex>
                                        </template>
                                    </NCard>
                                </NGridItem>
                            </NGrid>
                        </NFlex>
                    </div>

                    <div v-else>
                        <NText depth="3" style="font-size: 14px;">
                            暂无存储配置，请先添加存储配置
                        </NText>
                    </div>
                </NFlex>
            </div>

        </NFlex>

        <!-- 添加/编辑配置模态框 -->
        <NModal v-model:show="showConfigModal" preset="card" style="width: 600px;" title="存储配置">
            <NFlex vertical :size="16">
                <NForm ref="formRef" :model="configForm" :rules="formRules">
                    <!-- 存储类型选择 -->
                    <NFormItem label="存储类型" path="type">
                        <NRadioGroup v-model:value="configForm.type" @update:value="handleTypeChange">
                            <NRadio value="webdav">WebDAV</NRadio>
                            <NRadio value="icloud">iCloud Drive</NRadio>
                        </NRadioGroup>
                    </NFormItem>

                    <!-- 配置名称 - 根据类型自动生成 -->
                    <NFormItem label="配置名称" path="name">
                        <NInput v-model:value="configForm.name" placeholder="配置名称将根据存储类型自动生成" />
                    </NFormItem>

                    <!-- WebDAV 配置 -->
                    <template v-if="configForm.type === 'webdav'">
                        <NFormItem label="服务器地址" path="url">
                            <NInput v-model:value="configForm.url" placeholder="https://your-webdav-server.com" />
                        </NFormItem>
                        <NFormItem label="用户名" path="username">
                            <NInput v-model:value="configForm.username" placeholder="请输入用户名" />
                        </NFormItem>
                        <NFormItem label="密码" path="password">
                            <NInput v-model:value="configForm.password" type="password" placeholder="请输入密码" />
                        </NFormItem>
                    </template>

                    <!-- iCloud Drive 配置 -->
                    <template v-if="configForm.type === 'icloud'">
                        <!-- iCloud 不可用时的提示 -->
                        <template v-if="iCloudAvailability && !iCloudAvailability.available">
                            <NAlert type="warning" style="margin-bottom: 16px;">
                                <template #icon>
                                    <NIcon>
                                        <Wifi />
                                    </NIcon>
                                </template>
                                <NText depth="3" style="font-size: 12px;">
                                    {{ iCloudAvailability.reason }}
                                </NText>
                            </NAlert>
                        </template>

                        <NFormItem label="iCloud Drive 路径" path="path">
                            <NInput v-model:value="configForm.path" placeholder="AI-Gist-Backup" />
                        </NFormItem>
                    </template>

                    <NFormItem label="启用状态" path="enabled">
                        <NSwitch v-model:value="configForm.enabled" />
                    </NFormItem>
                </NForm>

                <NFlex justify="end" :size="12">
                    <NButton @click="showConfigModal = false">取消</NButton>
                    <NButton type="primary" @click="saveConfig" :loading="loading.saveConfig"
                        :disabled="!canSaveICloudConfig">
                        保存
                    </NButton>
                </NFlex>
            </NFlex>
        </NModal>
    </NCard>
</template>

<script setup lang="ts">
import {
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NAlert,
    NDivider,
    NPopconfirm,
    NTag,
    NGrid,
    NGridItem,
    NModal,
    NForm,
    NFormItem,
    NInput,
    NRadioGroup,
    NRadio,
    NSwitch,
    NTabs,
    NTabPane,
    NPagination,
    useMessage,
} from "naive-ui";
import {
    Plus,
    Edit,
    Trash,
    Upload,
    Refresh,
    Recharging,
    Wifi,
} from "@vicons/tabler";
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from 'vue-i18n';
import { CloudBackupAPI } from "@/lib/api/cloud-backup.api";
import type { CloudStorageConfig, CloudBackupInfo } from "@shared/types/cloud-backup";

const message = useMessage();
const { t } = useI18n();

// 响应式数据
const storageConfigs = ref<CloudStorageConfig[]>([]);
const cloudBackups = ref<CloudBackupInfo[]>([]);
const activeTabKey = ref<string>('');
const showConfigModal = ref(false);
const iCloudAvailability = ref<{ available: boolean; reason?: string } | null>(null);
const loading = ref({
    saveConfig: false,
    createBackup: false,
    restoreBackup: false,
    refreshList: false,
    checkICloud: false,
});

// 分页相关状态
const currentPage = ref(1);
const pageSize = 6;

// 为每个存储配置维护独立的分页状态
const paginationStates = ref<Record<string, { currentPage: number; pageSize: number }>>({});

// 表单数据
const configForm = ref({
    id: '',
    name: '',
    type: 'webdav' as 'webdav' | 'icloud',
    enabled: true,
    url: '',
    username: '',
    password: '',
    path: 'AI-Gist-Backup',
});

// 表单规则
const formRules = {
    name: {
        required: true,
        message: '请输入配置名称',
        trigger: 'blur'
    },
    type: {
        required: true,
        message: '请选择存储类型',
        trigger: 'change'
    },
    url: {
        required: true,
        message: '请输入服务器地址',
        trigger: 'blur',
        validator: (rule: any, value: string) => {
            if (configForm.value.type === 'webdav' && !value) {
                return new Error('请输入服务器地址');
            }
        }
    },
    username: {
        required: true,
        message: '请输入用户名',
        trigger: 'blur',
        validator: (rule: any, value: string) => {
            if (configForm.value.type === 'webdav' && !value) {
                return new Error('请输入用户名');
            }
        }
    },
    password: {
        required: true,
        message: '请输入密码',
        trigger: 'blur',
        validator: (rule: any, value: string) => {
            if (configForm.value.type === 'webdav' && !value) {
                return new Error('请输入密码');
            }
        }
    },
    path: {
        required: true,
        message: '请输入路径',
        trigger: 'blur',
        validator: (rule: any, value: string) => {
            if (configForm.value.type === 'icloud' && (!value || value.trim() === '')) {
                return new Error('iCloud 路径不能为空');
            }
        }
    }
};

// 计算属性
const canSaveICloudConfig = computed(() => {
    if (configForm.value.type !== 'icloud') return true;
    return iCloudAvailability.value?.available !== false;
});

// 分页相关计算属性
const getPaginatedBackups = (storageId: string) => {
    const backups = cloudBackups.value.filter(backup => backup.storageId === storageId);
    const state = paginationStates.value[storageId] || { currentPage: 1, pageSize: 6 };
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return backups.slice(start, end);
};

const getPaginationData = (storageId: string) => {
    const backups = cloudBackups.value.filter(backup => backup.storageId === storageId);
    const state = paginationStates.value[storageId] || { currentPage: 1, pageSize: 6 };
    const totalItems = backups.length;
    const totalPages = Math.ceil(totalItems / state.pageSize);
    return { totalItems, totalPages, currentPage: state.currentPage, pageSize: state.pageSize };
};

// 更新分页状态
const updatePaginationState = (storageId: string, page: number, size: number) => {
    paginationStates.value[storageId] = { currentPage: page, pageSize: size };
};

// 方法
const getAutoGeneratedName = () => {
    const baseName = configForm.value.type === 'webdav' ? 'WebDAV' : 'iCloud Drive';
    const existingCount = storageConfigs.value.filter(config =>
        config.type === configForm.value.type &&
        config.name.startsWith(baseName)
    ).length;

    if (existingCount === 0) {
        return baseName;
    } else {
        return `${baseName} ${existingCount + 1}`;
    }
};

const checkICloudAvailability = async () => {
    loading.value.checkICloud = true;
    try {
        console.log('开始检测 iCloud 可用性...');
        const result = await CloudBackupAPI.checkICloudAvailability();
        console.log('iCloud 检测结果:', result);
        iCloudAvailability.value = result;
    } catch (error) {
        console.error('检测 iCloud 可用性失败:', error);
        console.error('错误详情:', {
            name: (error as Error).name,
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        iCloudAvailability.value = { available: false, reason: '检测失败，请检查网络连接' };
    } finally {
        loading.value.checkICloud = false;
    }
};

const loadStorageConfigs = async () => {
    try {
        storageConfigs.value = await CloudBackupAPI.getStorageConfigs();
        // 设置默认选中的标签页
        if (storageConfigs.value.length > 0 && !activeTabKey.value) {
            activeTabKey.value = storageConfigs.value[0].id;
            // 自动加载第一个配置的备份列表
            await refreshCloudBackupList(storageConfigs.value[0].id);
        }
    } catch (error) {
        console.error('加载存储配置失败:', error);
        message.error('加载存储配置失败');
    }
};

const showAddConfigModal = () => {
    configForm.value = {
        id: '',
        name: '',
        type: 'webdav',
        enabled: true,
        url: '',
        username: '',
        password: '',
        path: 'AI-Gist-Backup',
    };
    // 自动生成配置名称
    configForm.value.name = getAutoGeneratedName();
    showConfigModal.value = true;
};

const editConfig = (config: CloudStorageConfig) => {
    configForm.value = {
        id: config.id,
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        url: config.type === 'webdav' ? (config as any).url : '',
        username: config.type === 'webdav' ? (config as any).username : '',
        password: config.type === 'webdav' ? (config as any).password : '',
        path: config.type === 'icloud' ? (config as any).path || 'AI-Gist-Backup' : 'AI-Gist-Backup',
    };
    showConfigModal.value = true;
};

const saveConfig = async () => {
    loading.value.saveConfig = true;
    try {
        // 前端验证
        if (configForm.value.type === 'icloud' && (!configForm.value.path || configForm.value.path.trim() === '')) {
            message.error('iCloud 路径不能为空');
            return;
        }

        // 检查 iCloud 可用性
        if (configForm.value.type === 'icloud' && iCloudAvailability.value && !iCloudAvailability.value.available) {
            message.error(`无法保存 iCloud 配置：${iCloudAvailability.value.reason}`);
            return;
        }

        // 自动生成配置名称
        if (!configForm.value.id) {
            configForm.value.name = getAutoGeneratedName();
        }

        const configData = {
            name: configForm.value.name,
            type: configForm.value.type,
            enabled: configForm.value.enabled,
            ...(configForm.value.type === 'webdav' ? {
                url: configForm.value.url,
                username: configForm.value.username,
                password: configForm.value.password,
            } : {
                path: configForm.value.path,
            })
        };

        let result;
        if (configForm.value.id) {
            result = await CloudBackupAPI.updateStorageConfig(configForm.value.id, configData);
        } else {
            result = await CloudBackupAPI.addStorageConfig(configData);
        }

        if (result.success) {
            message.success(configForm.value.id ? '配置更新成功' : '配置添加成功');
            showConfigModal.value = false;
            await loadStorageConfigs();
        } else {
            message.error(result.error || '操作失败');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        message.error('保存配置失败');
    } finally {
        loading.value.saveConfig = false;
    }
};

const deleteConfig = async (id: string) => {
    try {
        const result = await CloudBackupAPI.deleteStorageConfig(id);
        if (result.success) {
            message.success('配置删除成功');
            await loadStorageConfigs();
            // 如果删除的是当前选中的标签页，切换到第一个
            if (activeTabKey.value === id && storageConfigs.value.length > 0) {
                activeTabKey.value = storageConfigs.value[0].id;
            }
        } else {
            message.error(result.error || '删除失败');
        }
    } catch (error) {
        console.error('删除配置失败:', error);
        message.error('删除配置失败');
    }
};

const testConnection = async (config: CloudStorageConfig) => {
    try {
        // 前端验证
        if (config.type === 'icloud' && (!(config as any).path || (config as any).path.trim() === '')) {
            message.error('iCloud 路径不能为空');
            return;
        }

        // 检查 iCloud 可用性
        if (config.type === 'icloud' && iCloudAvailability.value && !iCloudAvailability.value.available) {
            message.error(`无法测试 iCloud 连接：${iCloudAvailability.value.reason}`);
            return;
        }

        // 创建一个干净的配置对象，只包含必要的属性，避免序列化问题
        const cleanConfig: CloudStorageConfig = {
            id: config.id,
            name: config.name,
            type: config.type,
            enabled: config.enabled,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
            ...(config.type === 'webdav' ? {
                url: (config as any).url,
                username: (config as any).username,
                password: (config as any).password,
            } : {
                path: (config as any).path,
            })
        };

        const result = await CloudBackupAPI.testStorageConnection(cleanConfig);
        if (result.success) {
            message.success('连接测试成功');
        } else {
            message.error(result.error || '连接测试失败');
        }
    } catch (error) {
        console.error('连接测试失败:', error);
        message.error('连接测试失败');
    }
};

const refreshCloudBackupList = async (storageId?: string) => {
    const targetStorageId = storageId || activeTabKey.value;
    if (!targetStorageId) return;

    // 避免重复加载
    if (loading.value.refreshList) return;

    loading.value.refreshList = true;
    try {
        const backups = await CloudBackupAPI.getCloudBackupList(targetStorageId);
        // 更新对应存储的备份列表
        cloudBackups.value = cloudBackups.value.filter(backup => backup.storageId !== targetStorageId);
        cloudBackups.value.push(...backups);
    } catch (error) {
        console.error('刷新云端备份列表失败:', error);
        message.error('刷新云端备份列表失败');
    } finally {
        loading.value.refreshList = false;
    }
};

const createCloudBackup = async (storageId?: string) => {
    const targetStorageId = storageId || activeTabKey.value;
    if (!targetStorageId) return;

    loading.value.createBackup = true;
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const result = await CloudBackupAPI.createCloudBackup(targetStorageId, `云端备份 - ${timestamp}`);

        if (result.success) {
            message.success(result.message);
            // 创建成功后刷新对应存储的备份列表
            await refreshCloudBackupList(targetStorageId);
        } else {
            message.error(result.error || '创建云端备份失败');
        }
    } catch (error) {
        console.error('创建云端备份失败:', error);
        message.error('创建云端备份失败');
    } finally {
        loading.value.createBackup = false;
    }
};

const restoreCloudBackup = async (storageId: string, backupId: string) => {
    loading.value.restoreBackup = true;
    try {
        const result = await CloudBackupAPI.restoreCloudBackup(storageId, backupId);

        if (result.success) {
            message.success(result.message);
            // 恢复成功后刷新页面或通知父组件
            window.location.reload();
        } else {
            message.error(result.error || '恢复云端备份失败');
        }
    } catch (error) {
        console.error('恢复云端备份失败:', error);
        message.error('恢复云端备份失败');
    } finally {
        loading.value.restoreBackup = false;
    }
};

const deleteCloudBackup = async (storageId: string, backupId: string) => {
    try {
        const result = await CloudBackupAPI.deleteCloudBackup(storageId, backupId);

        if (result.success) {
            message.success(result.message || '云端备份删除成功');
            await refreshCloudBackupList(storageId);
        } else {
            message.error(result.error || '删除云端备份失败');
        }
    } catch (error) {
        console.error('删除云端备份失败:', error);
        message.error('删除云端备份失败');
    }
};

const getConfigDescription = (config: CloudStorageConfig) => {
    if (config.type === 'webdav') {
        return `${(config as any).url}`;
    } else {
        const path = (config as any).path || 'AI-Gist-Backup';
        return `iCloud Drive - ${path}`;
    }
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
};

const formatSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

// 监听存储类型变化
const handleTypeChange = () => {
    if (configForm.value.type === 'icloud' && (!configForm.value.path || configForm.value.path.trim() === '')) {
        configForm.value.path = 'AI-Gist-Backup';
    }
    // 自动更新配置名称（仅在新建时）
    if (!configForm.value.id) {
        configForm.value.name = getAutoGeneratedName();
    }
};

// 监听标签页切换
watch(activeTabKey, async (newTabKey) => {
    if (newTabKey) {
        // 检查是否已经有该存储的备份数据，如果没有则加载
        const existingBackups = getPaginatedBackups(newTabKey);
        if (existingBackups.length === 0) {
            await refreshCloudBackupList(newTabKey);
        }
    }
});

// 生命周期
onMounted(async () => {
    await Promise.all([
        loadStorageConfigs(),
        checkICloudAvailability()
    ]);
});
</script>

<style scoped>
.pagination-container {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
}
</style>