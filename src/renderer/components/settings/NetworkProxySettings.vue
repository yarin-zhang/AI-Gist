<template>
    <div class="network-proxy-settings">
        <NFlex vertical :size="24">
            <!-- 代理模式选择 -->
            <NCard>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('networkProxy.proxyMode') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('networkProxy.description') }}
                        </NText>
                    </NFlex>

                    <NRadioGroup v-model:value="proxyConfig.mode" @update:value="handleModeChange">
                        <NFlex vertical :size="12">
                            <NRadio value="direct">
                                <NFlex align="center" :size="8">
                                    <div>
                                        <div>{{ t('networkProxy.directMode') }}</div>
                                        <NText depth="3" style="font-size: 12px">
                                            {{ t('networkProxy.directModeDesc') }}
                                        </NText>
                                    </div>
                                </NFlex>
                            </NRadio>
                            <NRadio value="system">
                                <NFlex align="center" :size="8">
                                    <div>
                                        <div>{{ t('networkProxy.systemMode') }}</div>
                                        <NText depth="3" style="font-size: 12px">
                                            {{ t('networkProxy.systemModeDesc') }}
                                        </NText>
                                    </div>
                                </NFlex>
                            </NRadio>
                            <NRadio value="manual">
                                <NFlex align="center" :size="8">
                                    <div>
                                        <div>{{ t('networkProxy.manualMode') }}</div>
                                        <NText depth="3" style="font-size: 12px">
                                            {{ t('networkProxy.manualModeDesc') }}
                                        </NText>
                                    </div>
                                </NFlex>
                            </NRadio>
                        </NFlex>
                    </NRadioGroup>
                </NFlex>
            </NCard>

            <!-- 手动配置 -->
            <NCard v-if="proxyConfig.mode === 'manual'">
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('networkProxy.manualConfig') }}</NText>
                    </NFlex>

                    <NForm ref="formRef" :model="proxyConfig.manualConfig" :rules="formRules">
                        <NFormItem :label="t('networkProxy.httpProxy')" path="httpProxy">
                            <NInput 
                                v-model:value="proxyConfig.manualConfig.httpProxy" 
                                :placeholder="'127.0.0.1:7890'" />
                        </NFormItem>

                        <NFormItem :label="t('networkProxy.httpsProxy')" path="httpsProxy">
                            <NInput 
                                v-model:value="proxyConfig.manualConfig.httpsProxy" 
                                :placeholder="'127.0.0.1:7890'" />
                        </NFormItem>

                        <NFormItem :label="t('networkProxy.noProxy')" path="noProxy">
                            <NInput 
                                v-model:value="proxyConfig.manualConfig.noProxy" 
                                :placeholder="'localhost,127.0.0.1'" />
                            <NText depth="3" style="font-size: 12px; margin-top: 4px;">
                                {{ t('networkProxy.noProxyDesc') }}
                            </NText>
                        </NFormItem>
                    </NForm>
                </NFlex>
            </NCard>

            <!-- 系统代理信息 -->
            <NCard v-if="proxyConfig.mode === 'system'">
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NFlex align="center" justify="space-between">
                            <NText depth="2">{{ t('networkProxy.systemProxyInfo') }}</NText>
                            <NButton 
                                size="small" 
                                @click="refreshSystemProxyInfo" 
                                :loading="loading.refresh"
                                type="primary" 
                                ghost>
                                <template #icon>
                                    <NIcon>
                                        <Refresh />
                                    </NIcon>
                                </template>
                                刷新
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <NFlex vertical :size="8">
                        <NFlex align="center" :size="8">
                            <NText>{{ t('networkProxy.currentProxy') }}:</NText>
                            <NText v-if="systemProxyInfo.hasProxy" type="success">
                                {{ t('networkProxy.proxyDetected') }}
                            </NText>
                            <NText v-else type="warning">
                                {{ t('networkProxy.noProxyDetected') }}
                            </NText>
                        </NFlex>
                        
                        <NFlex v-if="systemProxyInfo.proxyAddress" align="center" :size="8">
                            <NText>{{ t('networkProxy.proxyAddress') }}:</NText>
                            <NText depth="3">{{ systemProxyInfo.proxyAddress }}</NText>
                        </NFlex>
                        
                        <NFlex v-if="systemProxyInfo.lastRefreshTime" align="center" :size="8">
                            <NText>{{ t('networkProxy.lastRefresh') }}:</NText>
                            <NText depth="3">{{ systemProxyInfo.lastRefreshTime }}</NText>
                        </NFlex>
                    </NFlex>
                </NFlex>
            </NCard>

            <!-- 连接测试 -->
            <NCard>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('networkProxy.testConnection') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('networkProxy.testConnectionDesc') }}
                        </NText>
                    </NFlex>

                    <NFlex :size="12">
                        <NButton 
                            @click="testConnection" 
                            :loading="loading.test"
                            :disabled="isTesting"
                            type="primary">
                            <template #icon>
                                <NIcon>
                                    <Wifi />
                                </NIcon>
                            </template>
                            {{ isTesting ? '测试中...' : t('networkProxy.testConnection') }}
                        </NButton>
                    </NFlex>

                    <!-- 测试进度 -->
                    <NAlert v-if="isTesting" type="info" show-icon>
                        <template #icon>
                            <NIcon>
                                <Wifi />
                            </NIcon>
                        </template>
                        <NFlex vertical :size="8">
                            <NText>正在测试网络连接...</NText>
                        </NFlex>
                    </NAlert>

                    <!-- 测试结果 -->
                    <NAlert v-if="testResult && !isTesting" :type="testResult.overall.success ? 'success' : 'error'" show-icon>
                        <template #icon>
                            <NIcon v-if="testResult.overall.success">
                                <Check />
                            </NIcon>
                            <NIcon v-else>
                                <AlertCircle />
                            </NIcon>
                        </template>
                        <NFlex vertical :size="8">
                            <NText>
                                {{ testResult.overall.success ? t('networkProxy.connectionSuccess') : t('networkProxy.connectionFailed') }}
                            </NText>
                        </NFlex>
                    </NAlert>

                    <!-- 详细测试结果 -->
                    <NFlex v-if="testResults.length > 0" vertical :size="12">
                        <NText depth="2" style="font-size: 14px;">{{ t('networkProxy.connectionTest') }}</NText>
                        <NFlex vertical :size="8">
                            <NFlex v-for="result in testResults" :key="result.name" 
                                align="center" justify="space-between" style="padding: 8px; border-radius: 4px; background: var(--n-color);">
                                <NFlex align="center" :size="8">
                                    <NIcon v-if="result.success" color="#18a058" size="16">
                                        <Check />
                                    </NIcon>
                                    <NIcon v-else color="#d03050" size="16">
                                        <AlertCircle />
                                    </NIcon>
                                    <NFlex vertical :size="4">
                                        <NText strong>{{ result.name }}</NText>
                                        <NText depth="3" style="font-size: 12px;">{{ result.description }} ({{ result.url }})</NText>
                                    </NFlex>
                                </NFlex>
                                <NFlex align="center" :size="8">
                                    <NText v-if="result.success && result.responseTime" depth="3" style="font-size: 12px;">
                                        {{ result.responseTime }}ms
                                    </NText>
                                    <NText v-if="!result.success && result.error" depth="3" style="font-size: 12px; color: #d03050;">
                                        {{ result.error }}
                                    </NText>
                                    <NText v-if="isTesting && !result.success && !result.error" depth="3" style="font-size: 12px; color: #f0a020;">
                                        测试中...
                                    </NText>
                                </NFlex>
                            </NFlex>
                        </NFlex>
                    </NFlex>
                </NFlex>
            </NCard>
        </NFlex>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    NCard,
    NFlex,
    NText,
    NRadioGroup,
    NRadio,
    NForm,
    NFormItem,
    NInput,
    NButton,
    NIcon,
    NAlert,
    FormRules
} from 'naive-ui';
import {
    Wifi,
    Check,
    AlertCircle,
    Refresh
} from '@vicons/tabler';

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

// 表单规则
const formRules: FormRules = {
    httpProxy: [
        {
            pattern: /^(\d{1,3}\.){3}\d{1,3}:\d+$/,
            message: '请输入正确的代理地址格式，如：127.0.0.1:7890',
            trigger: 'blur'
        }
    ],
    httpsProxy: [
        {
            pattern: /^(\d{1,3}\.){3}\d{1,3}:\d+$/,
            message: '请输入正确的代理地址格式，如：127.0.0.1:7890',
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
.network-proxy-settings {
    width: 100%;
}
</style>
