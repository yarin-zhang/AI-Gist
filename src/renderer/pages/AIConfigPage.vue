<template>
    <div class="ai-config-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px">{{ t('aiConfig.title') }}</NText>
                    <NText depth="3" style="display: block; margin-top: 4px">
                        {{ t('aiConfig.subtitle') }}
                    </NText>
                </div>
                <NFlex>
                    <NButton @click="showQuickOptimizationModal = true" style="margin-right: 8px;">
                        <template #icon>
                            <NIcon>
                                <Settings />
                            </NIcon>
                        </template>
                        {{ t('aiConfig.optimizePrompt') }}
                    </NButton>
                    <NButton type="primary" @click="showAddModal = true">
                        <template #icon>
                            <NIcon>
                                <Plus />
                            </NIcon>
                        </template>
                        {{ t('aiConfig.addConfig') }}
                    </NButton>
                </NFlex>
            </NFlex>

            <!-- 全局首选项状态显示 -->
            <NAlert v-if="preferredConfig" type="info" :show-icon="false" style="margin-top: 16px">
                <NFlex align="center" justify="space-between">
                    <NFlex align="center" style="gap: 8px">
                        <NIcon size="18">
                            <Settings />
                        </NIcon>
                        <NText>
                            {{ t('aiConfig.currentPreferredConfig') }}
                            <NText strong>{{ preferredConfig.name }}</NText>
                            <NTag size="small" :type="getConfigTagType(preferredConfig.type)" style="margin-left: 8px">
                                {{ getConfigTypeLabel(preferredConfig.type) }}
                            </NTag>
                        </NText>
                    </NFlex>
                    <NButton size="small" @click="clearPreferred">
                        {{ t('aiConfig.cancelPreferred') }}
                    </NButton>
                </NFlex>
            </NAlert>
            <NAlert v-else-if="configs.filter(c => c.enabled).length > 1" type="warning" :show-icon="false"
                style="margin-top: 16px">
                <NFlex align="center" style="gap: 8px">
                    <NIcon size="18">
                        <Settings />
                    </NIcon>
                    <NText>
                        {{ t('aiConfig.multipleConfigsWarning') }}
                    </NText>
                </NFlex>
            </NAlert>
            <!-- 配置卡片列表 -->
            <div class="config-list">
                <div v-if="configs.length === 0" style="text-align: center; padding: 40px">
                    <NEmpty :description="t('aiConfig.noConfigs')">
                        <template #extra>
                            <NButton type="primary" @click="showAddModal = true">
                                <template #icon>
                                    <NIcon>
                                        <Plus />
                                    </NIcon>
                                </template>
                                {{ t('aiConfig.addConfig') }}
                            </NButton>
                        </template>
                    </NEmpty>
                </div>
                <n-card v-for="config in configs" :key="config.id" class="config-card">
                    <template #header>
                        <div class="config-header">
                            <div class="config-info">
                                <NIcon size="24">
                                    <Server v-if="['openai', 'azure', 'deepseek', 'mistral'].includes(config.type)" />
                                    <Robot v-else />
                                </NIcon>
                                <h3>{{ config.name }}</h3>
                                <n-tag :type="getConfigTagType(config.type)">
                                    {{ getConfigTypeLabel(config.type) }}
                                </n-tag>
                                <n-tag :type="config.enabled ? 'success' : 'warning'">
                                    {{ config.enabled ? t('aiConfig.enabled') : t('aiConfig.disabled') }}
                                </n-tag>
                                <n-tag v-if="config.isPreferred" type="primary">
                                    <template #icon>
                                        <NIcon size="12">
                                            <Settings />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.globalPreferred') }}
                                </n-tag>
                            </div>
                            <div class="config-switch">
                                <n-space>
                                    <n-button size="small" @click="setPreferred(config)"
                                        :type="config.isPreferred ? 'primary' : 'default'" :disabled="!config.enabled">
                                        <template #icon>
                                            <NIcon>
                                                <Settings />
                                            </NIcon>
                                        </template>
                                        {{ config.isPreferred ? t('aiConfig.alreadyPreferred') : t('aiConfig.setAsPreferred') }}
                                    </n-button>
                                    <n-switch v-model:value="config.enabled"
                                        @update:value="(value) => toggleConfig(config.id!, value)" />
                                </n-space>
                            </div>
                        </div>
                    </template>

                    <div class="config-details">
                        <n-flex justify="space-between" >
                            <n-flex vertical>
                                <p><strong>{{ t('aiConfig.baseURL') }}:</strong> {{ config.baseURL }}</p>
                                <p v-if="config.defaultModel">
                                    <strong>{{ t('aiConfig.defaultModel') }}:</strong> {{ config.defaultModel }}
                                </p>
                                <p v-if="config.customModel">
                                    <strong>{{ t('aiConfig.customModel') }}:</strong> {{ config.customModel }}
                                </p>
                            </n-flex>
                            <n-flex vertical>
                                <p><strong>{{ t('aiConfig.createdAt') }}:</strong> {{ formatDate(config.createdAt) }}</p>
                                <!-- <p>
                                    <strong>{{ t('aiConfig.systemPrompt') }}:</strong>
                                    <NTag size="small" :type="config.systemPrompt ? 'success' : 'default'">
                                        {{ config.systemPrompt ? t('aiConfig.systemPromptCustomized') : t('aiConfig.systemPromptDefault') }}
                                    </NTag>
                                </p> -->
                                <!-- <p>
                                    <strong>{{ t('aiConfig.preferredStatus') }}:</strong>
                                    <NTag size="small" :type="config.isPreferred ? 'primary' : 'default'">
                                        {{ config.isPreferred ? t('aiConfig.globalPreferredStatus') : t('aiConfig.normalConfig') }}
                                    </NTag>
                                </p> -->
                            </n-flex>
                        </n-flex>
                    </div>

                    <template #action>
                        <NFlex justify="space-between" align="center">
                            <!-- 左侧：常用操作 -->
                            <NFlex align="center" size="small">
                                <n-button size="small" @click="editConfig(config)" type="info">
                                    <template #icon>
                                        <NIcon>
                                            <Settings />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.edit') }}
                                </n-button>
                                <n-button size="small" @click="editSystemPrompt(config)">
                                    <template #icon>
                                        <NIcon>
                                            <Edit />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.systemPrompt') }}
                                </n-button>
                            </NFlex>

                            <!-- 右侧：不常用操作 -->
                            <NFlex align="center" size="small">
                                <n-button size="small" @click="testConfig(config)"
                                    :loading="testingConfigs.has(config.id!)" type="info">
                                    <template #icon>
                                        <NIcon>
                                            <AccessPoint />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.connectionTest') }}
                                </n-button>
                                <n-button size="small" @click="intelligentTest(config)"
                                    :loading="intelligentTestingConfigs.has(config.id!)">
                                    <template #icon>
                                        <NIcon>
                                            <Robot />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.requestTest') }}
                                </n-button>
                                <n-button size="small" type="error" @click="deleteConfig(config.id!)">
                                    <template #icon>
                                        <NIcon>
                                            <DatabaseOff />
                                        </NIcon>
                                    </template>
                                    {{ t('aiConfig.delete') }}
                                </n-button>
                            </NFlex>
                        </NFlex>
                    </template>
                </n-card>
            </div>
        </NFlex>
        <!-- 添加/编辑配置弹窗 -->
        <CommonModal ref="modalRef" :show="showAddModal" @update:show="showAddModal = $event" @close="closeModal">
            <!-- 顶部固定区域 -->
            <template #header>
                <NFlex align="center" justify="space-between">
                    <NFlex align="center" style="gap: 12px">
                        <NIcon size="24">
                            <Settings />
                        </NIcon>
                        <div>
                            <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                                {{ editingConfig ? t('aiConfig.editConfig') : t('aiConfig.addConfig') }}
                            </NText>
                            <NText depth="3" style="font-size: 13px; display: block; margin-top: 2px">
                                {{
                                    editingConfig
                                        ? t('aiConfig.editConfigDesc')
                                        : t('aiConfig.addConfigDesc')
                                }}
                            </NText>
                        </div>
                    </NFlex>
                </NFlex>
            </template> <template #content="{ contentHeight }">
                <!-- 中间可操作区域 -->
                <NSplit direction="horizontal" :style="{ height: `${contentHeight}px` }" :default-size="0.6" :min="0.3"
                    :max="0.8" :disabled="modalWidth <= 800">
                    <!-- 左侧：基本配置 -->
                    <template #1>
                        <NCard :title="t('aiConfig.basicConfig')" size="small" :style="{ height: '100%' }">
                            <NScrollbar :style="{ height: `${contentHeight - 80}px` }">
                                <n-form ref="formRef" :model="formData" :rules="formRules" label-placement="top"
                                    require-mark-placement="right-hanging" style="padding-right: 12px;">
                                    <NFlex vertical size="large">
                                        <n-form-item :label="t('aiConfig.serviceType')" path="type">
                                            <n-select v-model:value="formData.type" :options="typeOptions"
                                                @update:value="onTypeChange" />
                                        </n-form-item>

                                        <n-form-item :label="t('aiConfig.configName')" path="name">
                                            <n-input v-model:value="formData.name" :placeholder="t('aiConfig.configNamePlaceholder')" />
                                        </n-form-item> <n-form-item :label="getBaseURLInfo.label" path="baseURL"
                                            v-if="needsBaseURL || formData.type === 'anthropic' || formData.type === 'google' || formData.type === 'cohere'">
                                            <n-input v-model:value="formData.baseURL"
                                                :placeholder="getBaseURLInfo.placeholder" />
                                        </n-form-item>

                                        <n-form-item :label="getApiKeyLabel" path="apiKey" v-if="needsApiKey">
                                            <n-input v-model:value="formData.apiKey" type="password"
                                                show-password-on="click"
                                                :placeholder="`${t('aiConfig.enter')} ${getApiKeyLabel.replace('：', '')}`" />
                                        </n-form-item>

                                        <!-- 连接测试区域 -->
                                        <n-form-item :label="t('aiConfig.connectionTest')">
                                            <NFlex vertical size="medium" style="width: 100%;"> <n-button
                                                    @click="testFormConnection" :loading="testingFormConnection"
                                                    :disabled="!canTestConnection" type="info" block>
                                                    <template #icon>
                                                        <NIcon>
                                                            <Server />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('aiConfig.testConnectionAndGetModels') }}
                                                </n-button>

                                                <!-- 测试结果显示 -->
                                                <n-alert v-if="formTestResult"
                                                    :type="formTestResult.success ? 'success' : 'error'"
                                                    :title="formTestResult.success ? t('aiConfig.testSuccess') : t('aiConfig.testFailed')">
                                                    {{
                                                        formTestResult.success
                                                            ? t('aiConfig.foundModels', { count: formTestResult.models?.length || 0 })
                                                            : formTestResult.error
                                                    }}
                                                </n-alert>
                                            </NFlex>
                                        </n-form-item>
                                    </NFlex>
                                </n-form>
                            </NScrollbar>
                        </NCard>
                    </template>

                    <!-- 右侧：模型配置 -->
                    <template #2>
                        <NCard :title="t('aiConfig.modelConfig')" size="small" :style="{ height: '100%' }">
                            <NScrollbar :style="{ height: `${contentHeight - 80}px` }">
                                <NFlex vertical size="large" style="padding-right: 12px;">
                                    <n-form-item :label="t('aiConfig.modelList')" path="models">
                                        <n-dynamic-tags v-model:value="formData.models" />
                                        <template #feedback>
                                            <NText depth="3" style="font-size: 12px;">
                                                {{ t('aiConfig.clickTestConnectionTip') }}
                                            </NText>
                                        </template>
                                    </n-form-item>

                                    <n-form-item :label="t('aiConfig.defaultModel')" path="defaultModel">
                                        <n-select v-model:value="formData.defaultModel" :options="modelOptions"
                                            :placeholder="t('aiConfig.selectDefaultModel')" filterable tag clearable />
                                    </n-form-item>

                                    <n-form-item :label="t('aiConfig.customModel')" path="customModel">
                                        <n-input v-model:value="formData.customModel" :placeholder="t('aiConfig.customModelPlaceholder')" />
                                        <template #feedback>
                                            <NText depth="3" style="font-size: 12px;">
                                                {{ t('aiConfig.customModelTip') }}
                                            </NText>
                                        </template>
                                    </n-form-item>

                                    <!-- 模型信息显示 -->
                                    <div v-if="formData.models.length > 0">
                                        <NText strong style="margin-bottom: 8px; display: block;">{{ t('aiConfig.availableModels') }}</NText>
                                        <NFlex wrap style="gap: 8px;">
                                            <NTag v-for="model in formData.models" :key="model" size="small"
                                                :type="model === formData.defaultModel ? 'primary' : 'default'">
                                                {{ model }}
                                                <template v-if="model === formData.defaultModel" #icon>
                                                    <NIcon size="12">
                                                        <Settings />
                                                    </NIcon>
                                                </template>
                                            </NTag>
                                        </NFlex>
                                    </div>
                                </NFlex>
                            </NScrollbar>
                        </NCard>
                    </template>
                </NSplit>
            </template>
            <!-- 底部固定区域 -->
            <template #footer>
                <NFlex justify="end">
                    <n-button @click="closeModal">{{ t('aiConfig.cancel') }}</n-button>
                    <n-button type="primary" @click="saveConfig" :loading="saving">
                        {{ editingConfig ? t('aiConfig.updateConfig') : t('aiConfig.addConfigButton') }}
                    </n-button>
                </NFlex>
            </template>
        </CommonModal>

        <!-- 智能测试结果弹窗 -->
        <n-modal v-model:show="showIntelligentTestResult" preset="dialog" style="width: 600px">
            <template #header>
                <NFlex align="center" style="gap: 8px">
                    <NIcon size="24">
                        <Robot />
                    </NIcon>
                    <NText strong>{{ t('aiConfig.intelligentTestResult') }}</NText>
                </NFlex>
            </template>

            <div v-if="intelligentTestResult">
                <n-alert v-if="intelligentTestResult.success" type="success" :title="t('aiConfig.testSuccessTitle')">
                    <div style="margin-top: 12px">
                        <div style="margin-bottom: 16px">
                            <strong>{{ t('aiConfig.inputPrompt') }}</strong>
                            <div style="
                  background: var(--code-color);
                  padding: 12px;
                  border-radius: 6px;
                  margin-top: 8px;
                  white-space: pre-wrap;
                  font-family: monospace;
                ">
                                {{ intelligentTestResult.inputPrompt }}
                            </div>
                        </div>
                        <div>
                            <strong>{{ t('aiConfig.aiResponse') }}</strong>
                            <div style="
                  background: var(--code-color);
                  padding: 12px;
                  border-radius: 6px;
                  margin-top: 8px;
                  white-space: pre-wrap;
                ">
                                {{ intelligentTestResult.response }}
                            </div>
                        </div>
                    </div>
                </n-alert>
                <n-alert v-else type="error" :title="t('aiConfig.testFailedTitle')">
                    <div v-if="intelligentTestResult.inputPrompt" style="margin-bottom: 12px">
                        <strong>{{ t('aiConfig.attemptedPrompt') }}</strong>
                        <div style="
                background: var(--code-color);
                padding: 12px;
                border-radius: 6px;
                margin-top: 8px;
                white-space: pre-wrap;
                font-family: monospace;
              ">
                            {{ intelligentTestResult.inputPrompt }}
                        </div>
                    </div>
                    <div>
                        <strong>{{ t('aiConfig.errorInfo') }}</strong> {{ intelligentTestResult.error }}
                    </div>
                </n-alert>
            </div>

            <template #action>
                <n-button @click="showIntelligentTestResult = false">{{ t('aiConfig.close') }}</n-button>
            </template>
        </n-modal>

        <!-- 系统提示词编辑弹窗 -->
        <CommonModal ref="systemPromptModalRef" :show="showSystemPromptModal"
            @update:show="showSystemPromptModal = $event" @close="closeSystemPromptModal">
            <!-- 顶部固定区域 -->
            <template #header>
                <NFlex align="center" justify="space-between">
                    <NFlex align="center" style="gap: 12px">
                        <NIcon size="24">
                            <Edit />
                        </NIcon>
                        <div>
                            <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                                {{ t('aiConfig.editGenerationPrompt') }}
                            </NText>
                            <NText depth="3" style="font-size: 13px; display: block; margin-top: 2px">
                                {{ t('aiConfig.customSystemPromptDesc') }}
                            </NText>
                        </div>
                    </NFlex>
                </NFlex>
            </template>

            <!-- 中间可操作区域 -->
            <template #content="{ contentHeight }">
                <NFlex vertical size="medium" :style="{ height: `${contentHeight}px` }">
                    <NAlert type="info" :show-icon="false">
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('aiConfig.systemPromptTip') }}
                        </NText>
                    </NAlert>

                    <NInput v-model:value="systemPromptContent" type="textarea" :placeholder="t('aiConfig.systemPromptPlaceholder')" :rows="15"
                        :style="{
                            height: `${contentHeight - 120}px`,
                            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace'
                        }" :autosize="false" show-count />
                </NFlex>
            </template>

            <!-- 底部固定区域 -->
            <template #footer>
                <NFlex justify="space-between">
                    <NButton @click="resetSystemPromptToDefault" secondary type="warning">
                        {{ t('aiConfig.resetToDefault') }}
                    </NButton>
                    <NFlex>
                        <NButton @click="closeSystemPromptModal">{{ t('aiConfig.cancel') }}</NButton>
                        <NButton type="primary" @click="saveSystemPrompt">
                            {{ t('aiConfig.save') }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </template>
        </CommonModal>

        <!-- 快速优化提示词配置管理模态窗 -->
        <QuickOptimizationConfigModal 
            :show="showQuickOptimizationModal" 
            @update:show="showQuickOptimizationModal = $event"
            @configs-updated="handleQuickOptimizationConfigsUpdated"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useI18n } from 'vue-i18n';
