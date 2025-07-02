<template>
    <NSplit direction="horizontal" :style="{ height: `${contentHeight}px` }" :default-size="0.6" :min="0.3"
        :max="0.8" :disabled="modalWidth <= 800">
        <!-- 左侧：内容编辑区 -->
        <template #1>
            <NCard :title="t('promptManagement.content')" size="small" :style="{ height: '100%' }">
                <NScrollbar ref="contentScrollbarRef" :style="{ height: `${contentHeight - 130}px` }">
                    <NFlex vertical size="medium" style="padding-right: 12px;">
                        <NFormItem path="content" style="flex: 1;" :show-label="false">
                            <NInput 
                                :value="content" 
                                @update:value="(value) => $emit('update:content', value)"
                                type="textarea"
                                show-count
                                :placeholder="t('promptManagement.contentPlaceholder')"
                                :style="{ 
                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                    backgroundColor: isStreaming ? 'var(--success-color-suppl)' : undefined,
                                    border: isStreaming ? '1px solid var(--success-color)' : undefined
                                }"
                                :autosize="{ minRows: 9 }" 
                                :readonly="isStreaming"
                            />
                        </NFormItem>
                    </NFlex>
                    <NAlert type="info" :show-icon="false" style="margin: 0;">
                        <NFlex justify="space-between" align="center">
                            <div>
                                <NFlex align="center" size="small">
                                    <NText depth="3" style="font-size: 12px;">
                                        {{ t('promptManagement.quickOptimization') }}
                                    </NText>
                                    <NButton 
                                        size="tiny" 
                                        text 
                                        @click="$emit('open-quick-optimization-config')"
                                        style="padding: 2px; margin-left: 4px;"
                                    >
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
                                        {{ t('promptManagement.generating') }} ({{ streamStats.charCount }} {{ t('promptManagement.characters') }})
                                    </NText>
                                </div>
                            </div>
                            <NFlex size="small">
                                <!-- 停止按钮 -->
                                <NButton 
                                    v-if="isStreaming"
                                    size="small" 
                                    type="error"
                                    @click="$emit('stop-optimization')"
                                >
                                    {{ t('promptManagement.stopGeneration') }}
                                </NButton>
                                <!-- 优化按钮 -->
                                <template v-else>
                                    <NButton 
                                        v-for="config in quickOptimizationConfigs"
                                        :key="config.id"
                                        size="small" 
                                        @click="$emit('optimize-prompt', config.id)"
                                        :loading="optimizing === config.name"
                                        :disabled="!content.trim() || optimizing !== null"
                                    >
                                        {{ config.name }}
                                    </NButton>
                                    <NButton 
                                        size="small" 
                                        @click="showManualAdjustment"
                                        :disabled="!content.trim() || optimizing !== null"
                                    >
                                        {{ t('promptManagement.manualAdjustment') }}
                                    </NButton>
                                </template>
                            </NFlex>
                        </NFlex>
                    </NAlert>
                    
                    <!-- AI模型选择器 -->
                    <div style="margin-top: 8px;">
                        <AIModelSelector
                            ref="modelSelectorRef"
                            v-model:modelKey="selectedModelKey"
                            :placeholder="t('promptManagement.aiModelPlaceholder')"
                            :disabled="isStreaming || optimizing !== null"
                        />
                    </div>
                    
                    <!-- 手动调整输入框 -->
                    <div v-if="showManualInput" style="margin-top: 8px;">
                        <NCard size="small" :title="t('promptManagement.manualAdjustmentTitle')">
                            <NFlex vertical size="small">
                                <NInput
                                    v-model:value="manualInstruction"
                                    type="textarea"
                                    :placeholder="t('promptManagement.manualAdjustmentPlaceholder')"
                                    :rows="3"
                                    :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }"
                                    show-count
                                    :maxlength="500"
                                />
                                <NFlex justify="space-between" align="center">
                                    <NText depth="3" style="font-size: 12px;">
                                        {{ t('promptManagement.manualAdjustmentTip') }}
                                    </NText>
                                    <NFlex size="small">
                                        <NButton size="small" @click="hideManualAdjustment">
                                            {{ t('promptManagement.cancelAdjustment') }}
                                        </NButton>
                                        <NButton 
                                            size="small" 
                                            type="primary"
                                            @click="applyManualAdjustment"
                                            :loading="optimizing === 'manual'"
                                            :disabled="!manualInstruction.trim()"
                                        >
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

        <!-- 右侧：变量配置区 -->
        <template #2>
            <NCard size="small" :style="{ height: '100%' }">
                <template #header>
                    <NFlex justify="space-between" align="center">
                        <NText strong>{{ t('promptManagement.detectedVariables') }}</NText>
                        <NButton size="small" @click="addVariable">
                            <template #icon>
                                <NIcon>
                                    <Plus />
                                </NIcon>
                            </template>
                            {{ t('promptManagement.addVariable') }}
                        </NButton>
                    </NFlex>
                </template>
                <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                    <NFlex vertical size="medium" style="padding-right: 12px;"
                        v-if="variables.length > 0">
                        <NCard v-for="(variable, index) in variables" :key="index" size="small">
                            <template #header>
                                <NFlex justify="space-between" align="center">
                                    <NText>{{ variable.name || t('promptManagement.variable') + (index + 1) }}</NText>
                                    <NButton size="small" text type="error" @click="removeVariable(index)">
                                        <template #icon>
                                            <NIcon>
                                                <Trash />
                                            </NIcon>
                                        </template>
                                    </NButton>
                                </NFlex>
                            </template>

                            <NFlex vertical size="small">
                                <NFlex>
                                    <NFormItem :label="t('promptManagement.variableName')" style="flex: 1">
                                        <NInput v-model:value="variable.name" :placeholder="t('promptManagement.variableNamePlaceholder')" size="small" />
                                    </NFormItem>
                                    <NFormItem :label="t('promptManagement.variableLabel')" style="flex: 1">
                                        <NInput v-model:value="variable.label" :placeholder="t('promptManagement.variableLabelPlaceholder')" size="small" />
                                    </NFormItem>
                                </NFlex>

                                <NFlex>
                                    <NFormItem :label="t('promptManagement.variableType')" style="flex: 1">
                                        <NSelect v-model:value="variable.type" :options="variableTypeOptions" size="small" />
                                    </NFormItem>
                                    <NFormItem :label="t('promptManagement.variableRequired')" style="width: 80px">
                                        <NSwitch v-model:value="variable.required" size="small" />
                                    </NFormItem>
                                </NFlex>

                                <NFormItem :label="t('promptManagement.variableDefault')">
                                    <NInput v-if="variable.type === 'text'" v-model:value="variable.defaultValue" :placeholder="t('promptManagement.variableDefaultPlaceholder')" size="small" />
                                    <NSelect v-else-if="variable.type === 'select'" v-model:value="variable.defaultValue" :options="getVariableDefaultOptions(variable.options)" :placeholder="t('promptManagement.selectDefaultOption')" size="small" clearable />
                                </NFormItem>

                                <NFormItem v-if="variable.type === 'select'" :label="t('promptManagement.variableOptions')">
                                    <NDynamicInput v-model:value="variable.options" show-sort-button :placeholder="t('promptManagement.variableOptionsPlaceholder')" :min="1" />
                                </NFormItem>
                            </NFlex>
                        </NCard>
                    </NFlex>
                    <NEmpty v-else :description="t('promptManagement.variableTip')" size="small">
                        <template #icon>
                            <NIcon>
                                <Plus />
                            </NIcon>
                        </template>
                    </NEmpty>
                </NScrollbar>
            </NCard>
        </template>
    </NSplit>
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
    NDynamicInput,
    NSplit,
    NTooltip,
    useMessage,
} from "naive-ui";
import { Plus, Trash, Settings } from "@vicons/tabler";
import { useWindowSize } from "@/composables/useWindowSize";
import AIModelSelector from "@/components/common/AIModelSelector.vue";

