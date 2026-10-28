<template>
    <div class="proxy-settings">
        <UiPanel :title="t('networkProxy.proxyMode')">
            <div class="proxy-settings__mode">
                <UiChoiceCards :model-value="proxyConfig.mode" :options="modeOptions" :columns="3"
                    :label="t('networkProxy.proxyMode')" @update:model-value="handleModeChange" />
                <NForm v-if="proxyConfig.mode === 'manual'" ref="formRef" :model="proxyConfig.manualConfig" :rules="formRules"
                    label-placement="top" class="proxy-settings__form">
                    <NFormItem :label="t('networkProxy.httpProxy')" path="httpProxy">
                        <NInput v-model:value="proxyConfig.manualConfig.httpProxy" class="proxy-settings__mono" placeholder="127.0.0.1:7890" />
                    </NFormItem>
                    <NFormItem :label="t('networkProxy.httpsProxy')" path="httpsProxy">
                        <NInput v-model:value="proxyConfig.manualConfig.httpsProxy" class="proxy-settings__mono" placeholder="127.0.0.1:7890" />
                    </NFormItem>
                    <NFormItem :label="t('networkProxy.noProxy')" path="noProxy" class="proxy-settings__wide">
                        <div class="proxy-settings__field">
                            <NInput v-model:value="proxyConfig.manualConfig.noProxy" class="proxy-settings__mono" placeholder="localhost,127.0.0.1" />
                            <span class="ui-help">{{ t('networkProxy.noProxyDesc') }}</span>
                        </div>
                    </NFormItem>
                </NForm>
            </div>
        </UiPanel>

        <UiPanel :title="t('networkProxy.testConnection')" :description="t('networkProxy.testConnectionDesc')">
            <template #actions>
                <NButton size="tiny" :loading="loading.test" :disabled="isTesting" @click="testConnection">
                    {{ t('networkProxy.testConnection') }}
                </NButton>
            </template>
            <div class="proxy-settings__results">
                <UiAlert v-if="isTesting">{{ t('networkProxy.testingDescription') }}</UiAlert>
                <UiAlert v-else-if="testResult" :tone="testResult.overall.success ? 'success' : 'error'">
                    {{ testResult.overall.success
                        ? (averageResponseTime ? t('networkProxy.connectionOkWithTime', { ms: averageResponseTime }) : t('networkProxy.connectionSuccess'))
                        : t('networkProxy.connectionFailed') }}
                </UiAlert>
                <p v-else class="ui-help">{{ t('networkProxy.notTestedYet') }}</p>
                <ul v-if="testResults.length" class="proxy-sites">
                    <li v-for="result in testResults" :key="result.name" class="proxy-site">
                        <span class="ui-dot" :class="result.success ? 'ui-dot--success' : result.error ? 'ui-dot--error' : 'ui-dot--warning'" />
                        <span class="proxy-site__text">
                            <span class="proxy-site__name">{{ result.name }}</span>
                            <span class="proxy-site__url">{{ result.description }} · {{ result.url }}</span>
                        </span>
                        <span v-if="result.success && result.responseTime" class="proxy-site__meta">{{ result.responseTime }} ms</span>
                        <span v-else-if="result.error" class="proxy-site__meta proxy-site__meta--error">{{ result.error }}</span>
                        <span v-else-if="isTesting" class="proxy-site__meta">{{ t('networkProxy.testing') }}</span>
                    </li>
                </ul>
            </div>
        </UiPanel>

        <UiPanel v-if="proxyConfig.mode === 'system'" :title="t('networkProxy.systemProxyInfo')" body="rows">
            <template #actions>
                <NButton quaternary size="tiny" :loading="loading.refresh" @click="refreshSystemProxyInfo">{{ t('common.refresh') }}</NButton>
            </template>
            <UiSettingRow :title="t('networkProxy.currentProxy')">
                <span class="ui-tag" :class="systemProxyInfo.hasProxy ? 'ui-tag--success' : 'ui-tag--warning'">
                    {{ systemProxyInfo.hasProxy ? t('networkProxy.proxyDetected') : t('networkProxy.noProxyDetected') }}
                </span>
            </UiSettingRow>
            <UiSettingRow v-if="systemProxyInfo.proxyAddress" :title="t('networkProxy.proxyAddress')">
                <span class="ui-mono proxy-settings__value">{{ systemProxyInfo.proxyAddress }}</span>
            </UiSettingRow>
            <UiSettingRow v-if="systemProxyInfo.lastRefreshTime" :title="t('networkProxy.lastRefresh')">
                <span class="proxy-settings__value">{{ systemProxyInfo.lastRefreshTime }}</span>
            </UiSettingRow>
        </UiPanel>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NForm, NFormItem, NInput, type FormRules } from 'naive-ui';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiChoiceCards from '@/components/ui/UiChoiceCards.vue';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';