import {
    NButton,
    NCard,
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NTag,
    NModal,
    NSwitch,
    NDynamicTags,
    NIcon,
    NSpace,
    NDropdown,
    NScrollbar,
    NFlex,
    NText,
    NAlert,
    NEmpty,
    NSplit,
    useMessage,
} from "naive-ui";
import { Plus, Robot, DatabaseOff, Server, Settings, Edit, AccessPoint } from "@vicons/tabler";
import type { AIConfig } from "~/lib/db";
import { databaseService } from "~/lib/db";
import { useDatabase } from "~/composables/useDatabase";
import { useWindowSize } from "~/composables/useWindowSize";
import CommonModal from "~/components/common/CommonModal.vue";
import QuickOptimizationConfigModal from "~/components/ai/QuickOptimizationConfigModal.vue";

const { t } = useI18n();
const message = useMessage();
const { isDatabaseReady, safeDbOperation, waitForDatabase } = useDatabase();

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize();

// 数据状态
const configs = ref<AIConfig[]>([]);
const preferredConfig = ref<AIConfig | null>(null);
const showAddModal = ref(false);
const editingConfig = ref<AIConfig | null>(null);
const saving = ref(false);
const testingConfigs = ref(new Set<number>());
const intelligentTestingConfigs = ref(new Set<number>());
const testingFormConnection = ref(false);
const formTestResult = ref<{
    success: boolean;
    models?: string[];
    error?: string;
} | null>(null);
const showIntelligentTestResult = ref(false);
const intelligentTestResult = ref<{
    success: boolean;
    response?: string;
    error?: string;
    inputPrompt?: string;
} | null>(null);
const autoShowAddModal = ref(false);

