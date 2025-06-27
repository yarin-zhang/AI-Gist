<template>
    <NCard>
        <NFlex vertical :size="20">
            <!-- 存储配置管理 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">云端存储配置</NText>
                        <NText depth="3" style="font-size: 12px;">
                            配置 WebDAV 或 iCloud Drive 存储，用于云端备份功能
                        </NText>
                        
                        <NFlex :size="12">
                            <NButton type="primary" @click="showAddConfigModal">
                                <template #icon>
                                    <NIcon>
                                        <Plus />
                                    </NIcon>
                                </template>
                                添加存储配置
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <!-- 存储配置列表 -->
                    <div v-if="storageConfigs.length > 0">
                        <NFlex vertical :size="12">
                            <NText depth="2">已配置的存储</NText>
                            <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                <NGridItem v-for="config in storageConfigs" :key="config.id" span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                    <NCard size="small" :title="config.name">
                                        <NFlex vertical :size="8">
                                            <NFlex align="center" :size="8">
                                                <NTag :type="config.type === 'webdav' ? 'info' : 'success'" size="small">
                                                    {{ config.type === 'webdav' ? 'WebDAV' : 'iCloud Drive' }}
                                                </NTag>
                                                <NTag :type="config.enabled ? 'success' : 'warning'" size="small">
                                                    {{ config.enabled ? '已启用' : '已禁用' }}
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
                                                    测试连接
                                                </NButton>
                                                <NButton size="small" @click="editConfig(config)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Edit />
                                                        </NIcon>
                                                    </template>
                                                    编辑
                                                </NButton>
                                                <NPopconfirm @positive-click="deleteConfig(config.id)" negative-text="取消" positive-text="确定">
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

            <NDivider v-if="storageConfigs.length > 0"/>

            <!-- 云端备份管理 -->
            <div v-if="storageConfigs.length > 0">
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">云端备份管理</NText>
                        <NText depth="3" style="font-size: 12px;">
                            管理云端备份文件，支持创建、恢复和删除操作
                        </NText>
                        
                        <!-- 存储选择器 -->
                        <NCard size="small">
                            <NFlex vertical :size="12">
                                <NText depth="2" style="font-size: 14px;">选择存储位置：</NText>
                                <NSelect 
                                    v-model:value="selectedStorageId" 
                                    :options="storageOptions"
                                    placeholder="请选择存储位置"
                                    @update:value="onStorageChange"
                                />
                            </NFlex>
                        </NCard>

                        <!-- 云端备份操作 -->
                        <NFlex :size="12" v-if="selectedStorageId">
                            <NButton type="primary" @click="createCloudBackup" :loading="loading.createBackup">
                                <template #icon>
                                    <NIcon>
                                        <Upload />
                                    </NIcon>
                                </template>
                                创建云端备份
                            </NButton>
                            <NButton @click="refreshCloudBackupList" :loading="loading.refreshList">
                                <template #icon>
                                    <NIcon>
                                        <Refresh />
                                    </NIcon>
                                </template>
                                刷新备份列表
                            </NButton>
                        </NFlex>

                        <!-- 云端备份列表 -->
                        <div v-if="selectedStorageId && cloudBackups.length > 0">
                            <NFlex vertical :size="12">
                                <NText depth="2">云端备份列表</NText>
                                <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                    <NGridItem v-for="backup in cloudBackups" :key="backup.id" span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                        <NCard size="small" :title="backup.name">
                                            <NFlex vertical :size="4">
                                                <NFlex align="center" :size="8">
                                                    <NText strong>{{ backup.description || '云端备份' }}</NText>
                                                </NFlex>
                                                <NFlex align="center" :size="8">
                                                    <NTag type="info" size="small">{{ formatDate(backup.createdAt) }}</NTag>
                                                    <NTag type="success" size="small">{{ formatSize(backup.size) }}</NTag>
                                                </NFlex>
                                            </NFlex>
                                            
                                            <template #action>
                                                <NFlex justify="space-between" align="center" style="width: 100%;">
                                                    <NPopconfirm @positive-click="restoreCloudBackup(backup.id)"
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
                                                                恢复
                                                            </NButton>
                                                        </template>
                                                        <div style="max-width: 300px;">
                                                            <p>注意！恢复云端备份将会：</p>
                                                            <ul style="margin: 8px 0; padding-left: 20px;">
                                                                <li>自动备份当前数据</li>
                                                                <li>完全覆盖现有数据库</li>
                                                            </ul>
                                                        </div>
                                                    </NPopconfirm>
                                                    <NPopconfirm @positive-click="deleteCloudBackup(backup.id)" negative-text="取消"
                                                        positive-text="确定">
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
                                                        确定要删除这个云端备份吗？
                                                    </NPopconfirm>
                                                </NFlex>
                                            </template>
                                        </NCard>
                                    </NGridItem>
                                </NGrid>
                            </NFlex>
                        </div>

                        <div v-else-if="selectedStorageId">
                            <NText depth="3" style="font-size: 14px;">
                                暂无云端备份，请先创建备份
                            </NText>
                        </div>
                    </NFlex>
                </NFlex>
            </div>
        </NFlex>

        <!-- 添加/编辑配置模态框 -->
        <NModal v-model:show="showConfigModal" preset="card" style="width: 600px;" title="存储配置">
            <NFlex vertical :size="16">
                <NForm ref="formRef" :model="configForm" :rules="formRules">
                    <NFormItem label="配置名称" path="name">
                        <NInput v-model:value="configForm.name" placeholder="请输入配置名称" />
                    </NFormItem>
                    
                    <NFormItem label="存储类型" path="type">
                        <NRadioGroup v-model:value="configForm.type">
                            <NRadio value="webdav">WebDAV</NRadio>
                            <NRadio value="icloud">iCloud Drive</NRadio>
                        </NRadioGroup>
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
                        <NFormItem label="iCloud Drive 路径" path="path">
                            <NInput v-model:value="configForm.path" placeholder="AI-Gist-Backups" />
                            <NText depth="3" style="font-size: 12px;">
                                将在 iCloud Drive 中创建此文件夹用于存储备份
                            </NText>
                        </NFormItem>
                    </template>

                    <NFormItem label="启用状态" path="enabled">
                        <NSwitch v-model:value="configForm.enabled" />
                    </NFormItem>
                </NForm>

                <NFlex justify="end" :size="12">
                    <NButton @click="showConfigModal = false">取消</NButton>
                    <NButton type="primary" @click="saveConfig" :loading="loading.saveConfig">保存</NButton>
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
    NSelect,
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
import { ref, computed, onMounted } from "vue";
import { CloudBackupAPI } from "@/lib/api/cloud-backup.api";
import type { CloudStorageConfig, CloudBackupInfo } from "@shared/types/cloud-backup";

