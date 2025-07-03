<template>
    <NSplit direction="horizontal" :style="{ height: `${contentHeight}px` }" :default-size="0.6" :min="0.3" :max="0.8"
        :disabled="modalWidth <= 800">
        <!-- 左侧：模板编辑区 -->
        <template #1>
            <NCard :title="t('promptManagement.jinjaTemplate')" size="small" :style="{ height: '100%' }">
                <template #header-extra>
                    <NTooltip placement="top">
                        <template #trigger>
                            <NButton size="small" type="info" @click="showSyntaxHelp = true"
                                :disabled="isStreaming || optimizing !== null">
                                <template #icon>
                                    <NIcon>
                                        <Help />
                                    </NIcon>
                                </template>
                                {{ t('promptManagement.jinjaSyntaxHelp') }}
                            </NButton>
                        </template>
                        <NFlex vertical size="small">
                            <NText>{{ t('promptManagement.jinjaSupportTooltip') }}</NText>
                            <NButton size="tiny" text type="primary" @click="openJinjaWebsite">
                                {{ t('promptManagement.jinjaSupportLearnMore') }}
                            </NButton>
                        </NFlex>
                    </NTooltip>
                </template>
                <NScrollbar ref="contentScrollbarRef" :style="{ height: `${contentHeight - 130}px` }">
                    <NFlex vertical size="medium" style="padding-right: 12px;">
                        <NFormItem path="content" style="flex: 1;" :show-label="false">
                            <NInput :value="content" @update:value="(value) => $emit('update:content', value)"
                                type="textarea" show-count :placeholder="t('promptManagement.jinjaTemplatePlaceholder')"
                                :style="{
                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    backgroundColor: isStreaming ? 'var(--success-color-suppl)' : undefined,
                                    border: isStreaming ? '1px solid var(--success-color)' : undefined
                                }" :autosize="{ minRows: 9 }" :readonly="isStreaming" />
                        </NFormItem>
                    </NFlex>

                    <!-- 快速插入变量 -->
                    <div v-if="jinjaVariables.length > 0" style="margin-top: 8px;">
                        <NText depth="3" style="font-size: 12px; margin-bottom: 8px; display: block;">
                            {{ t('promptManagement.quickInsertVariables') }}
                        </NText>
                        <NFlex size="small" wrap>
                            <NButton v-for="variable in jinjaVariables" :key="variable.name" size="tiny"
                                @click="insertVariableToTemplate(variable.name)"
                                :disabled="isStreaming || optimizing !== null || !variable.name">
                                {{ variable.name }}
                            </NButton>
                        </NFlex>
                    </div>

                    <NAlert type="info" :show-icon="false" style="margin: 8px 0;">
                        <NFlex justify="space-between" align="center">
                            <div>
                                <NFlex align="center" size="small">
                                    <NText depth="3" style="font-size: 12px;">
                                        {{ t('promptManagement.quickOptimization') }}
                                    </NText>
                                    <NButton size="tiny" text @click="$emit('open-quick-optimization-config')"
                                        style="padding: 2px; margin-left: 4px;">
                                        <template #icon>
                                            <NIcon size="12">
                                                <Settings />
                                            </NIcon>
                                        </template>
                                    </NButton>
                                </NFlex>
                                <!-- 流式传输状态显示 -->
                                <div v-if="isStreaming" style="margin-top: 4px;">
                                    <NText type="success" style="font-size: 11px;">
                                        {{ t('promptManagement.generating') }} ({{ streamStats.charCount }} {{
                                        t('promptManagement.characters') }})
                                    </NText>
                                </div>
                            </div>
                            <NFlex size="small">
                                <!-- 停止按钮 -->
                                <NButton v-if="isStreaming" size="small" type="error"
                                    @click="$emit('stop-optimization')">
                                    {{ t('promptManagement.stopGeneration') }}
                                </NButton>
                                <!-- 优化按钮 -->
                                <template v-else>
                                    <NButton v-for="config in quickOptimizationConfigs" :key="config.id" size="small"
                                        @click="$emit('optimize-prompt', config.id)"
                                        :loading="optimizing === config.name"
                                        :disabled="!content.trim() || optimizing !== null">
                                        {{ config.name }}
                                    </NButton>
                                    <NButton size="small" @click="showManualAdjustment"
                                        :disabled="!content.trim() || optimizing !== null">
                                        {{ t('promptManagement.manualAdjustment') }}
                                    </NButton>
                                </template>
                            </NFlex>
                        </NFlex>
                    </NAlert>

                    <!-- AI模型选择器 -->
                    <div style="margin-top: 8px;">
                        <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
                            :placeholder="t('promptManagement.aiModelPlaceholder')"
                            :disabled="isStreaming || optimizing !== null" />
                    </div>

                    <!-- 手动调整输入框 -->
                    <div v-if="showManualInput" style="margin-top: 8px;">
                        <NCard size="small" :title="t('promptManagement.manualAdjustmentTitle')">
                            <NFlex vertical size="small">
                                <NInput v-model:value="manualInstruction" type="textarea"
                                    :placeholder="t('promptManagement.manualAdjustmentPlaceholder')" :rows="3"
                                    :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }" show-count
                                    :maxlength="500" />
                                <NFlex justify="space-between" align="center">
                                    <NText depth="3" style="font-size: 12px;">
                                        {{ t('promptManagement.manualAdjustmentTip') }}
                                    </NText>
                                    <NFlex size="small">
                                        <NButton size="small" @click="hideManualAdjustment">
                                            {{ t('promptManagement.cancelAdjustment') }}
                                        </NButton>
                                        <NButton size="small" type="primary" @click="applyManualAdjustment"
                                            :loading="optimizing === 'manual'" :disabled="!manualInstruction.trim()">
                                            {{ t('promptManagement.confirmAdjustment') }}
                                        </NButton>
                                    </NFlex>
                                </NFlex>
                            </NFlex>
                        </NCard>
                    </div>
                </NScrollbar>
            </NCard>
        </template>

        <!-- 右侧：Jinja变量配置区 -->
        <template #2>
            <NCard size="small" :style="{ height: '100%' }">
                <template #header>
                    <NFlex justify="space-between" align="center">
                        <NText strong>{{ t('promptManagement.jinjaVariablesTitle') }}</NText>
                        <NFlex size="small">
                            <NButton size="small" @click="addJinjaVariable"
                                :disabled="isStreaming || optimizing !== null">
                                <template #icon>
                                    <NIcon>
                                        <Plus />
                                    </NIcon>
                                </template>
                                {{ t('promptManagement.addVariable') }}
                            </NButton>
                            <NButton size="small" @click="showTemplatePreview = true" :disabled="!content.trim()">
                                <template #icon>
                                    <NIcon>
                                        <Eye />
                                    </NIcon>
                                </template>
                                {{ t('promptManagement.preview') }}
                            </NButton>
                        </NFlex>
                    </NFlex>
                </template>
                <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                    <NFlex vertical size="medium" style="padding-right: 12px;">
                        <!-- 模板验证状态 -->
                        <div v-if="content.trim()">
                            <NAlert :type="templateValidation.isValid ? 'success' : 'error'" :show-icon="true"
                                :title="templateValidation.isValid ? t('promptManagement.templateValid') : t('promptManagement.templateInvalid')">
                                <template v-if="templateValidation.isValid">
                                    <NText>{{ t('promptManagement.templateValidMessage') }}</NText>
                                </template>
                                <template v-else>
                                    <NText>{{ templateValidation.error }}</NText>
                                </template>
                            </NAlert>
                        </div>

                        <!-- 变量列表 -->
                        <div v-if="jinjaVariables.length > 0">
                            <NCard v-for="(variable, index) in jinjaVariables" :key="index" size="small"
                                style="margin-bottom: 8px;">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NFlex align="center" size="small">
                                            <NText strong>{{ variable.name || t('promptManagement.unnamedVariable') }}
                                            </NText>
                                            <NTag size="small" :type="getVariableTypeColor(variable.type)">
                                                {{ getVariableTypeLabel(variable.type) }}
                                            </NTag>
                                            <NTag v-if="variable.required" size="small" type="error">
                                                {{ t('promptManagement.required') }}
                                            </NTag>
                                        </NFlex>
                                        <NButton size="tiny" type="error" text @click="removeJinjaVariable(index)"
                                            :disabled="isStreaming || optimizing !== null">
                                            <template #icon>
                                                <NIcon>
                                                    <Trash />
                                                </NIcon>
                                            </template>
                                        </NButton>
                                    </NFlex>
                                </template>

                                <NFlex vertical size="small">
                                    <!-- 变量名称和类型 -->
                                    <NFlex>
                                        <NFormItem :label="t('promptManagement.variableName')" style="flex: 1">
                                            <NInput v-model:value="variable.name"
                                                :placeholder="t('promptManagement.variableNamePlaceholder')"
                                                size="small" :disabled="isStreaming || optimizing !== null" />
                                        </NFormItem>
                                        <NFormItem :label="t('promptManagement.variableType')" style="width: 120px">
                                            <NSelect v-model:value="variable.type" :options="variableTypeOptions"
                                                size="small" :disabled="isStreaming || optimizing !== null" />
                                        </NFormItem>
                                    </NFlex>

                                    <!-- 默认值 -->
                                    <NFormItem :label="t('promptManagement.variableDefault')">
                                        <NInput v-model:value="variable.defaultValue"
                                            :placeholder="t('promptManagement.variableDefaultPlaceholder')" size="small"
                                            :disabled="isStreaming || optimizing !== null" />
                                    </NFormItem>

                                    <!-- 必填开关 -->
                                    <NFlex justify="space-between" align="center">
                                        <NText depth="3" style="font-size: 12px;">
                                            {{ t('promptManagement.variableRequired') }}
                                        </NText>
                                        <NSwitch v-model:value="variable.required" size="small"
                                            :disabled="isStreaming || optimizing !== null" />
                                    </NFlex>
                                </NFlex>
                            </NCard>
                        </div>

                        <!-- 空状态 -->
                        <NEmpty v-else :description="t('promptManagement.jinjaVariableTip')" size="small">
                            <template #icon>
                                <NIcon>
                                    <Code />
                                </NIcon>
                            </template>
                            <template #extra>
                                <NButton size="small" @click="addJinjaVariable"
                                    :disabled="isStreaming || optimizing !== null">
                                    <template #icon>
                                        <NIcon>
                                            <Plus />
                                        </NIcon>
                                    </template>
                                    {{ t('promptManagement.addFirstVariable') }}
                                </NButton>
                            </template>
                        </NEmpty>
                    </NFlex>
                </NScrollbar>
            </NCard>
        </template>
    </NSplit>

    <!-- Jinja语法帮助模态框 -->
    <CommonModal :show="showSyntaxHelp" @update:show="showSyntaxHelp = false" @close="showSyntaxHelp = false">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ t('promptManagement.jinjaSyntaxHelp') }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <NScrollbar :style="{ height: `${contentHeight}px` }">
                <NFlex vertical size="medium" style="padding-right: 12px;">
                    <NCard v-for="(examples, category) in syntaxHelp" :key="category" size="small">
                        <template #header>
                            <NText strong>{{ t(`promptManagement.jinja${category.charAt(0).toUpperCase() +
                                category.slice(1)}`) }}</NText>
                        </template>
                        <NFlex vertical size="small">
                            <NFlex v-for="example in examples" :key="example.code" align="center" size="small"
                                style="padding: 8px; border-radius: 4px; background: var(--color-fill-2);">
                                <NInput :value="example.code" readonly size="small" :style="{
                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    fontSize: '12px',
                                    flex: 1,
                                    cursor: 'pointer'
                                }" @click="copySyntaxCode(example.code)" />
                                <NButton size="tiny" text type="primary" @click="copySyntaxCode(example.code)"
                                    style="margin-left: 8px;">
                                    <template #icon>
                                        <NIcon size="14">
                                            <Copy />
                                        </NIcon>
                                    </template>
                                </NButton>
                                <NText depth="3" style="font-size: 12px; margin-left: 8px; min-width: 80px;">
                                    {{ t(`promptManagement.jinjaSyntaxExamples.${example.description}`) }}
                                </NText>
                            </NFlex>
                        </NFlex>
                    </NCard>
                </NFlex>
            </NScrollbar>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <NText depth="3">
                        {{ t('promptManagement.jinjaSyntaxHelpDesc') }}
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="showSyntaxHelp = false">{{ t('common.close') }}</NButton>
                        <NButton type="primary" @click="openJinjaWebsite">
                            {{ t('promptManagement.jinjaSupportLearnMore') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 模板预览模态框 -->
    <CommonModal :show="showTemplatePreview" @update:show="showTemplatePreview = false"
        @close="showTemplatePreview = false">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ t('promptManagement.jinjaTemplatePreview') }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <NFlex vertical size="medium" :style="{ height: `${contentHeight}px` }">
                <!-- 原始模板 -->
                <div>
                    <NText strong style="margin-bottom: 8px; display: block;">{{ t('promptManagement.originalTemplate')
                        }}</NText>
                    <NInput :value="content" type="textarea" readonly :rows="6"
                        :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }" />
                </div>

                <!-- 变量值 -->
                <div v-if="Object.keys(previewVariableValues).length > 0">
                    <NText strong style="margin-bottom: 8px; display: block;">{{ t('promptManagement.previewVariables')
                        }}</NText>
                    <NFlex vertical size="small">
                        <NFlex v-for="(value, key) in previewVariableValues" :key="key" align="center" size="small">
                            <NTag size="small" type="primary" :bordered="false">{{ key }}</NTag>
                            <NInput v-model:value="previewVariableValues[key]" size="small" />
                        </NFlex>
                    </NFlex>
                </div>

                <!-- 渲染结果 -->
                <div>
                    <NText strong style="margin-bottom: 8px; display: block;">{{
                        t('promptManagement.jinjaRenderedContent') }}</NText>
                    <NInput :value="previewRenderedContent" type="textarea" readonly :rows="8" :style="{
                        fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                        backgroundColor: 'var(--success-color-suppl)'
                    }" />
                </div>
            </NFlex>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <NText depth="3">
                        {{ t('promptManagement.jinjaTemplateSuccess') }}
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="showTemplatePreview = false">{{ t('common.close') }}</NButton>
                        <NButton type="primary" @click="copyToClipboard(previewRenderedContent)">
                            <template #icon>
                                <NIcon>
                                    <Copy />
                                </NIcon>
                            </template>
                            {{ t('promptManagement.copyResult') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, reactive } from "vue";
import { useI18n } from 'vue-i18n';
import {
    NFormItem,
    NInput,
    NSelect,
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NAlert,
    NEmpty,
    NSwitch,
    NScrollbar,
    NSplit,
    NTooltip,
    NTag,
    useMessage,
} from "naive-ui";
import { Plus, Trash, Settings, Help, Eye, Code, Copy } from "@vicons/tabler";
import { useWindowSize } from "@/composables/useWindowSize";
import AIModelSelector from "@/components/common/AIModelSelector.vue";
import CommonModal from "@/components/common/CommonModal.vue";
import { jinjaService } from "@/lib/utils/jinja.service";

interface JinjaVariable {
    name: string;
    type: 'str' | 'int' | 'float' | 'bool' | 'list' | 'dict' | 'text' | 'select';
    defaultValue?: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
}

interface Props {
    content: string;
    contentHeight: number;
    quickOptimizationConfigs: any[];
    optimizing: string | null;
    isStreaming: boolean;
    streamStats: any;
    variables?: JinjaVariable[];
}

interface Emits {
    (e: "update:content", value: string): void;
    (e: "update:variables", variables: JinjaVariable[]): void;
    (e: "optimize-prompt", configId: number): void;
    (e: "stop-optimization"): void;
    (e: "open-quick-optimization-config"): void;
    (e: "manual-adjustment", instruction: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n();
const message = useMessage();
const contentScrollbarRef = ref();
const modelSelectorRef = ref();
const selectedModelKey = ref("");

// 手动调整状态
const showManualInput = ref(false);
const manualInstruction = ref("");

// 语法帮助和预览状态
const showSyntaxHelp = ref(false);
const showTemplatePreview = ref(false);
const previewVariableValues = ref<Record<string, string>>({});

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize();

// 防抖相关
const debounceTimer = ref<number | null>(null);
const DEBOUNCE_DELAY = 500;

// 模板验证状态
const templateValidation = ref<{ isValid: boolean; error?: string }>({ isValid: true, error: '' });

// Jinja变量列表
const jinjaVariables = ref<JinjaVariable[]>([]);

// 初始化变量列表
const initializeJinjaVariables = () => {
    if (props.variables && props.variables.length > 0) {
        // 如果有传入的变量，使用传入的变量
        jinjaVariables.value = [...props.variables];
    } else {
        // 否则从模板内容中提取变量
        const extractedVariables = extractVariablesFromContent();
        jinjaVariables.value = extractedVariables;
    }
};

// 从模板内容中提取变量
const extractVariablesFromContent = (): JinjaVariable[] => {
    if (!props.content.trim()) return [];

    try {
        const variableNames = jinjaService.extractVariables(props.content);
        return variableNames.map(name => ({
            name,
            type: 'str',
            required: true,
        }));
    } catch (error) {
        console.error('提取变量失败:', error);
        return [];
    }
};

// 变量类型选项
const variableTypeOptions = [
    { label: '字符串 (str)', value: 'str' },
    { label: '整数 (int)', value: 'int' },
    { label: '浮点数 (float)', value: 'float' },
    { label: '布尔值 (bool)', value: 'bool' },
    { label: '列表 (list)', value: 'list' },
    { label: '字典 (dict)', value: 'dict' },
];

// 语法帮助信息
const syntaxHelp = computed(() => jinjaService.getSyntaxHelp());

// 预览渲染内容
const previewRenderedContent = computed(() => {
    if (!props.content.trim()) return '';

    try {
        return jinjaService.render(props.content, previewVariableValues.value);
    } catch (error) {
        return `模板渲染错误: ${error instanceof Error ? error.message : String(error)}`;
    }
});

// 更新预览变量值
const updatePreviewVariableValues = () => {
    const newValues: Record<string, string> = {};
    jinjaVariables.value.forEach(variable => {
        if (variable.name) {
            newValues[variable.name] = variable.defaultValue || `[${variable.name}]`;
        }
    });
    previewVariableValues.value = newValues;
};

// 验证模板语法
const validateTemplate = (content: string) => {
    if (!content.trim()) {
        templateValidation.value = { isValid: true, error: '' };
        return;
    }

    try {
        const result = jinjaService.validateTemplate(content);
        templateValidation.value = result;
    } catch (error) {
        templateValidation.value = {
            isValid: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};

// 防抖的模板验证
const debouncedValidateTemplate = (content: string) => {
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
    }

    debounceTimer.value = setTimeout(() => {
        validateTemplate(content);
        debounceTimer.value = null;
    }, DEBOUNCE_DELAY) as unknown as number;
};

// 显示手动调整输入框
const showManualAdjustment = () => {
    showManualInput.value = true;
    manualInstruction.value = "";

    // 使用 nextTick 确保 DOM 更新后再滚动
    nextTick(() => {
        // 滚动到底部以显示手动调整输入框
        if (contentScrollbarRef.value) {
            contentScrollbarRef.value.scrollTo({ top: 999999, behavior: 'smooth' });
        }
    });
};

// 隐藏手动调整输入框
const hideManualAdjustment = () => {
    showManualInput.value = false;
    manualInstruction.value = "";
};

// 应用手动调整
const applyManualAdjustment = () => {
    if (!manualInstruction.value.trim()) {
        message.warning(t('promptManagement.enterAdjustmentInstruction'));
        return;
    }

    if (!props.content.trim()) {
        message.warning(t('promptManagement.enterPromptContentFirst'));
        return;
    }

    emit("manual-adjustment", manualInstruction.value.trim());
    hideManualAdjustment();
};

// 打开Jinja官网
const openJinjaWebsite = () => {
    if ((window as any).electronAPI?.shell?.openExternal) {
        (window as any).electronAPI.shell.openExternal('https://jinja.palletsprojects.com/en/stable/');
    } else {
        window.open('https://jinja.palletsprojects.com/en/stable/', '_blank');
    }
};

// 复制到剪贴板
const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        message.success(t('promptManagement.copySuccess'));
    } catch (error) {
        console.error('复制失败:', error);
        message.error(t('promptManagement.copyFailed'));
    }
};

// 复制语法代码
const copySyntaxCode = async (code: string) => {
    try {
        await navigator.clipboard.writeText(code);
        message.success(t('promptManagement.jinjaSyntaxCopySuccess'));
    } catch (error) {
        console.error('复制语法代码失败:', error);
        message.error(t('promptManagement.jinjaSyntaxCopyFailed'));
    }
};

// 添加Jinja变量
const addJinjaVariable = () => {
    jinjaVariables.value.push({
        name: '',
        type: 'str',
        required: true,
    });
    // 通知父组件变量已更新
    emit('update:variables', [...jinjaVariables.value]);
};

// 移除Jinja变量
const removeJinjaVariable = (index: number) => {
    jinjaVariables.value.splice(index, 1);
    // 通知父组件变量已更新
    emit('update:variables', [...jinjaVariables.value]);
};

// 插入变量到模板
const insertVariableToTemplate = (variableName: string) => {
    if (!props.content.trim()) {
        message.warning(t('promptManagement.enterPromptContentFirst'));
        return;
    }

    const newContent = props.content + `{{ ${variableName} }}`;
    emit('update:content', newContent);
};

// 获取变量类型颜色
const getVariableTypeColor = (type: string) => {
    switch (type) {
        case 'int':
        case 'float':
            return 'warning';
        case 'bool':
            return 'success';
        case 'list':
        case 'dict':
            return 'error';
        default:
            return 'info';
    }
};

// 获取变量类型标签
const getVariableTypeLabel = (type: string) => {
    switch (type) {
        case 'str':
            return '字符串';
        case 'int':
            return '整数';
        case 'float':
            return '浮点数';
        case 'bool':
            return '布尔值';
        case 'list':
            return '列表';
        case 'dict':
            return '字典';
        default:
            return '字符串';
    }
};

// 监听内容变化，验证模板并更新变量（使用防抖）
watch(
    () => props.content,
    (newContent) => {
        if (newContent) {
            debouncedValidateTemplate(newContent);
            // 当内容变化时，重新提取变量
            const extractedVariables = extractVariablesFromContent();
            if (extractedVariables.length > 0) {
                // 合并现有变量和新提取的变量
                const existingNames = new Set(jinjaVariables.value.map(v => v.name));
                const newVariables = extractedVariables.filter(v => !existingNames.has(v.name));
                if (newVariables.length > 0) {
                    jinjaVariables.value.push(...newVariables);
                }
            }
        } else {
            // 如果内容为空，立即清空验证状态
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            templateValidation.value = { isValid: true, error: '' };
            // 清空变量列表
            jinjaVariables.value = [];
        }
    }
);

// 监听Jinja变量变化，更新预览变量值并通知父组件
watch(
    () => jinjaVariables.value,
    (newVariables) => {
        updatePreviewVariableValues();
        // 通知父组件变量已更新 - 使用 nextTick 避免递归更新
        nextTick(() => {
            emit('update:variables', [...newVariables]);
        });
    },
    { deep: true }
);

// 暴露方法给父组件
defineExpose({
    modelSelectorRef,
    selectedModelKey,
    jinjaVariables,
    initializeJinjaVariables,
});
</script>

<style scoped></style>