// 系统提示词编辑相关状态
const showSystemPromptModal = ref(false);
const editingSystemPromptConfig = ref<AIConfig | null>(null);
const systemPromptContent = ref("");

// 快速优化配置相关状态
const showQuickOptimizationModal = ref(false);

// 表单数据
const formData = reactive({
    type: "openai" as "openai" | "ollama" | "anthropic" | "google" | "azure" | "lmstudio" | "deepseek" | "cohere" | "mistral",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [] as string[],
    defaultModel: "",
    customModel: "",
    systemPrompt: "",
});

// 表单校验规则
const formRules = computed(() => ({
    type: [{ required: true, message: t('aiConfig.pleaseSelectType'), trigger: "change" }],
    name: [{ required: true, message: t('aiConfig.pleaseEnterConfigName'), trigger: "blur" }],
    baseURL: [
        {
            required: needsBaseURL.value,
            message: t('aiConfig.pleaseEnterBaseURL'),
            trigger: "blur"
        }
    ],
    apiKey: [
        {
            required: needsApiKey.value,
            message: getApiKeyLabel.value.replace('：', ''),
            trigger: "blur"
        }
    ],
}));

// 计算属性：是否需要Base URL
const needsBaseURL = computed(() => {
    return !['anthropic', 'google', 'cohere'].includes(formData.type);
});

