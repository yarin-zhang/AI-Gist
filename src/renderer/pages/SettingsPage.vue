<template>
    <div class="settings-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px">应用设置</NText>
                    <NText depth="3" style="display: block; margin-top: 4px">
                        个性化配置您的应用偏好
                    </NText>
                </div>
                <NFlex>
                    <NButton type="error" @click="resetSettings" :loading="loading.reset" secondary>
                        <template #icon>
                            <NIcon>
                                <Refresh />
                            </NIcon>
                        </template>
                        恢复默认设置
                    </NButton>
                </NFlex>
            </NFlex>

            <NFlex :size="24">
                <!-- 左侧菜单 -->
                <div style="width: 240px; flex-shrink: 0">
                    <NCard>
                        <template #header>
                            <NFlex align="center" :size="12">
                                <NIcon size="20" color="#409EFF">
                                    <Settings />
                                </NIcon>
                                <span>设置菜单</span>
                            </NFlex>
                        </template>

                        <NMenu v-model:value="activeSettingKey" :options="menuOptions" @update:value="handleMenuSelect"
                            accordion show-trigger />
                    </NCard>
                </div>

                <!-- 右侧设置内容 -->
                <div style="flex: 1; min-width: 0">
                    <NFlex vertical :size="24">
                        <!-- 页面标题 -->
                        <NCard>
                            <template #header>
                                <NFlex align="center" :size="12">
                                    <NIcon size="24" color="#409EFF">
                                        <component :is="currentSectionIcon" />
                                    </NIcon>
                                    <span>{{ currentSectionTitle }}</span>
                                </NFlex>
                            </template>

                            <NFlex vertical :size="16">
                                <NAlert :show-icon="false">
                                    {{ currentSectionDescription }}
                                </NAlert>
                            </NFlex>
                        </NCard>

                        <!-- 关闭行为设置 -->
                        <NCard v-show="activeSettingKey === 'close-behavior'">
                            <NFlex vertical :size="16">
                                <NFormItem label="关闭行为模式">
                                    <NRadioGroup v-model:value="settings.closeBehaviorMode"
                                        @update:value="updateSetting">
                                        <NFlex vertical :size="12">
                                            <NRadio value="ask">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>每次询问</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            弹出对话框让您选择
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="fixed">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>固定行为</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            直接执行指定动作
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>

                                <NFormItem v-if="settings.closeBehaviorMode === 'fixed'" label="关闭动作"
                                    style="margin-left: 24px">
                                    <NRadioGroup v-model:value="settings.closeAction" @update:value="updateSetting">
                                        <NFlex vertical :size="8">
                                            <NRadio value="quit">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>退出应用</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            完全退出程序
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="minimize">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>最小化到托盘</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            后台继续运行
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>

                                <NAlert v-if="settings.closeBehaviorMode === 'ask'" type="info" show-icon>
                                    <template #header>当前设置</template>
                                    关闭时弹出选择对话框
                                </NAlert>

                                <NAlert v-if="settings.closeBehaviorMode === 'fixed'" type="success" show-icon>
                                    <template #header>当前设置</template>
                                    关闭时直接{{ settings.closeAction === "quit" ? "退出应用" : "最小化到托盘" }}
                                </NAlert>
                            </NFlex>
                        </NCard>

                        <!-- 启动行为设置 -->
                        <NCard v-show="activeSettingKey === 'startup-behavior'">
                            <NFlex vertical :size="16">
                                <NFormItem label="启动模式">
                                    <NCheckbox v-model:checked="settings.startMinimized"
                                        @update:checked="updateSetting">
                                        <NFlex align="center" :size="8">
                                            <div>
                                                <div>启动时最小化到托盘</div>
                                                <NText depth="3" style="font-size: 12px">
                                                    启动时不显示主窗口
                                                </NText>
                                            </div>
                                        </NFlex>
                                    </NCheckbox>
                                </NFormItem>

                                <NDivider />

                                <NFormItem label="自启动设置">
                                    <NCheckbox v-model:checked="settings.autoLaunch" @update:checked="updateSetting">
                                        <NFlex align="center" :size="8">
                                            <div>
                                                <div>开机自动启动</div>
                                                <NText depth="3" style="font-size: 12px">
                                                    系统启动时自动运行
                                                </NText>
                                            </div>
                                        </NFlex>
                                    </NCheckbox>
                                </NFormItem>
                            </NFlex>
                        </NCard>                        <!-- 外观设置 -->
                        <NCard v-show="activeSettingKey === 'appearance'">
                            <NFlex vertical :size="16">
                                <NFormItem label="主题模式">
                                    <NRadioGroup v-model:value="settings.themeSource" @update:value="updateSetting">
                                        <NFlex vertical :size="8">
                                            <NRadio value="system">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>跟随系统</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            自动切换主题
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="light">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>浅色主题</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            始终使用浅色
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="dark">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>深色主题</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            始终使用深色
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>
                            </NFlex>
                        </NCard>

                        <!-- WebDAV 同步设置 -->
                        <NCard v-show="activeSettingKey === 'webdav-sync'">
                            <NFlex vertical :size="20">
                                <!-- 启用 WebDAV 同步 -->                                <NFormItem label="启用 WebDAV 同步">
                                    <NCheckbox v-model:checked="settings.webdav.enabled"
                                        @update:checked="updateNonWebDAVSetting">
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
                                <div v-if="settings.webdav.enabled">
                                    
                                    <NFlex vertical :size="16">                                        <NFormItem label="服务器地址">
                                            <NInput v-model:value="settings.webdav.serverUrl"
                                                @blur="saveWebDAVSettings"
                                                placeholder="https://example.com/webdav"
                                                type="url">
                                                <template #prefix>
                                                    <NIcon>
                                                        <Cloud />
                                                    </NIcon>
                                                </template>
                                            </NInput>
                                        </NFormItem>

                                        <NFlex :size="16">                                            <NFormItem label="用户名" style="flex: 1">
                                                <NInput v-model:value="settings.webdav.username"
                                                    @blur="saveWebDAVSettings"
                                                    placeholder="用户名" />
                                            </NFormItem>
                                            <NFormItem label="密码" style="flex: 1">
                                                <NInput v-model:value="settings.webdav.password"
                                                    @blur="saveWebDAVSettings"
                                                    type="password"
                                                    placeholder="密码"
                                                    @input="handlePasswordChange"
                                                    @focus="handlePasswordFocus" />
                                            </NFormItem>
                                        </NFlex>

                                        <NFlex :size="12">
                                            <NButton type="primary" @click="testWebDAVConnection"
                                                :loading="loading.webdavTest">
                                                <template #icon>
                                                    <NIcon>
                                                        <CloudStorm />
                                                    </NIcon>
                                                </template>
                                                测试连接
                                            </NButton>
                                            <NButton @click="syncNow" :loading="loading.sync">
                                                <template #icon>
                                                    <NIcon>
                                                        <BrandSoundcloud />
                                                    </NIcon>
                                                </template>
                                                立即同步
                                            </NButton>
                                        </NFlex>
                                    </NFlex>

                                    <NAlert v-if="settings.dataSync.lastSyncTime" type="info" show-icon>
                                        <template #header>上次同步时间</template>
                                        {{ formatSyncTime(settings.dataSync.lastSyncTime) }}
                                    </NAlert>
                                </div>

                                <!-- 自动同步设置 -->
                                <!-- <div v-if="settings.webdav.enabled">
                                    <NDivider>同步设置</NDivider>
                                    
                                    <NFlex vertical :size="16">                                        <NFormItem label="自动同步">
                                            <NCheckbox v-model:checked="settings.webdav.autoSync"
                                                @update:checked="saveWebDAVSettings">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>启用自动同步</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            定时自动同步数据
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NCheckbox>
                                        </NFormItem>

                                        <NFormItem v-if="settings.webdav.autoSync" label="同步间隔">
                                            <NInputNumber v-model:value="settings.webdav.syncInterval"
                                                @update:value="saveWebDAVSettings"
                                                :min="5"
                                                :max="1440"
                                                :step="5">
                                                <template #suffix>分钟</template>
                                            </NInputNumber>
                                        </NFormItem>

                                        <NFlex :size="12">
                                            <NButton @click="syncNow" :loading="loading.sync">
                                                <template #icon>
                                                    <NIcon>
                                                        <BrandSoundcloud />
                                                    </NIcon>
                                                </template>
                                                立即同步
                                            </NButton>
                                        </NFlex>

                                        <NAlert v-if="settings.dataSync.lastSyncTime" type="info" show-icon>
                                            <template #header>上次同步时间</template>
                                            {{ formatSyncTime(settings.dataSync.lastSyncTime) }}
                                        </NAlert>
                                    </NFlex>
                                </div> -->
                            </NFlex>
                        </NCard>

                        <!-- 数据管理设置 -->
                        <NCard v-show="activeSettingKey === 'data-management'">
                            <NFlex vertical :size="20">
                                <!-- 数据备份 -->
                                <!-- <div>
                                    <NText strong style="font-size: 16px; margin-bottom: 12px; display: block">
                                        数据备份
                                    </NText>
                                    <NFlex vertical :size="16">
                                        <NFormItem label="自动备份">
                                            <NCheckbox v-model:checked="settings.dataSync.autoBackup"
                                                @update:checked="updateSetting">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>启用自动备份</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            定期自动备份数据到本地
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NCheckbox>
                                        </NFormItem>

                                        <NFormItem v-if="settings.dataSync.autoBackup" label="备份间隔">
                                            <NInputNumber v-model:value="settings.dataSync.backupInterval"
                                                @update:value="updateSetting"
                                                :min="1"
                                                :max="168"
                                                :step="1">
                                                <template #suffix>小时</template>
                                            </NInputNumber>
                                        </NFormItem>

                                        <NFlex :size="12">
                                            <NButton type="primary" @click="createBackup">
                                                <template #icon>
                                                    <NIcon>
                                                        <Upload />
                                                    </NIcon>
                                                </template>
                                                创建备份
                                            </NButton>
                                            <NButton @click="restoreBackup">
                                                <template #icon>
                                                    <NIcon>
                                                        <Download />
                                                    </NIcon>
                                                </template>
                                                恢复备份
                                            </NButton>
                                        </NFlex>
                                    </NFlex>
                                </div> -->

                                <!-- <NDivider /> -->

                                <!-- 数据导入导出 -->
                                <div>
                                    <NFlex vertical :size="16">
                                        <NFlex vertical :size="12">
                                            <NText depth="2">导出数据</NText>
                                            <NFlex :size="12">
                                                <NButton @click="exportData('csv')" :loading="loading.export">
                                                    <template #icon>
                                                        <NIcon>
                                                            <FileExport />
                                                        </NIcon>
                                                    </template>
                                                    导出为 CSV
                                                </NButton>
                                                <NButton @click="exportData('json')" :loading="loading.export">
                                                    <template #icon>
                                                        <NIcon>
                                                            <FileExport />
                                                        </NIcon>
                                                    </template>
                                                    导出为 JSON
                                                </NButton>
                                            </NFlex>
                                        </NFlex>

                                        <NFlex vertical :size="12">
                                            <NText depth="2">导入数据</NText>
                                            <NFlex :size="12">
                                                <NButton @click="importData('csv')" :loading="loading.import">
                                                    <template #icon>
                                                        <NIcon>
                                                            <FileImport />
                                                        </NIcon>
                                                    </template>
                                                    导入 CSV
                                                </NButton>
                                                <NButton @click="importData('json')" :loading="loading.import">
                                                    <template #icon>
                                                        <NIcon>
                                                            <FileImport />
                                                        </NIcon>
                                                    </template>
                                                    导入 JSON
                                                </NButton>
                                            </NFlex>
                                        </NFlex>

                                        <NAlert type="warning" show-icon>
                                            <template #header>注意</template>
                                            导入数据将覆盖现有数据，请确保已备份重要数据
                                        </NAlert>
                                    </NFlex>
                                </div>

                                <NDivider />

                                <!-- 数据库维护 -->
                                <div>
                                    <NFlex vertical :size="16">
                                        <NFlex vertical :size="12">
                                            <NText depth="2">数据库维护</NText>
                                            <NText depth="3" style="font-size: 12px">
                                                当遇到同步错误或数据异常时，可尝试修复数据库
                                            </NText>
                                            <NFlex :size="12">
                                                <NButton type="primary" @click="checkDatabaseHealth" :loading="loading.healthCheck">
                                                    <template #icon>
                                                        <NIcon>
                                                            <AlertCircle />
                                                        </NIcon>
                                                    </template>
                                                    检查数据库状态
                                                </NButton>
                                                <NButton type="warning" @click="repairDatabase" :loading="loading.repair">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Database />
                                                        </NIcon>
                                                    </template>
                                                    修复数据库
                                                </NButton>
                                                <NButton type="error" @click="forceRebuildDatabase" :loading="loading.forceRebuild">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Refresh />
                                                        </NIcon>
                                                    </template>
                                                    重建数据库
                                                </NButton>
                                            </NFlex>
                                        </NFlex>

                                        <NAlert type="info" show-icon>
                                            <template #header>数据库修复说明</template>
                                            <div>
                                                <p>• <strong>检查状态</strong>：检查数据库是否存在问题</p>
                                                <p>• <strong>修复数据库</strong>：尝试修复缺失的数据表</p>
                                                <p>• <strong>重建数据库</strong>：删除并重新创建数据库（会丢失所有数据）</p>
                                            </div>
                                        </NAlert>

                                        <NAlert type="warning" show-icon>
                                            <template #header>重要提示</template>
                                            重建数据库会删除所有本地数据，请确保已备份重要数据或可以从WebDAV恢复
                                        </NAlert>
                                    </NFlex>
                                </div>
                            </NFlex>
                        </NCard><!-- 实验室 (仅开发环境) -->
                        <NCard v-show="activeSettingKey === 'laboratory' && isDevelopment">
                            <LaboratoryPanel />
                        </NCard>

                        <!-- 操作状态提示 -->
                        <NCard>
                            <NFlex justify="space-between" align="center">
                                <NFlex :size="12">
                                    <NText depth="3">设置会自动保存</NText>
                                    <NIcon v-if="!saving" color="#18a058">
                                        <Check />
                                    </NIcon>
                                    <NSpin v-else size="small" />
                                </NFlex>
                            </NFlex>
                        </NCard>
                    </NFlex>
                </div>
            </NFlex>
        </NFlex>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, h } from "vue";