const message = useMessage();

// 响应式数据
const storageConfigs = ref<CloudStorageConfig[]>([]);
const cloudBackups = ref<CloudBackupInfo[]>([]);
const selectedStorageId = ref<string>('');
const showConfigModal = ref(false);
const loading = ref({
    saveConfig: false,
    createBackup: false,
    restoreBackup: false,
    refreshList: false,
});

// 表单数据
const configForm = ref({
    id: '',
    name: '',
    type: 'webdav' as 'webdav' | 'icloud',
    enabled: true,
    url: '',
    username: '',
    password: '',
    path: '',
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
        required: configForm.value.type === 'icloud',
        message: '请输入路径',
        trigger: 'blur'
    }
};

// 计算属性
const storageOptions = computed(() => {
    return storageConfigs.value.map(config => ({
        label: config.name,
        value: config.id,
        disabled: !config.enabled
    }));
});

// 方法
const loadStorageConfigs = async () => {
    try {
        storageConfigs.value = await CloudBackupAPI.getStorageConfigs();
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
        path: '',
    };
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
        path: config.type === 'webdav' ? (config as any).path : (config as any).path,
    };
    showConfigModal.value = true;
};

const saveConfig = async () => {
    loading.value.saveConfig = true;
    try {
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
            if (selectedStorageId.value === id) {
                selectedStorageId.value = '';
                cloudBackups.value = [];
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
        const result = await CloudBackupAPI.testStorageConnection(config);
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

const onStorageChange = async (storageId: string) => {
    selectedStorageId.value = storageId;
    if (storageId) {
        await refreshCloudBackupList();
    } else {
        cloudBackups.value = [];
    }
};

const refreshCloudBackupList = async () => {
    if (!selectedStorageId.value) return;
    
    loading.value.refreshList = true;
    try {
        cloudBackups.value = await CloudBackupAPI.getCloudBackupList(selectedStorageId.value);
    } catch (error) {
        console.error('刷新云端备份列表失败:', error);
        message.error('刷新云端备份列表失败');
    } finally {
        loading.value.refreshList = false;
    }
};

const createCloudBackup = async () => {
    if (!selectedStorageId.value) return;
    
    loading.value.createBackup = true;
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const result = await CloudBackupAPI.createCloudBackup(selectedStorageId.value, `云端备份 - ${timestamp}`);
        
        if (result.success) {
            message.success(result.message);
            await refreshCloudBackupList();
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

const restoreCloudBackup = async (backupId: string) => {
    if (!selectedStorageId.value) return;
    
    loading.value.restoreBackup = true;
    try {
        const result = await CloudBackupAPI.restoreCloudBackup(selectedStorageId.value, backupId);
        
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

const deleteCloudBackup = async (backupId: string) => {
    if (!selectedStorageId.value) return;
    
    try {
        const result = await CloudBackupAPI.deleteCloudBackup(selectedStorageId.value, backupId);
        
        if (result.success) {
            message.success(result.message || '云端备份删除成功');
            await refreshCloudBackupList();
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
        return `${(config as any).url}${(config as any).path ? ' - ' + (config as any).path : ''}`;
    } else {
        return `iCloud Drive${(config as any).path ? ' - ' + (config as any).path : ''}`;
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

// 生命周期
onMounted(async () => {
    await loadStorageConfigs();
});
</script> 