// 计算属性：是否需要API Key
const needsApiKey = computed(() => {
    return !['ollama', 'lmstudio'].includes(formData.type);
});

// 计算属性：API Key标签
const getApiKeyLabel = computed(() => {
    switch (formData.type) {
        case 'anthropic':
            return 'Anthropic API Key：';
        case 'google':
            return 'Google AI API Key：';
        case 'azure':
            return 'Azure OpenAI API Key：';
        case 'deepseek':
            return 'DeepSeek API Key：';
        case 'cohere':
            return 'Cohere API Key：';
        case 'mistral':
            return 'Mistral API Key：';
        case 'openai':
        default:
            return 'API Key：';
    }
});

// 计算属性：Base URL标签和placeholder
const getBaseURLInfo = computed(() => {
    switch (formData.type) {
        case 'ollama':
            return {
                label: t('aiConfig.ollamaServiceAddress'),
                placeholder: t('aiConfig.ollamaExample')
            };
        case 'lmstudio':
            return {
                label: t('aiConfig.lmstudioServiceAddress'),
                placeholder: t('aiConfig.lmstudioExample')
            };
        case 'azure':
            return {
                label: t('aiConfig.azureOpenAIEndpoint'),
                placeholder: t('aiConfig.azureExample')
            };
        case 'deepseek':
            return {
                label: t('aiConfig.deepseekAPIAddress'),
                placeholder: t('aiConfig.deepseekExample')
            };
        case 'mistral':
            return {
                label: t('aiConfig.mistralAPIAddress'),
                placeholder: t('aiConfig.mistralExample')
            };
        case 'anthropic':
            return {
                label: t('aiConfig.customEndpoint'),
                placeholder: t('aiConfig.useOfficialEndpoint')
            };
        case 'google':
            return {
                label: t('aiConfig.customEndpoint'),
                placeholder: t('aiConfig.useOfficialEndpoint')
            };
        case 'cohere':
            return {
                label: t('aiConfig.customEndpoint'),
                placeholder: t('aiConfig.useOfficialEndpoint')
            };
        case 'openai':
        default:
            return {
                label: t('aiConfig.baseURL') + '：',
                placeholder: t('aiConfig.openaiExample')
            };
    }
});