import {
    NCard,
    NAlert,
    NFlex,
    NIcon,
    NFormItem,
    NRadioGroup,
    NRadio,
    NCheckbox,
    NButton,
    NText,
    NSpin,
    NMenu,
    NDivider,
    NInput,
    NInputNumber,
    useMessage,
} from "naive-ui";
import {
    Settings,
    Check,
    Refresh,
    Power,
    Minimize,
    EyeOff,
    Rocket,
    DeviceDesktop,
    Sun,
    Moon,
    Flask,
    Cloud,
    Database,
    Upload,
    Download,
    FileImport,
    FileExport,
    BrandSoundcloud,
    CloudStorm,
    AlertCircle,
} from "@vicons/tabler";
import LaboratoryPanel from "@/components/example/LaboratoryPanel.vue";
import { WebDAVAPI, DataManagementAPI } from "@/lib/api";
import { webdavPasswordManager } from "@/lib/utils/webdav-password-manager";

// 消息提示
const message = useMessage();

// 检测是否为开发环境
const isDevelopment = import.meta.env.DEV;
const currentMode = import.meta.env.MODE;

// 当前激活的设置项
const activeSettingKey = ref("appearance");

// 密码输入状态
const passwordState = reactive({
    isPlaceholder: false, // 是否显示占位符
    hasStoredPassword: false, // 是否有存储的密码
    isModified: false, // 密码是否被修改
});