const { t } = useI18n();

// 定义网络代理配置接口
interface NetworkProxyConfig {
    mode: 'direct' | 'system' | 'manual';
    manualConfig: {
        httpProxy: string;
        httpsProxy: string;
        noProxy: string;
    };
}

// Props 定义
const props = withDefaults(defineProps<{
    modelValue?: NetworkProxyConfig;
}>(), {
    modelValue: () => ({
        mode: 'system',
        manualConfig: {
            httpProxy: '',
            httpsProxy: '',
            noProxy: ''
        }
    })
});

// Emits 定义
const emit = defineEmits<{
    "update:modelValue": [value: NetworkProxyConfig];
}>();

// 响应式数据
const proxyConfig = reactive<NetworkProxyConfig>({
    mode: props.modelValue?.mode || 'system',
    manualConfig: {
        httpProxy: props.modelValue?.manualConfig?.httpProxy || '',
        httpsProxy: props.modelValue?.manualConfig?.httpsProxy || '',
        noProxy: props.modelValue?.manualConfig?.noProxy || ''
    }
});

const systemProxyInfo = ref<{
    hasProxy: boolean;
    proxyConfig?: string;
    proxyAddress?: string;
    lastRefreshTime?: string;
}>({
    hasProxy: false
});
const testResult = ref<{
    overall: {
        success: boolean;
        totalSites: number;
        successSites: number;
        failedSites: number;
    };
} | null>(null);
const testResults = ref<Array<{
    name: string;
    url: string;
    description: string;
    success: boolean;
    responseTime?: number;
    error?: string;
}>>([]);
const isTesting = ref(false);
const loading = reactive({
    test: false,
    refresh: false
});

const modeOptions = computed(() => [
    { value: 'direct' as const, label: t('networkProxy.directMode'), description: t('networkProxy.directModeDesc') },
    { value: 'system' as const, label: t('networkProxy.systemMode'), description: t('networkProxy.systemModeDesc') },
    { value: 'manual' as const, label: t('networkProxy.manualMode'), description: t('networkProxy.manualModeDesc') },
]);

// 成功站点的平均响应时间，显示在测试结果里
const averageResponseTime = computed(() => {
    const times = testResults.value.filter(result => result.success && result.responseTime).map(result => result.responseTime!);
    return times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : 0;
});

// 表单规则
const formRules: FormRules = {
    httpProxy: [
        {
            pattern: /^(\d{1,3}\.){3}\d{1,3}:\d+$/,
            message: () => t('networkProxy.invalidAddress'),
            trigger: 'blur'
        }
    ],
    httpsProxy: [
        {
            pattern: /^(\d{1,3}\.){3}\d{1,3}:\d+$/,
            message: () => t('networkProxy.invalidAddress'),
            trigger: 'blur'
        }
    ]
};

// 表单引用
const formRef = ref();

// 清理函数
let cleanupProgressListener: (() => void) | null = null;

// 处理模式变化
const handleModeChange = (mode: 'direct' | 'system' | 'manual') => {
    proxyConfig.mode = mode;
    testResult.value = null;
    testResults.value = [];
    updateParentConfig();
};



// 更新父组件配置
const updateParentConfig = () => {
    const config = {
        mode: proxyConfig.mode,
        manualConfig: {
            httpProxy: proxyConfig.manualConfig.httpProxy,
            httpsProxy: proxyConfig.manualConfig.httpsProxy,
            noProxy: proxyConfig.manualConfig.noProxy
        }
    };
    console.log('NetworkProxySettings: updating parent config:', config);
    emit("update:modelValue", config);
};

// 监听 props 变化，同步到本地状态
watch(() => props.modelValue, (newValue) => {
    if (newValue) {
        console.log('NetworkProxySettings: props.modelValue changed:', newValue);
        proxyConfig.mode = newValue.mode || 'system';
        proxyConfig.manualConfig.httpProxy = newValue.manualConfig?.httpProxy || '';
        proxyConfig.manualConfig.httpsProxy = newValue.manualConfig?.httpsProxy || '';
        proxyConfig.manualConfig.noProxy = newValue.manualConfig?.noProxy || '';
    }
}, { deep: true, immediate: true });