// 类型选项
const typeOptions = [
    {
        type: 'group',
        label: t('aiConfig.localServices'),
        key: 'local',
        children: [
            { label: "Ollama", value: "ollama" },
            { label: "LM Studio", value: "lmstudio" },
        ]
    },
    {
        type: 'group',
        label: t('aiConfig.onlineServices'),
        key: 'online',
        children: [
            { label: "OpenAI", value: "openai" },
            { label: "Anthropic Claude", value: "anthropic" },
            { label: "Google AI", value: "google" },
            { label: "Azure OpenAI", value: "azure" },
            { label: "DeepSeek", value: "deepseek" },
            { label: "Cohere", value: "cohere" },
            { label: "Mistral AI", value: "mistral" },
        ]
    }
];

// 表单引用
const formRef = ref();
const modalRef = ref<InstanceType<typeof CommonModal> | null>(null);

// 计算属性：模型选项
const modelOptions = computed(() => {
    return formData.models.map((model) => ({
        label: model,
        value: model,
    }));
});

// 计算属性：是否可以测试连接
const canTestConnection = computed(() => {
    // 如果需要API Key但没有提供，则不能测试
    if (needsApiKey.value && !formData.apiKey.trim()) {
        return false;
    }

    // 如果需要Base URL但没有提供，则不能测试
    if (needsBaseURL.value && !formData.baseURL.trim()) {
        return false;
    }

    return true;
});