// 状态管理
const saving = ref(false);
const loading = reactive({
    reset: false,
    webdavTest: false,
    sync: false,
    export: false,
    import: false,
    repair: false,
    healthCheck: false,
    forceRebuild: false,
});

// 设置数据
const settings = reactive({
    closeBehaviorMode: "ask" as "ask" | "fixed", // 新增：关闭行为模式
    closeAction: "quit" as "quit" | "minimize",
    startMinimized: false,
    autoLaunch: false,
    themeSource: "system" as "system" | "light" | "dark",
    // WebDAV 同步设置
    webdav: {
        enabled: false,
        serverUrl: "",
        username: "",
        password: "",
        autoSync: false,
        syncInterval: 30, // 分钟
    },
    // 数据同步设置
    dataSync: {
        lastSyncTime: null as string | null,
        autoBackup: true,
        backupInterval: 24, // 小时
    },
});

// 菜单选项
const menuOptions = computed(() => {
    const baseOptions = [
        {
            label: "外观设置",
            key: "appearance",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Sun) }),
        },
        {
            label: "启动行为设置",
            key: "startup-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Rocket) }),
        },
        {
            label: "关闭行为设置",
            key: "close-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Power) }),
        },
        {
            label: "WebDAV 同步",
            key: "webdav-sync",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Cloud) }),
        },
        {
            label: "数据管理",
            key: "data-management",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Database) }),
        },
    ];

    // 仅在开发环境中添加实验室菜单
    if (isDevelopment) {
        baseOptions.push({
            label: "实验室",
            key: "laboratory",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Flask) }),
        });
    }

    return baseOptions;
});