interface Variable {
    name: string;
    label: string;
    type: string;
    options?: string[];
    defaultValue?: string;
    required: boolean;
    placeholder?: string;
}

interface Props {
    content: string;
    variables: Variable[];
    contentHeight: number;
    quickOptimizationConfigs: any[];
    optimizing: string | null;
    isStreaming: boolean;
    streamStats: any;
}

interface Emits {
    (e: "update:content", value: string): void;
    (e: "update:variables", value: Variable[]): void;
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

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize();

const variableTypeOptions = [
    { label: t('promptManagement.text'), value: 'text' },
    { label: t('promptManagement.select'), value: 'select' },
];

// 防抖相关
const debounceTimer = ref<number | null>(null);
const DEBOUNCE_DELAY = 500;

// 提取变量的方法
const extractVariables = (content: string) => {
    const currentVariableNames = new Set<string>();
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const matches = content.match(variableRegex);

    if (matches) {
        matches.forEach((match) => {
            const variableName = match.replace(/[{}]/g, "").trim();
            if (variableName) {
                currentVariableNames.add(variableName);
            }
        });
    }

    // 保留现有变量的配置信息
    const existingVariableConfigs = new Map();
    props.variables.forEach((variable) => {
        if (variable.name) {
            existingVariableConfigs.set(variable.name, variable);
        }
    });

    // 重新构建变量列表：只包含当前内容中实际存在的变量
    const newVariables = Array.from(currentVariableNames).map(
        (variableName) => {
            // 如果已有配置，保留原配置；否则创建新配置
            return (
                existingVariableConfigs.get(variableName) || {
                    name: variableName,
                    label: variableName,
                    type: "text",
                    options: [],
                    defaultValue: "",
                    required: true,
                    placeholder: "",
                }
            );
        }
    );

    emit("update:variables", newVariables);
};

// 防抖的变量提取方法
const debouncedExtractVariables = (content: string) => {
    // 清除之前的定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
    }