// 监听手动配置变化
watch(() => proxyConfig.manualConfig, (newValue) => {
    console.log('NetworkProxySettings: manualConfig changed:', newValue);
    if (proxyConfig.mode === 'manual') {
        // 延迟一下确保值已经更新
        setTimeout(() => {
            updateParentConfig();
        }, 100);
    }
}, { deep: true });

// 测试连接
const testConnection = async () => {
    if (isTesting.value) return;
    
    loading.test = true;
    isTesting.value = true;
    testResult.value = null;
    testResults.value = [];
    
    try {
        console.log('开始测试连接，当前代理配置:', {
            mode: proxyConfig.mode,
            manualConfig: {
                httpProxy: proxyConfig.manualConfig.httpProxy,
                httpsProxy: proxyConfig.manualConfig.httpsProxy,
                noProxy: proxyConfig.manualConfig.noProxy
            }
        });
        
        // 设置进度监听器
        cleanupProgressListener = window.electronAPI.proxy.onTestProgress((result) => {
            // 查找是否已存在该网站的结果
            const existingIndex = testResults.value.findIndex(r => r.name === result.name);
            if (existingIndex >= 0) {
                // 更新现有结果
                testResults.value[existingIndex] = result;
            } else {
                // 添加新结果
                testResults.value.push(result);
            }
        });
        
        // 创建一个纯对象副本，避免序列化问题
        const proxyConfigCopy = {
            mode: proxyConfig.mode,
            ...(proxyConfig.mode === 'manual' ? {
                manualConfig: {
                    httpProxy: proxyConfig.manualConfig.httpProxy,
                    httpsProxy: proxyConfig.manualConfig.httpsProxy,
                    noProxy: proxyConfig.manualConfig.noProxy
                }
            } : {})
        };
        
        console.log('传递的代理配置:', JSON.stringify(proxyConfigCopy, null, 2));
        
        try {
            const result = await window.electronAPI.proxy.testConnectionRealTime(proxyConfigCopy);
            testResult.value = result;
            // 如果实时进度没有收集到所有结果，使用最终结果
            if (result.results && testResults.value.length < result.results.length) {
                testResults.value = result.results;
            }
        } catch (error) {
            console.error('测试连接调用失败:', error);
            throw error;
        }
        
        // 不再显示消息提示
    } catch (error) {
        console.error('测试连接失败:', error);
        // 不再显示错误消息
    } finally {
        loading.test = false;
        isTesting.value = false;
        
        // 清理监听器
        if (cleanupProgressListener) {
            cleanupProgressListener();
            cleanupProgressListener = null;
        }
    }
};

// 获取系统代理信息
const getSystemProxyInfo = async () => {
    try {
        const info = await window.electronAPI.proxy.getSystemProxyInfo();
        systemProxyInfo.value = info;
    } catch (error) {
        console.error('获取系统代理信息失败:', error);
    }
};

// 刷新系统代理信息
const refreshSystemProxyInfo = async () => {
    if (loading.refresh) return;
    
    loading.refresh = true;
    try {
        console.log('刷新系统代理信息...');
        const info = await window.electronAPI.proxy.refreshSystemProxyInfo();
        systemProxyInfo.value = info;
        console.log('系统代理信息已刷新:', info);
    } catch (error) {
        console.error('刷新系统代理信息失败:', error);
    } finally {
        loading.refresh = false;
    }
};

// 组件挂载时初始化
onMounted(async () => {
    await getSystemProxyInfo();
});

// 组件卸载时清理
onUnmounted(() => {
    if (cleanupProgressListener) {
        cleanupProgressListener();
    }
});
</script>

<style scoped>
.proxy-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.proxy-settings__mode {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.proxy-settings__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 12px;
}

.proxy-settings__wide {
    grid-column: 1 / -1;
}

.proxy-settings__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
}

.proxy-settings__mono :deep(input) {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
}

.proxy-settings__results {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.proxy-settings__value {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.proxy-sites {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
}

.proxy-site {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--border-subtle);
}

.proxy-site__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}

.proxy-site__name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.proxy-site__url {
    overflow: hidden;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.proxy-site__meta {
    flex: none;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.proxy-site__meta--error {
    max-width: 50%;
    color: var(--accent-error);
    overflow-wrap: anywhere;
}

@media (max-width: 640px) {
    .proxy-settings__form {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