// 当前设置节的信息
const currentSectionInfo = computed(() => {
    const sections = {
        "close-behavior": {
            title: "关闭行为设置",
            icon: Power,
            description: "配置点击关闭按钮时的行为方式"
        },
        "startup-behavior": {
            title: "启动行为设置",
            icon: Rocket,
            description: "配置应用启动和自启动选项"
        },
        appearance: {
            title: "外观设置",
            icon: Sun,
            description: "配置应用的主题模式"
        },
        "webdav-sync": {
            title: "WebDAV 同步",
            icon: Cloud,
            description: "配置 WebDAV 服务器连接和数据同步设置"
        },
        "data-management": {
            title: "数据管理",
            icon: Database,
            description: "数据备份、恢复、导入导出功能"
        },
        laboratory: {
            title: "实验室",
            icon: Flask,
            description: "开发中的实验性功能和组件测试"
        },
    };
    return sections[activeSettingKey.value] || sections["appearance"];
});

const currentSectionTitle = computed(() => currentSectionInfo.value.title);
const currentSectionIcon = computed(() => currentSectionInfo.value.icon);
const currentSectionDescription = computed(
    () => currentSectionInfo.value.description
);

// 处理菜单选择
const handleMenuSelect = (key: string) => {
    activeSettingKey.value = key;
};