// 加载配置列表
const loadConfigs = async () => {
    const result = await safeDbOperation(
        () => databaseService.aiConfig.getAllAIConfigs(),
        []
    );
    if (result) {
        configs.value = result;

        // 同时加载首选配置
        const preferred = await safeDbOperation(
            () => databaseService.aiConfig.getPreferredAIConfig(),
            null
        );
        preferredConfig.value = preferred || null;
    }
};

// 添加配置
const saveConfig = async () => {
    try {
        await formRef.value?.validate();
        saving.value = true;

        if (editingConfig.value) {
            // 更新配置
            const updateData = {
                type: formData.type,
                name: formData.name,
                baseURL: formData.baseURL,
                apiKey: formData.apiKey || undefined,
                models: [...formData.models], // 创建新数组确保可序列化
                defaultModel: formData.defaultModel || undefined,
                customModel: formData.customModel || undefined,
                systemPrompt: formData.systemPrompt || undefined,
                // 保持原有的首选项状态，除非配置被禁用
                isPreferred: editingConfig.value.isPreferred,
            };
            await databaseService.aiConfig.updateAIConfig(editingConfig.value.id!, updateData);
            message.success(t('aiConfig.configUpdateSuccess'));
        } else {
            // 添加新配置
            const configData = {
                configId: `config_${Date.now()}_${Math.random()
                    .toString(36)
                    .substr(2, 9)}`,
                type: formData.type,
                name: formData.name,
                baseURL: formData.baseURL,
                apiKey: formData.apiKey || undefined,
                models: [...formData.models], // 创建新数组确保可序列化
                defaultModel: formData.defaultModel || undefined,
                customModel: formData.customModel || undefined,
                systemPrompt: formData.systemPrompt || undefined,
                enabled: true,
            };
            await databaseService.aiConfig.createAIConfig(configData);
            message.success(t('aiConfig.configAddSuccess'));
        }

        closeModal();
        loadConfigs();
    } catch (error) {
        message.error(t('aiConfig.saveFailed') + (error as Error).message);
    } finally {
        saving.value = false;
    }
};

// 编辑配置
const editConfig = (config: AIConfig) => {
    editingConfig.value = config;
    formData.name = config.name;
    formData.type = config.type;
    formData.baseURL = config.baseURL;
    formData.apiKey = config.apiKey || "";
    formData.models = Array.isArray(config.models) ? config.models : [];
    formData.defaultModel = config.defaultModel || "";
    formData.customModel = config.customModel || "";
    formData.systemPrompt = config.systemPrompt || "";
    showAddModal.value = true;
};

// 删除配置
const deleteConfig = async (id: number) => {
    try {
        await databaseService.aiConfig.deleteAIConfig(id);
        message.success(t('aiConfig.configDeleteSuccess'));
        loadConfigs();
    } catch (error) {
        message.error(t('aiConfig.deleteFailed') + (error as Error).message);
    }
};

// 切换配置状态
const toggleConfig = async (id: number, enabled: boolean) => {
    try {
        await databaseService.aiConfig.updateAIConfig(id, { enabled });

        // 如果禁用的是首选配置，需要清除首选项状态
        if (!enabled) {
            const config = configs.value.find(c => c.id === id);
            if (config?.isPreferred) {
                await databaseService.aiConfig.updateAIConfig(id, { isPreferred: false });
            }
        }

        message.success(enabled ? t('aiConfig.configEnabled') : t('aiConfig.configDisabled'));
        loadConfigs(); // 重新加载以更新UI状态
    } catch (error) {
        message.error(t('aiConfig.updateFailed') + (error as Error).message);
    }
};

// 设置首选配置
const setPreferred = async (config: AIConfig) => {
    if (!config.id) return;

    try {
        if (config.isPreferred) {
            // 如果已经是首选，则取消首选
            await databaseService.aiConfig.clearPreferredAIConfig();
            message.success(t('aiConfig.preferredCleared'));
        } else {
            // 设置为首选
            await databaseService.aiConfig.setPreferredAIConfig(config.id);
            message.success(t('aiConfig.setAsPreferredSuccess', { name: config.name }));
        }

        loadConfigs(); // 重新加载以更新UI状态
    } catch (error) {
        message.error(t('aiConfig.setFailed') + (error as Error).message);
    }
};

// 清除首选配置
const clearPreferred = async () => {
    try {
        await databaseService.aiConfig.clearPreferredAIConfig();
        message.success(t('aiConfig.globalPreferredCleared'));
        loadConfigs(); // 重新加载以更新UI状态
    } catch (error) {
        message.error(t('aiConfig.clearFailed') + (error as Error).message);
    }
};

