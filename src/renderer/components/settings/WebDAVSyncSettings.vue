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
                        <NButton @click="syncNow">
                            <template #icon>
                                <NIcon>
                                    <BrandSoundcloud />
                                </NIcon>
                            </template>
                            立即同步
                        </NButton>
                    </NFlex>

                    <NAlert v-if="props.modelValue.dataSync.lastSyncTime" type="info" show-icon>
                        <template #header>上次同步时间</template>
                        {{ formatSyncTime(props.modelValue.dataSync.lastSyncTime) }}
                    </NAlert>
                </NFlex>
            </div>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import {
    NCard,
    NFlex,
    NFormItem,
    NCheckbox,
    NInput,
    NButton,
    NText,
    NIcon,
    NAlert,
    useMessage,
} from "naive-ui";
import {
    Cloud,
    DeviceFloppy,
    CloudStorm,
    BrandSoundcloud,
} from "@vicons/tabler";

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

const handleEnabledChange = () => {
    emit("update:modelValue", props.modelValue);
};

const handleConfigChange = () => {
    emit("update:modelValue", props.modelValue);
};

const saveSettings = () => {
    emit("save-webdav");
};

const testConnection = () => {
    emit("test-connection");
};

const syncNow = () => {
    emit("sync-now");
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
</script>