// 加载设置
const loadSettings = async () => {
    try {
        console.log('开始加载设置...');
        const prefs = await window.electronAPI.preferences.get();
        console.log('获取到的原始配置:', prefs);
        
        // 直接从 WebDAV API 获取配置
        try {
            const webdavConfig = await WebDAVAPI.getConfig();
            console.log('从 WebDAV API 获取的配置:', webdavConfig);
            
            settings.webdav = {
                enabled: webdavConfig.enabled || false,
                serverUrl: webdavConfig.serverUrl || "",
                username: webdavConfig.username || "",
                password: webdavConfig.password || "",
                autoSync: webdavConfig.autoSync || false,
                syncInterval: webdavConfig.syncInterval || 30,
            };
        } catch (error) {
            console.error('从 WebDAV API 获取配置失败，使用 preferences:', error);
            // 回退到使用 preferences
            const webdavConfig = prefs.webdav || {};
            console.log('WebDAV 配置:', webdavConfig);
            
            settings.webdav = {
                enabled: webdavConfig.enabled || false,
                serverUrl: webdavConfig.serverUrl || "",
                username: webdavConfig.username || "",
                password: webdavConfig.password || "",
                autoSync: webdavConfig.autoSync || false,
                syncInterval: webdavConfig.syncInterval || 30,
            };
        }
        
        console.log('最终设置的 WebDAV 配置:', settings.webdav);
        
        // 重置密码状态
        passwordState.isPlaceholder = false;
        passwordState.hasStoredPassword = !!settings.webdav.password;
        passwordState.isModified = false;
        
        // 确保数据同步配置结构完整  
        const dataSyncConfig = prefs.dataSync || {};
        settings.dataSync = {
            lastSyncTime: dataSyncConfig.lastSyncTime || null,
            autoBackup: dataSyncConfig.autoBackup !== undefined ? dataSyncConfig.autoBackup : true,
            backupInterval: dataSyncConfig.backupInterval || 24,
        };
        
        // 其他配置
        settings.closeBehaviorMode = prefs.closeBehaviorMode || "ask";
        settings.closeAction = prefs.closeAction || "quit";
        settings.startMinimized = prefs.startMinimized || false;
        settings.autoLaunch = prefs.autoLaunch || false;
        settings.themeSource = prefs.themeSource || "system";
        
        console.log("设置加载成功:", {
            ...settings,
            webdav: {
                ...settings.webdav,
                password: settings.webdav.password ? '[已设置]' : '[未设置]'
            }
        });
    } catch (error) {
        console.error("加载设置失败:", error);
        message.error("加载设置失败");
    }
};

// 更新设置
const updateSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 创建纯对象副本，避免传递 Vue 响应式对象
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
                webdav: settings.webdav,
                dataSync: settings.dataSync,
            })
        );        // 如果 WebDAV 配置包含密码，需要先加密（但不重复加密已加密的密码）
        if (settingsData.webdav && settingsData.webdav.password && typeof settingsData.webdav.password === 'string') {
            try {
                console.log('正在加密 WebDAV 密码...');
                const encryptResult = await WebDAVAPI.encryptPassword(settingsData.webdav.password);
                if (encryptResult.success && encryptResult.encryptedPassword) {
                    settingsData.webdav.password = encryptResult.encryptedPassword;
                    console.log('WebDAV 密码加密成功');
                } else {
                    console.error('WebDAV 密码加密失败:', encryptResult.error);
                    message.error('密码加密失败，请重试');
                    saving.value = false;
                    return;
                }
            } catch (error) {
                console.error('WebDAV 密码加密出错:', error);
                message.error('密码加密出错，请重试');
                saving.value = false;
                return;
            }
        }

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log("设置更新成功:", updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settings.themeSource) {
            await window.electronAPI.theme.setSource(settings.themeSource);
        }

        // 如果更新了 WebDAV 配置，同步到 WebDAV 服务
        if (settingsData.webdav) {
            try {
                await window.electronAPI.webdav.setConfig(settingsData.webdav);
                console.log("WebDAV 配置同步成功");
            } catch (error) {
                console.error("WebDAV 配置同步失败:", error);
            }
        }

        setTimeout(() => {
            saving.value = false;
        }, 500);
    } catch (error) {
        console.error("保存设置失败:", error);
        message.error("保存设置失败");
        saving.value = false;
    }
};