// 测试配置
const testConfig = async (config: AIConfig) => {
    if (!config.id) return;

    testingConfigs.value.add(config.id);
    try {
        // 序列化配置对象以确保可以通过 IPC 传递
        const serializedConfig = serializeConfig(config);

        const result = await window.electronAPI.ai.testConfig(serializedConfig);
        if (result.success) {
            message.success(t('aiConfig.connectionTestSuccess'));
            if (result.models && result.models.length > 0) {
                message.info(t('aiConfig.modelsFound', { count: result.models.length }));
            }
        } else {
            message.error(t('aiConfig.connectionTestFailed') + result.error);
        }
    } catch (error) {
        message.error(t('aiConfig.testFailed') + (error as Error).message);
    } finally {
        testingConfigs.value.delete(config.id);
    }
};

// 表单内测试连接并获取模型
const testFormConnection = async () => {
    testingFormConnection.value = true;
    formTestResult.value = null;

    try {
        // 构建临时配置对象进行测试
        const tempConfig = {
            configId: "temp_test",
            name: formData.name || "Test",
            type: formData.type,
            baseURL: formData.baseURL,
            apiKey: formData.apiKey,
            models: [],
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await window.electronAPI.ai.testConfig(tempConfig);
        formTestResult.value = result;

        if (result.success) {
            message.success(t('aiConfig.connectionTestSuccess'));

            // 自动填充模型列表
            if (result.models && result.models.length > 0) {
                formData.models = [...result.models];

                // 如果还没有设置默认模型，自动设置第一个
                if (!formData.defaultModel && result.models.length > 0) {
                    formData.defaultModel = result.models[0];
                }

                message.info(t('aiConfig.modelsAutoFilled', { count: result.models.length }));
            } else {
                message.warning(t('aiConfig.connectionSuccessNoModels'));
            }
        } else {
            message.error(t('aiConfig.connectionTestFailed') + result.error);
        }
    } catch (error) {
        message.error(t('aiConfig.testFailed') + (error as Error).message);
        formTestResult.value = { success: false, error: (error as Error).message };
    } finally {
        testingFormConnection.value = false;
    }
};

// 智能测试 - 发送真实提示词
const intelligentTest = async (config: AIConfig) => {
    if (!config.id) return;

    intelligentTestingConfigs.value.add(config.id);
    try {
        // 序列化配置对象以确保可以通过 IPC 传递
        const serializedConfig = serializeConfig(config);

        const result = await window.electronAPI.ai.intelligentTest(
            serializedConfig
        );
        intelligentTestResult.value = result;
        showIntelligentTestResult.value = true;

        if (result.success) {
            message.success(t('aiConfig.intelligentTestComplete'));
        } else {
            message.error(t('aiConfig.intelligentTestFailed') + result.error);
        }
    } catch (error) {
        message.error(t('aiConfig.intelligentTestFailed') + (error as Error).message);
        intelligentTestResult.value = {
            success: false,
            error: (error as Error).message,
        };
        showIntelligentTestResult.value = true;
    } finally {
        intelligentTestingConfigs.value.delete(config.id);
    }
};

// 编辑系统提示词
const editSystemPrompt = (config: AIConfig) => {
    editingSystemPromptConfig.value = config;
    systemPromptContent.value = config.systemPrompt || getDefaultSystemPrompt();
    showSystemPromptModal.value = true;
};

// 保存系统提示词
const saveSystemPrompt = async () => {
    if (!editingSystemPromptConfig.value?.id) return;

    try {
        await databaseService.aiConfig.updateAIConfig(editingSystemPromptConfig.value.id, {
            systemPrompt: systemPromptContent.value.trim() || undefined,
        });
        message.success(t('aiConfig.systemPromptUpdateSuccess'));
        closeSystemPromptModal();
        loadConfigs();
    } catch (error) {
        message.error("更新失败: " + (error as Error).message);
    }
};

// 关闭系统提示词编辑弹窗
const closeSystemPromptModal = () => {
    showSystemPromptModal.value = false;
    editingSystemPromptConfig.value = null;
    systemPromptContent.value = "";
};

// 获取默认系统提示词
const getDefaultSystemPrompt = () => {
    return `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;
};

// 重置系统提示词为默认值
const resetSystemPromptToDefault = () => {
    systemPromptContent.value = getDefaultSystemPrompt();
};

// 关闭弹窗
const closeModal = () => {
    showAddModal.value = false;
    editingConfig.value = null;
    formTestResult.value = null;
    resetForm();
};

// 重置表单
const resetForm = () => {
    formData.type = "openai";
    formData.name = "OpenAI 兼容";
    formData.baseURL = "https://api.openai.com/v1";
    formData.apiKey = "";
    formData.models = [];
    formData.defaultModel = "";
    formData.customModel = "";
    formData.systemPrompt = "";
    formTestResult.value = null;
};

// 类型变化处理
const onTypeChange = (type: typeof formData.type) => {
    // 设置默认的Base URL和API Key
    switch (type) {
        case 'openai':
            formData.baseURL = "https://api.openai.com/v1";
            formData.apiKey = "";
            break;
        case 'ollama':
            formData.baseURL = "http://localhost:11434";
            formData.apiKey = "";
            break;
        case 'anthropic':
            formData.baseURL = "";
            formData.apiKey = "";
            break;
        case 'google':
            formData.baseURL = "";
            formData.apiKey = "";
            break;
        case 'azure':
            formData.baseURL = "";
            formData.apiKey = "";
            break;
        case 'lmstudio':
            formData.baseURL = "http://localhost:1234/v1";
            formData.apiKey = "";
            break;
        case 'deepseek':
            formData.baseURL = "https://api.deepseek.com/v1";
            formData.apiKey = "";
            break;
        case 'cohere':
            formData.baseURL = "";
            formData.apiKey = "";
            break;
        case 'mistral':
            formData.baseURL = "https://api.mistral.ai/v1";
            formData.apiKey = "";
            break;
    }

    // 自动填充配置名称（仅在新建模式下，且名称为空或为之前的自动名称时）
    if (!editingConfig.value) {
        const currentName = formData.name.trim();
        const autoGeneratedNames = [
            "", "OpenAI", "Ollama", "Anthropic Claude", "Google AI",
            "Azure OpenAI", "LM Studio", "DeepSeek", "Cohere", "Mistral AI"
        ];

        if (autoGeneratedNames.includes(currentName)) {
            const nameMap: Record<typeof type, string> = {
                'openai': 'OpenAI',
                'ollama': 'Ollama',
                'anthropic': 'Anthropic Claude',
                'google': 'Google AI',
                'azure': 'Azure OpenAI',
                'lmstudio': 'LM Studio',
                'deepseek': 'DeepSeek',
                'cohere': 'Cohere',
                'mistral': 'Mistral AI'
            };
            formData.name = nameMap[type];
        }
    }

    // 清空之前的测试结果和模型列表
    formTestResult.value = null;
    formData.models = [];
    formData.defaultModel = "";
};

// 获取配置类型标签
const getConfigTypeLabel = (type: string) => {
    const typeLabels: Record<string, string> = {
        'openai': 'OpenAI',
        'ollama': 'Ollama',
        'anthropic': 'Anthropic Claude',
        'google': 'Google AI',
        'azure': 'Azure OpenAI',
        'lmstudio': 'LM Studio',
        'deepseek': 'DeepSeek',
        'cohere': 'Cohere',
        'mistral': 'Mistral AI'
    };
    return typeLabels[type] || type;
};

// 获取配置标签颜色类型
const getConfigTagType = (type: string): 'success' | 'error' | 'default' | 'warning' | 'primary' | 'info' => {
    const tagTypes: Record<string, 'success' | 'error' | 'default' | 'warning' | 'primary' | 'info'> = {
        'openai': 'success',
        'ollama': 'info',
        'anthropic': 'warning',
        'google': 'primary',
        'azure': 'success',
        'lmstudio': 'info',
        'deepseek': 'error',
        'cohere': 'default',
        'mistral': 'warning'
    };
    return tagTypes[type] || 'default';
};

// 格式化日期
const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString("zh-CN");
};

// 序列化配置对象以确保可以通过 IPC 传递
const serializeConfig = (config: AIConfig) => {
    return {
        id: config.id,
        configId: config.configId,
        name: config.name,
        type: config.type,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        models: [...(config.models || [])], // 创建新数组
        defaultModel: config.defaultModel,
        customModel: config.customModel,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt,
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt),
    };
};

// 组件挂载时加载数据
onMounted(async () => {
    // 等待数据库就绪后再加载数据
    await waitForDatabase();
    loadConfigs();
});

// 监听自动显示添加配置弹窗
watch(autoShowAddModal, (show) => {
    if (show) {
        showAddModal.value = true;
        autoShowAddModal.value = false; // 重置状态
    }
});

// 处理快速优化配置更新
const handleQuickOptimizationConfigsUpdated = () => {
    message.success("快速优化配置已更新");
};

// 导出方法供父组件调用
const openAddConfigModal = () => {
    autoShowAddModal.value = true;
};

defineExpose({
    openAddConfigModal,
});
</script>

<style scoped>
.ai-config-page {
    padding: 24px;
    overflow-y: auto;
}

.config-list {
    display: grid;
    gap: 16px;
}

.config-card {
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
}

.config-card:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.config-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.config-info h3 {
    margin: 0;
    font-size: 16px;
}

.config-switch {
    display: flex;
    align-items: center;
}

.config-details {
    border-top: 1px solid var(--border-color-1);
}

.config-details p {
    margin: 4px 0;
    color: var(--text-color-2);
}
</style>