    // 设置新的定时器
    debounceTimer.value = setTimeout(() => {
        extractVariables(content);
        debounceTimer.value = null;
    }, DEBOUNCE_DELAY) as unknown as number;
};

// 生成唯一变量名的辅助方法
const generateUniqueVariableName = () => {
    const existingNames = new Set(props.variables.map((v) => v.name));
    let counter = 1;
    let variableName = `变量${counter}`;

    while (existingNames.has(variableName)) {
        counter++;
        variableName = `变量${counter}`;
    }

    return variableName;
};

// 获取变量默认值选项
const getVariableDefaultOptions = (options: any) => {
    if (!Array.isArray(options) || options.length === 0) return [];
    return options
        .filter((opt: any) => opt && opt.trim())
        .map((option: any) => ({
            label: option,
            value: option,
        }));
};

// 添加变量
const addVariable = () => {
    const variableName = generateUniqueVariableName();
    const newVariable = {
        name: variableName,
        label: variableName,
        type: "text",
        options: [],
        defaultValue: "",
        required: true,
        placeholder: "",
    };

    const newVariables = [...props.variables, newVariable];
    emit("update:variables", newVariables);

    // 在左侧内容中自动添加对应的占位符
    const placeholder = `{{${variableName}}}`;

    // 如果内容为空，直接添加占位符
    if (!props.content.trim()) {
        emit("update:content", placeholder);
    } else {
        // 如果内容不为空，在末尾添加占位符（换行后添加）
        const content = props.content.trim();
        emit("update:content", content + "\n" + placeholder);
    }
};

// 删除变量
const removeVariable = (index: number) => {
    const newVariables = [...props.variables];
    newVariables.splice(index, 1);
    emit("update:variables", newVariables);
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

// 监听内容变化，自动提取变量（使用防抖）
watch(
    () => props.content,
    (newContent) => {
        if (newContent) {
            debouncedExtractVariables(newContent);
        } else {
            // 如果内容为空，立即清空变量列表
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            emit("update:variables", []);
        }
    }
);

// 监听变量类型变化，清理不匹配的默认值
watch(
    () => props.variables,
    (newVariables) => {
        const updatedVariables = newVariables.map(variable => {
            const updatedVariable = { ...variable };
            
            // 当变量类型为选项时，检查默认值是否在选项中
            if (updatedVariable.type === "select" && updatedVariable.defaultValue) {
                if (!updatedVariable.options || !updatedVariable.options.includes(updatedVariable.defaultValue)) {
                    updatedVariable.defaultValue = "";
                }
            }
            // 当变量类型为文本且选项不为空时，清空选项
            if (
                updatedVariable.type === "text" &&
                updatedVariable.options &&
                updatedVariable.options.length > 0
            ) {
                updatedVariable.options = [];
            }
            // 当变量类型切换到选项但没有选项时，提供默认选项
            if (
                updatedVariable.type === "select" &&
                (!Array.isArray(updatedVariable.options) || updatedVariable.options.length === 0)
            ) {
                updatedVariable.options = ["选项1", "选项2"];
            }
            
            return updatedVariable;
        });
        
        emit("update:variables", updatedVariables);
    },
    { deep: true }
);

// 暴露方法给父组件
defineExpose({
    modelSelectorRef,
    selectedModelKey,
});
</script>

<style scoped></style> 