// 更新设置（智能版本，避免重复加密）
const updateSettingsSmart = async (fieldsToUpdate = null) => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 只更新指定字段，如果没有指定则更新所有字段
        let settingsData;
        if (fieldsToUpdate) {
            settingsData = {};
            for (const field of fieldsToUpdate) {
                if (field === 'webdav') {
                    settingsData.webdav = JSON.parse(JSON.stringify(settings.webdav));
                } else if (field === 'dataSync') {
                    settingsData.dataSync = JSON.parse(JSON.stringify(settings.dataSync));
                } else {
                    settingsData[field] = settings[field];
                }
            }
        } else {
            // 创建纯对象副本，避免传递 Vue 响应式对象
            settingsData = JSON.parse(
                JSON.stringify({
                    closeBehaviorMode: settings.closeBehaviorMode,
                    closeAction: settings.closeAction,
                    startMinimized: settings.startMinimized,
                    autoLaunch: settings.autoLaunch,
                    themeSource: settings.themeSource,
                    webdav: settings.webdav,
                    dataSync: settings.dataSync,
                })
            );
        }

        // 如果 WebDAV 配置包含密码，需要先加密（但不重复加密已加密的密码）
        if (settingsData.webdav && settingsData.webdav.password && typeof settingsData.webdav.password === 'string') {
            try {
                console.log('正在加密 WebDAV 密码...');
                const encryptResult = await WebDAVAPI.encryptPassword(settingsData.webdav.password);
                if (encryptResult.success && encryptResult.encryptedPassword) {
                    settingsData.webdav.password = encryptResult.encryptedPassword;
                    console.log('WebDAV 密码加密成功');
                } else {
                    console.error('WebDAV 密码加密失败:', encryptResult.error);
                    message.error('密码加密失败，请重试');
                    saving.value = false;
                    return;
                }
            } catch (error) {
                console.error('WebDAV 密码加密出错:', error);
                message.error('密码加密出错，请重试');
                saving.value = false;
                return;
            }
        }

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log("设置更新成功:", updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await window.electronAPI.theme.setSource(settingsData.themeSource);
        }

        // 如果更新了 WebDAV 配置，同步到 WebDAV 服务
        if (settingsData.webdav) {
            try {
                await window.electronAPI.webdav.setConfig(settingsData.webdav);
                console.log("WebDAV 配置同步成功");
            } catch (error) {
                console.error("WebDAV 配置同步失败:", error);
            }
        }

        setTimeout(() => {
            saving.value = false;
        }, 500);
    } catch (error) {
        console.error("保存设置失败:", error);
        message.error("保存设置失败");
        saving.value = false;
    }
};

// 更新非 WebDAV 设置
const updateNonWebDAVSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 只更新非敏感的设置
        const settingsData = {
            closeBehaviorMode: settings.closeBehaviorMode,
            closeAction: settings.closeAction,
            startMinimized: settings.startMinimized,
            autoLaunch: settings.autoLaunch,
            themeSource: settings.themeSource,
            dataSync: settings.dataSync,
            // WebDAV 配置中只包含非敏感字段
            webdav: {
                enabled: settings.webdav.enabled,
                autoSync: settings.webdav.autoSync,
                syncInterval: settings.webdav.syncInterval,
            }
        };

        await window.electronAPI.preferences.set(settingsData);
        console.log("基础设置更新成功");

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await window.electronAPI.theme.setSource(settingsData.themeSource);
        }

        setTimeout(() => {
            saving.value = false;
        }, 300);
    } catch (error) {
        console.error("保存设置失败:", error);
        saving.value = false;
    }
};

// 确保 WebDAV 配置已保存到后端
const ensureWebdavConfigSaved = async () => {
    try {
        // 检查是否需要保存配置
        if (!passwordState.isModified && passwordState.hasStoredPassword) {
            // 密码未修改且已存储，配置应该已经在后端
            console.log('WebDAV配置无需重新保存');
            return;
        }
        
        console.log('确保WebDAV配置已保存到后端...');
        
        // 准备配置数据，处理密码逻辑
        const configToSave = { ...settings.webdav };
        
        // 如果密码被修改了，或者是新密码，需要传递给后端加密
        if (passwordState.isModified && !passwordState.isPlaceholder) {
            // 密码已修改且不是占位符，保持原样传递给后端
            console.log('传递修改后的密码给后端');
        } else if (passwordState.isPlaceholder && passwordState.hasStoredPassword && !passwordState.isModified) {
            // 密码是占位符且未修改，传递空字符串让后端使用存储的密码
            configToSave.password = '';
            console.log('使用后端存储的密码');
        }
        
        // 保存配置
        await updateSettingsSmart(['webdav']);
        console.log('WebDAV配置已确保保存');
    } catch (error) {
        console.error('确保WebDAV配置保存失败:', error);
        throw new Error('配置保存失败，无法进行同步');
    }
};

// 测试 WebDAV 连接
const testWebDAVConnection = async () => {
    // 简单验证
    if (!settings.webdav.serverUrl || !settings.webdav.username || !settings.webdav.password) {
        message.error("请填写完整的服务器信息");
        return;
    }

    loading.webdavTest = true;
    try {
        const result = await WebDAVAPI.testConnection({
            serverUrl: settings.webdav.serverUrl,
            username: settings.webdav.username,
            password: settings.webdav.password
        });
        
        if (result.success) {
            message.success(`WebDAV 连接测试成功${result.serverInfo ? ` - ${result.serverInfo.name}` : ''}`);
        } else {
            message.error(result.message || "WebDAV 连接测试失败");
        }
    } catch (error) {
        console.error("WebDAV 连接测试失败:", error);
        message.error("WebDAV 连接测试失败");
    }
    loading.webdavTest = false;
};

// 立即同步
const syncNow = async () => {
    if (!settings.webdav.enabled) {
        message.error("请先启用 WebDAV 同步");
        return;
    }

    // 简单验证
    if (!settings.webdav.serverUrl || !settings.webdav.username || !settings.webdav.password) {
        message.error("WebDAV配置不完整，请检查服务器地址、用户名和密码");
        return;
    }

    loading.sync = true;
    try {
        // 使用安全同步方法，包含数据库健康检查
        const result = await WebDAVAPI.safeSyncNow();
        
        if (result.success) {
            settings.dataSync.lastSyncTime = result.timestamp;
            
            // 只更新 dataSync 配置，避免重复加密 WebDAV 密码
            await updateSettingsSmart(['dataSync']);
            
            // 优先显示后端返回的消息，如果没有则显示默认消息
            let successMessage = result.message || "数据同步成功";
            
            // 如果有冲突信息，简洁地显示
            if (result.conflictsDetected > 0) {
                if (result.conflictsResolved > 0) {
                    successMessage += ` (检测到 ${result.conflictsDetected} 个冲突，已解决 ${result.conflictsResolved} 个)`;
                } else {
                    successMessage += ` (检测到 ${result.conflictsDetected} 个冲突)`;
                }
                
                // 在控制台显示详细的冲突信息，前端只显示简洁消息
                if (result.conflictDetails && result.conflictDetails.length > 0) {
                    console.log('同步冲突详情:', result.conflictDetails);
                }
            }
            
            message.success(successMessage);
        } else {
            message.error(result.message || "数据同步失败");
        }
    } catch (error) {
        console.error("数据同步失败:", error);
        message.error("数据同步失败");
    }
    loading.sync = false;
};

// 创建备份
const createBackup = async () => {
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const backup = await DataManagementAPI.createBackup(`手动备份 - ${timestamp}`);
        message.success(`备份创建成功: ${backup.name} (大小: ${(backup.size / 1024).toFixed(2)} KB)`);
    } catch (error) {
        console.error("创建备份失败:", error);
        message.error("创建备份失败");
    }
};

// 恢复备份
const restoreBackup = async () => {
    try {
        const backups = await DataManagementAPI.getBackupList();
        if (backups.length === 0) {
            message.warning("没有可用的备份文件");
            return;
        }
        
        // 显示备份选择提示
        message.info(`找到 ${backups.length} 个备份文件，将恢复最新的备份: ${backups[0].name}`);
        
        // 使用最新的备份
        const latestBackup = backups[0];
        const result = await DataManagementAPI.restoreBackup(latestBackup.id);
        
        // 显示恢复结果
        if (result.success) {
            const successMessage = result.message || `备份恢复成功: ${latestBackup.name}`;
            message.success(successMessage);
        } else {
            message.error(result.message || "备份恢复失败");
        }
    } catch (error) {
        console.error("恢复备份失败:", error);
        message.error("恢复备份失败");
    }
};

// 导出数据
const exportData = async (format: 'json' | 'csv') => {
    loading.export = true;
    try {
        const defaultName = `ai-gist-data-${new Date().toISOString().split('T')[0]}.${format}`;
        const exportPath = await DataManagementAPI.selectExportPath(defaultName);
        
        if (exportPath) {
            const result = await DataManagementAPI.exportData({
                format,
                includeCategories: true,
                includePrompts: true,
                includeSettings: true,
                includeHistory: true,
            }, exportPath);
              if (result.success) {
                // 优先显示后端返回的消息，如果没有则显示默认成功消息
                const successMessage = result.message || `数据已导出为 ${format.toUpperCase()} 格式`;
                message.success(successMessage);
            } else {
                message.error(result.message || '导出失败');
            }
        }
    } catch (error) {
        console.error("导出数据失败:", error);
        message.error("导出数据失败");
    }
    loading.export = false;
};

// 导入数据
const importData = async (format: 'json' | 'csv') => {
    loading.import = true;
    try {
        const filePath = await DataManagementAPI.selectImportFile(format);
        
        if (filePath) {
            const result = await DataManagementAPI.importData(filePath, {
                format,
                overwrite: false,
                mergeStrategy: 'merge',
            });
              if (result.success) {
                // 优先显示后端返回的消息，如果没有则显示默认成功消息
                const successMessage = result.message || `${format.toUpperCase()} 数据导入成功`;
                message.success(successMessage);
                
                if (result.errors.length > 0) {
                    console.warn("导入过程中的警告:", result.errors);
                }
            } else {
                message.error(result.message || "数据导入失败");
            }
        }
    } catch (error) {
        console.error("导入数据失败:", error);
        message.error("导入数据失败");
    }
    loading.import = false;
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

// 重置设置
const resetSettings = async () => {
    loading.reset = true;
    try {
        const defaultPrefs = await window.electronAPI.preferences.reset();
        Object.assign(settings, defaultPrefs);

        // 重置主题
        await window.electronAPI.theme.setSource(settings.themeSource);

        message.success("设置已恢复为默认值");
        console.log("设置已重置:", defaultPrefs);
    } catch (error) {
        console.error("重置设置失败:", error);
        message.error("重置设置失败");
    }
    loading.reset = false;
};

// 保存 WebDAV 设置（专门处理密码加密）
const saveWebDAVSettings = async () => {
    if (saving.value) return;
    
    saving.value = true;
    try {
        console.log('保存 WebDAV 设置...');
        
        // 创建纯对象副本，避免Vue响应式对象问题
        const cleanConfig = JSON.parse(JSON.stringify({
            enabled: settings.webdav.enabled,
            serverUrl: settings.webdav.serverUrl,
            username: settings.webdav.username,
            password: settings.webdav.password,
            autoSync: settings.webdav.autoSync,
            syncInterval: settings.webdav.syncInterval
        }));
        
        // 直接保存配置
        await WebDAVAPI.setConfig(cleanConfig);
        
        // 重置状态
        passwordState.isModified = false;
        passwordState.hasStoredPassword = !!settings.webdav.password;
        
        console.log('WebDAV 设置保存成功');
        message.success('WebDAV 设置保存成功');
    } catch (error) {
        console.error('保存 WebDAV 设置失败:', error);
        message.error('保存 WebDAV 设置失败');
    }
    saving.value = false;
};

// 数据库修复
const repairDatabase = async () => {
    loading.repair = true;
    try {
        const { databaseServiceManager } = await import("@/lib/services");
        const result = await databaseServiceManager.checkAndRepairDatabase();
        
        if (result.healthy) {
            if (result.repaired) {
                message.success(`数据库修复成功：${result.message}`);
            } else {
                message.success("数据库状态正常，无需修复");
            }
        } else {
            message.error(`数据库修复失败：${result.message}`);
            if (result.missingStores && result.missingStores.length > 0) {
                console.error('仍缺失的对象存储:', result.missingStores);
            }
        }
    } catch (error) {
        console.error("数据库修复失败:", error);
        message.error("数据库修复失败");
    }
    loading.repair = false;
};

// 强制重建数据库
const forceRebuildDatabase = async () => {
    loading.forceRebuild = true;
    try {
        const { databaseServiceManager } = await import("@/lib/services");
        const result = await databaseServiceManager.forceRebuildDatabase();
        
        if (result.success) {
            message.success(`数据库重建成功：${result.message}`);
            console.log('数据库重建成功，应用将正常工作');
        } else {
            message.error(`数据库重建失败：${result.message}`);
        }
    } catch (error) {
        console.error("数据库重建失败:", error);
        message.error("数据库重建失败");
    }
    loading.forceRebuild = false;
};

// 检查数据库健康状态
const checkDatabaseHealth = async () => {
    loading.healthCheck = true;
    try {
        const { databaseServiceManager } = await import("@/lib/services");
        const result = await databaseServiceManager.getHealthStatus();
        
        if (result.healthy) {
            message.success("数据库状态正常");
        } else {
            message.warning(`数据库存在异常，缺失的对象存储: ${result.missingStores.join(', ')}`);
            console.warn('数据库健康检查结果:', result);
        }
    } catch (error) {
        console.error("数据库健康检查失败:", error);
        message.error("数据库健康检查失败");
    }
    loading.healthCheck = false;
};

// 监听密码输入变化
const handlePasswordChange = () => {
    passwordState.isModified = true;
};

// 密码输入框的焦点事件
const handlePasswordFocus = () => {
    // 简化逻辑，不做特殊处理
};

// 组件挂载时加载设置
onMounted(async () => {
    await loadSettings();
    
    // 同步 WebDAV 配置到服务端（但不包含密码相关的敏感信息）
    try {
        if (settings.webdav.enabled) {
            // 只同步非敏感配置
            const safeConfig = {
                enabled: settings.webdav.enabled,
                serverUrl: settings.webdav.serverUrl,
                username: settings.webdav.username,
                autoSync: settings.webdav.autoSync,
                syncInterval: settings.webdav.syncInterval,
                // 不包含password字段
            };
            
            await window.electronAPI.webdav.setConfig(safeConfig);
            console.log("WebDAV 基础配置已同步到服务端");
        }
    } catch (error) {
        console.error("同步 WebDAV 配置失败:", error);
    }
});
</script>

<style scoped>
.settings-page {
    padding: 24px;
    overflow-y: auto;
}

.n-form-item {
    margin-bottom: 0;
}
</style>
