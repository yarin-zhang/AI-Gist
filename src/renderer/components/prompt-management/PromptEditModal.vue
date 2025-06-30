<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleCancel">
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex vertical>
            <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                {{ isEdit ? "编辑提示词" : "创建提示词" }}
            </NText>
            <NText depth="3">
                {{ getTabDescription() }}
            </NText>
            </NFlex>
        </template>
        <!-- 中间可操作区域 -->
        <template #content="{ contentHeight }">
            <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top">
                <NTabs v-model:value="activeTab" type="segment" :style="{ height: `${contentHeight}px` }">
                    <!-- 编辑 Tab -->
                    <NTabPane name="edit" tab="编辑">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3"
                            :max="0.8" :disabled="modalWidth <= 800">
                            <!-- 左侧：内容编辑区 -->
                            <template #1>
                                <NCard title="提示词内容" size="small" :style="{ height: '100%' }">
                                    <NScrollbar ref="contentScrollbarRef" :style="{ height: `${contentHeight - 130}px` }" y-placement="bottom">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem path="content" style="flex: 1;">
                                                <NInput 
                                                    v-model:value="formData.content" 
                                                    type="textarea"
                                                    placeholder="请输入提示词内容，使用 {{变量名}} 来定义变量" 
                                                    show-count
                                                    :style="{ 
                                                        height: `${contentHeight - 280}px`, 
                                                        fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        backgroundColor: isStreaming ? 'var(--success-color-suppl)' : undefined,
                                                        border: isStreaming ? '1px solid var(--success-color)' : undefined
                                                    }"
                                                    :autosize="false" 
                                                    :readonly="isStreaming"
                                                />
                                            </NFormItem>
                                        </NFlex>
                                        <NAlert type="info" :show-icon="false" style="margin: 0;">
                                            <NFlex justify="space-between" align="center">
                                                <div>
                                                    <NText depth="3" style="font-size: 12px;">
                                                        快速优化提示词：
                                                    </NText>
                                                    <!-- 流式传输状态显示 -->
                                                    <div v-if="isStreaming" style="margin-top: 4px;">
                                                        <NText type="success" style="font-size: 11px;">
                                                            正在生成... ({{ streamStats.charCount }} 字符)
                                                        </NText>
                                                    </div>
                                                </div>
                                                <NFlex size="small">
                                                    <!-- 停止按钮 -->
                                                    <NButton 
                                                        v-if="isStreaming"
                                                        size="small" 
                                                        type="error"
                                                        @click="stopOptimization"
                                                    >
                                                        停止生成
                                                    </NButton>
                                                    <!-- 优化按钮 -->
                                                    <template v-else>
                                                        <NButton 
                                                            size="small" 
                                                            @click="optimizePrompt('shorter')"
                                                            :loading="optimizing === 'shorter'"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            更简短
                                                        </NButton>
                                                        <NButton 
                                                            size="small" 
                                                            @click="optimizePrompt('richer')"
                                                            :loading="optimizing === 'richer'"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            更丰富
                                                        </NButton>
                                                        <NButton 
                                                            size="small" 
                                                            @click="optimizePrompt('general')"
                                                            :loading="optimizing === 'general'"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            更通用
                                                        </NButton>
                                                        <NButton 
                                                            size="small" 
                                                            @click="optimizePrompt('extract')"
                                                            :loading="optimizing === 'extract'"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            提取变量
                                                        </NButton>
                                                        <NButton 
                                                            size="small" 
                                                            @click="showManualAdjustment"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            手动调整
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
                                                placeholder="选择AI模型进行优化"
                                                :disabled="isStreaming || optimizing !== null"
                                            />
                                        </div>
                                        
                                        <!-- 手动调整输入框 -->
                                        <div v-if="showManualInput" style="margin-top: 8px;">
                                            <NCard size="small" title="手动调整指令">
                                                <NFlex vertical size="small">
                                                    <NInput
                                                        v-model:value="manualInstruction"
                                                        type="textarea"
                                                        placeholder="请输入您希望如何调整提示词的指令，例如：'添加更多技术细节'、'简化语言表达'等..."
                                                        :rows="3"
                                                        :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }"
                                                        show-count
                                                        :maxlength="500"
                                                    />
                                                    <NFlex justify="space-between" align="center">
                                                        <NText depth="3" style="font-size: 12px;">
                                                            AI 将根据您的指令调整当前提示词内容
                                                        </NText>
                                                        <NFlex size="small">
                                                            <NButton size="small" @click="hideManualAdjustment">
                                                                取消
                                                            </NButton>
                                                            <NButton 
                                                                size="small" 
                                                                type="primary"
                                                                @click="applyManualAdjustment"
                                                                :loading="optimizing === 'manual'"
                                                                :disabled="!manualInstruction.trim()"
                                                            >
                                                                确定调整
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
                                            <NText strong>检测到的变量</NText>
                                            <NButton size="small" @click="addVariable">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                                手动添加
                                            </NButton>
                                        </NFlex>
                                    </template>
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;"
                                            v-if="formData.variables.length > 0">
                                            <NCard v-for="(variable, index) in formData.variables" :key="index" size="small">
                                                <template #header>
                                                    <NFlex justify="space-between" align="center">
                                                        <NText>{{ variable.name || "变量" + (index + 1) }}</NText>
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
                                                        <NFormItem label="变量名" style="flex: 1">
                                                            <NInput v-model:value="variable.name" placeholder="变量名"
                                                                size="small" />
                                                        </NFormItem>
                                                        <NFormItem label="显示名" style="flex: 1">
                                                            <NInput v-model:value="variable.label" placeholder="显示名称"
                                                                size="small" />
                                                        </NFormItem>
                                                    </NFlex>

                                                    <NFlex>
                                                        <NFormItem label="类型" style="flex: 1">
                                                            <NSelect v-model:value="variable.type"
                                                                :options="variableTypeOptions" size="small" />
                                                        </NFormItem>
                                                        <NFormItem label="必填" style="width: 80px">
                                                            <NSwitch v-model:value="variable.required" size="small" />
                                                        </NFormItem>
                                                    </NFlex>

                                                    <NFormItem label="默认值">
                                                        <NInput v-if="variable.type === 'text'"
                                                            v-model:value="variable.defaultValue" placeholder="默认值（可选）"
                                                            size="small" />
                                                        <NSelect v-else-if="variable.type === 'select'"
                                                            v-model:value="variable.defaultValue"
                                                            :options="getVariableDefaultOptions(variable.options)"
                                                            placeholder="选择默认选项（可选）" size="small" clearable />
                                                    </NFormItem>

                                                    <NFormItem v-if="variable.type === 'select'" label="选项">
                                                        <NDynamicInput v-model:value="variable.options" show-sort-button
                                                            placeholder="请输入选项" :min="1" />
                                                    </NFormItem>
                                                </NFlex>
                                            </NCard>
                                        </NFlex>
                                        <NEmpty v-else description="在左侧输入内容时使用 {{变量名}} 格式，会自动识别变量" size="small">
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
                    </NTabPane>

                    <!-- 补充信息 Tab -->
                    <NTabPane name="info" tab="补充信息">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3"
                            :max="0.8" :disabled="modalWidth <= 800">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard title="基本信息" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem label="标题" path="title">
                                                <NInput v-model:value="formData.title" placeholder="请输入提示词标题（可选）" />
                                            </NFormItem>

                                            <NFormItem label="描述" path="description">
                                                <NInput v-model:value="formData.description" type="textarea"
                                                    placeholder="请输入提示词描述（可选）" :rows="8" />
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：分类与标签 -->
                            <template #2>
                                <NCard title="分类与标签" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem label="分类">
                                                <NSelect v-model:value="formData.categoryId" :options="categoryOptions"
                                                    placeholder="选择分类" clearable />
                                            </NFormItem>
                                            <NFormItem label="标签" path="tags">
                                                <NDynamicTags v-model:value="formData.tags" placeholder="按回车添加标签" :max="5" />
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 历史记录 Tab - 仅在编辑模式下显示 -->
                    <NTabPane v-if="isEdit" name="history" tab="历史记录">
                        <NCard title="版本历史" size="small" :style="{ height: `${contentHeight - 50}px` }">
                            <NScrollbar :style="{ height: `${contentHeight - 100}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;" v-if="historyList.length > 0">
                                    <NCard v-for="(history, index) in historyList" :key="history.id" size="small">
                                        <template #header>
                                            <NFlex justify="space-between" align="center">
                                                <NFlex align="center" size="small">
                                                    <NText strong>版本 {{ history.version }}</NText>
                                                    <NTag size="small" type="info">
                                                        {{ formatDate(history.createdAt) }}
                                                    </NTag>
                                                </NFlex>
                                                <NFlex size="small">
                                                    <NButton size="small" @click="openPreviewHistory(history)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Eye />
                                                            </NIcon>
                                                        </template>
                                                        预览
                                                    </NButton>
                                                    <NButton size="small" type="primary" @click="rollbackToHistory(history)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <ArrowBackUp />
                                                            </NIcon>
                                                        </template>
                                                        回滚
                                                    </NButton>
                                                </NFlex>
                                            </NFlex>
                                        </template>
                                        <NFlex vertical size="small">
                                            <NText depth="3">{{ history.title }}</NText>
                                            <NText depth="3" v-if="history.changeDescription">
                                                变更说明: {{ history.changeDescription }}
                                            </NText>
                                            <NText depth="3" style="font-size: 12px;">
                                                内容预览: {{ getContentPreview(history.content) }}
                                            </NText>
                                        </NFlex>
                                    </NCard>
                                </NFlex>
                                <NEmpty v-else description="暂无版本历史" size="small">
                                    <template #icon>
                                        <NIcon>
                                            <History />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NScrollbar>
                        </NCard>
                    </NTabPane>
                </NTabs>
            </NForm>
        </template>

        <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <!-- 显示当前活动的tab信息 -->
                    <NText depth="3" v-if="activeTab === 'history' && isEdit">
                        版本历史记录，可以预览和回滚到之前的版本
                    </NText>
                </div>
                <div>
                    <!-- 右侧区域 -->
                    <NFlex size="small">
                        <NButton @click="handleCancel">取消</NButton>
                        <NButton type="primary" @click="handleSave" :loading="saving"
                            :disabled="!formData.content.trim()">
                            {{ isEdit ? "更新" : "创建" }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 历史版本预览模态框 -->
    <CommonModal :show="showPreviewModal" @update:show="closePreviewModal" @close="closePreviewModal">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                历史版本预览 - 版本 {{ previewHistory?.version }}
            </NText>
            <NText depth="3">
                {{ formatDate(previewHistory?.createdAt || new Date()) }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <div v-if="previewHistory" :style="{ height: `${contentHeight}px`, overflow: 'hidden' }">
                <NTabs type="segment" :style="{ height: '100%' }">
                    <!-- 内容与变量 Tab -->
                    <NTabPane name="content" tab="内容与变量">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：提示词内容 -->
                            <template #1>
                                <NCard title="提示词内容" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NInput
                                                :value="previewHistory.content"
                                                type="textarea"
                                                readonly
                                                :style="{ 
                                                    height: `${contentHeight - 180}px`, 
                                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' 
                                                }"
                                                :autosize="false"
                                            />
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：变量配置 -->
                            <template #2>
                                <NCard title="变量配置" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NFlex vertical size="medium" v-if="getPreviewVariables(previewHistory.variables).length > 0">
                                                <NCard 
                                                    v-for="(variable, index) in getPreviewVariables(previewHistory.variables)" 
                                                    :key="index" 
                                                    size="small"
                                                >
                                                    <template #header>
                                                        <NText strong>{{ variable.name }}</NText>
                                                    </template>
                                                    <NFlex vertical size="small">
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">显示名</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.label }}</NText>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">类型</NText>
                                                            </div>
                                                            <NTag size="small" :type="variable.type === 'text' ? 'default' : 'info'">
                                                                {{ variable.type === 'text' ? '文本' : '选项' }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">必填</NText>
                                                            </div>
                                                            <NTag size="small" :type="variable.required ? 'error' : 'success'">
                                                                {{ variable.required ? '是' : '否' }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex v-if="variable.defaultValue">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">默认值</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.defaultValue }}</NText>
                                                        </NFlex>
                                                        <NFlex v-if="variable.placeholder">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">占位符</NText>
                                                            </div>
                                                            <NText depth="3" style="font-size: 12px;">{{ variable.placeholder }}</NText>
                                                        </NFlex>
                                                        <NFlex v-if="variable.type === 'select' && variable.options && variable.options.length > 0">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">选项</NText>
                                                            </div>
                                                            <NFlex size="small" wrap>
                                                                <NTag v-for="option in variable.options" :key="option" size="small">
                                                                    {{ option }}
                                                                </NTag>
                                                            </NFlex>
                                                        </NFlex>
                                                    </NFlex>
                                                </NCard>
                                            </NFlex>
                                            <NEmpty v-else description="该版本没有配置变量" size="small">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                            </NEmpty>
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 补充信息 Tab -->
                    <NTabPane name="info" tab="补充信息">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard title="基本信息" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div>
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">标题</NText>
                                                <NInput :value="previewHistory.title" readonly />
                                            </div>

                                            <div v-if="previewHistory.description">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">描述</NText>
                                                <NInput 
                                                    :value="previewHistory.description" 
                                                    type="textarea" 
                                                    readonly 
                                                    :rows="8" 
                                                />
                                            </div>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：分类与标签 -->
                            <template #2>
                                <NCard title="分类与标签" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div v-if="previewHistory.categoryId">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">分类</NText>
                                                <NInput :value="getCategoryName(previewHistory.categoryId)" readonly />
                                            </div>

                                            <div v-if="previewHistory.tags">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 8px; display: block;">标签</NText>
                                                <NFlex size="small" wrap>
                                                    <NTag 
                                                        v-for="tag in (typeof previewHistory.tags === 'string' ? previewHistory.tags.split(',').map(t => t.trim()).filter(t => t) : previewHistory.tags)"
                                                        :key="tag"
                                                        size="small"
                                                    >
                                                        {{ tag }}
                                                    </NTag>
                                                </NFlex>
                                            </div>

                                            <div v-if="previewHistory.changeDescription">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">变更说明</NText>
                                                <NInput :value="previewHistory.changeDescription" readonly />
                                            </div>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>
                </NTabs>
            </div>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <NText depth="3">
                        可以查看历史版本的详细信息，确认后可以回滚到此版本
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="closePreviewModal">关闭</NButton>
                        <NButton type="primary" @click="rollbackToHistory(previewHistory!); closePreviewModal();">
                            回滚到此版本
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, reactive } from "vue";
import {
    NForm,
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
    NDynamicTags,
    NTag,
    NScrollbar,
    NDynamicInput,
    NSplit,
    NTabs,
    NTabPane,
    useMessage,
} from "naive-ui";
import { Plus, Trash, Eye, ArrowBackUp, History } from "@vicons/tabler";
import { api } from "@/lib/api";
import { useWindowSize } from "@/composables/useWindowSize";
import CommonModal from "@/components/common/CommonModal.vue";
import AIModelSelector from "@/components/common/AIModelSelector.vue";
import type { PromptHistory } from "@/lib/db";

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
    show: boolean;
    prompt?: any;
    categories: any[];
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "saved"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();
const formRef = ref();
const contentScrollbarRef = ref(); // 内容区域滚动条引用
const saving = ref(false);
const activeTab = ref("edit");
const historyList = ref<PromptHistory[]>([]);
const loadingHistory = ref(false);
const showPreviewModal = ref(false);
const previewHistory = ref<PromptHistory | null>(null);

// 优化相关状态
const optimizing = ref<string | null>(null);
const modelSelectorRef = ref();
const selectedModelKey = ref("");

// 手动调整状态
const showManualInput = ref(false);
const manualInstruction = ref("");

// 流式传输状态
const streamingContent = ref("");
const isStreaming = ref(false);
const streamStats = reactive({
    charCount: 0,
    isStreaming: false,
    lastCharCount: 0,
    noContentUpdateCount: 0,
    lastUpdateTime: 0,
    isGenerationActive: false,
    contentGrowthRate: 0
});

// 生成控制状态
const generationControl = reactive({
    shouldStop: false,
    abortController: null as AbortController | null
});

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize();

// 防抖相关
const debounceTimer = ref<number | null>(null);
const DEBOUNCE_DELAY = 500; // 500ms 防抖延迟

// 表单数据
const formData = ref({
    title: "",
    description: "",
    content: "",
    categoryId: null,
    tags: [] as string[],
    variables: [] as Variable[],
});

// 计算属性
const isEdit = computed(() => !!props.prompt?.id);

const categoryOptions = computed(() => [
    { label: "无分类", value: null },
    ...props.categories.map((cat) => ({
        label: cat.name,
        value: cat.id,
    })),
]);

const displayTitle = computed(() => {
    if (formData.value.title) {
        return formData.value.title;
    }
    // 如果没有标题，自动生成一个基于内容的简短标题
    if (formData.value.content) {
        const firstLine = formData.value.content.split("\n")[0].trim();
        return firstLine.length > 30
            ? firstLine.substring(0, 30) + "..."
            : firstLine;
    }
    return "未命名提示词";
});

const variableTypeOptions = [
    { label: "文本", value: "text" },
    { label: "选项", value: "select" },
];

// 表单验证规则
const rules = {
    content: {
        required: true,
        message: "请输入提示词内容",
        trigger: "blur, focus",
    },
    tags: {
        trigger: ["change"],
        validator(rule: unknown, value: string[]) {
            if (value.length > 5) {
                return new Error("最多只能添加5个标签");
            }
            return true;
        },
    },
};

// 获取Tab描述文本
const getTabDescription = () => {
    switch (activeTab.value) {
        case "edit":
            return "编写提示词内容并配置变量参数";
        case "info":
            return "完善提示词的基本信息和分类标签";
        case "history":
            return isEdit.value ? "查看提示词的版本历史，支持预览和回滚" : "编写提示词内容并配置变量参数";
        default:
            return "编写提示词内容并配置变量参数";
    }
};

// 重置表单方法
const resetForm = () => {
    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }

    // 重置表单数据到初始状态
    formData.value = {
        title: "",
        description: "",
        content: "",
        categoryId: null,
        tags: [],
        variables: [],
    };
    activeTab.value = "edit";
    historyList.value = [];
    
    // 重置优化状态
    optimizing.value = null;
    isStreaming.value = false;
    streamingContent.value = "";
    generationControl.shouldStop = false;
    
    // 重置手动调整状态
    showManualInput.value = false;
    manualInstruction.value = "";
    
    // 重置流式统计
    Object.assign(streamStats, {
        charCount: 0,
        isStreaming: false,
        lastCharCount: 0,
        noContentUpdateCount: 0,
        lastUpdateTime: 0,
        isGenerationActive: false,
        contentGrowthRate: 0
    });

    // 清理表单验证状态
    nextTick(() => {
        formRef.value?.restoreValidation();
    });
};

// 加载历史记录
const loadHistory = async () => {
    if (!isEdit.value || !props.prompt?.id) {
        historyList.value = [];
        return;
    }

    try {
        loadingHistory.value = true;
        
        // 先检查表是否存在
        const tableExists = await api.promptHistories.checkExists.query();
        if (!tableExists) {
            console.warn("PromptHistories 表不存在，可能是数据库版本问题");
            historyList.value = [];
            return;
        }
        
        historyList.value = await api.promptHistories.getByPromptId.query(props.prompt.id);
    } catch (error) {
        console.error("加载历史记录失败:", error);
        historyList.value = [];
        // 如果是数据库表不存在的错误，不显示用户错误信息
        if (error.name === 'NotFoundError' || error.message.includes('object stores was not found')) {
            console.warn("PromptHistories 表不存在，可能是数据库版本问题");
        } else {
            message.error("加载历史记录失败");
        }
    } finally {
        loadingHistory.value = false;
    }
};

// 创建历史记录
const createHistoryRecord = async (currentPrompt: any) => {
    try {
        const latestVersion = await api.promptHistories.getLatestVersion.query(currentPrompt.id);
        
        const historyData = {
            promptId: currentPrompt.id,
            version: latestVersion + 1,
            title: currentPrompt.title,
            content: currentPrompt.content,
            description: currentPrompt.description,
            categoryId: currentPrompt.categoryId,
            tags: currentPrompt.tags,
            variables: JSON.stringify(currentPrompt.variables || []),
            changeDescription: "编辑更新"
        };

        await api.promptHistories.create.mutate(historyData);
    } catch (error) {
        console.error("创建历史记录失败:", error);
        // 如果是数据库表不存在的错误，静默失败
        if (error.name === 'NotFoundError' || error.message.includes('object stores was not found')) {
            console.warn("PromptHistories 表不存在，跳过历史记录创建");
        } else {
            // 其他错误也不影响主流程，只是记录失败
            console.warn("创建历史记录失败，但不影响主流程");
        }
    }
};

// 停止优化生成
const stopOptimization = async () => {
    console.log('用户请求停止优化生成');
    
    try {
        generationControl.shouldStop = true;
        
        // 调用停止API
        if (window.electronAPI.ai.stopGeneration) {
            await window.electronAPI.ai.stopGeneration();
        }
        
        // 重置状态
        isStreaming.value = false;
        optimizing.value = null;
        generationControl.shouldStop = false;
        
        message.info('已停止优化生成');
    } catch (error) {
        console.error('停止优化失败:', error);
        message.error('停止优化失败');
    }
};

// 启动流式生成
const startStreamingGeneration = async (request: any, serializedConfig: any) => {
    let result;
    
    // 检查是否支持流式传输
    if (window.electronAPI.ai.generatePromptStream) {
        console.log('使用流式传输模式');
        
        // 使用流式传输
        result = await window.electronAPI.ai.generatePromptStream(
            request,
            serializedConfig,
            (charCount: number, partialContent?: string) => {
                // 检查是否应该停止
                if (generationControl.shouldStop) {
                    console.log('检测到停止信号，中断流式优化');
                    return false; // 返回 false 表示停止流式传输
                }
                
                const now = Date.now();
                console.log('优化流式传输回调:', {
                    charCount,
                    hasContent: !!partialContent,
                    contentLength: partialContent?.length || 0,
                    timeSinceLastUpdate: now - streamStats.lastUpdateTime
                });

                // 更新时间统计
                const prevCharCount = streamStats.charCount;
                const prevUpdateTime = streamStats.lastUpdateTime;
                streamStats.charCount = charCount;
                streamStats.lastUpdateTime = now;
                
                // 计算内容增长速率
                if (prevUpdateTime > 0 && charCount > prevCharCount) {
                    const timeDiff = (now - prevUpdateTime) / 1000;
                    const charDiff = charCount - prevCharCount;
                    streamStats.contentGrowthRate = timeDiff > 0 ? charDiff / timeDiff : 0;
                }

                // 检测是否有真实内容
                const hasRealContent = typeof partialContent === 'string' && partialContent.length > 0;
                
                // 判断生成是否活跃
                streamStats.isGenerationActive = hasRealContent || 
                    (charCount > prevCharCount && (now - prevUpdateTime) < 2000);

                if (hasRealContent) {
                    // 有真实内容时直接更新输入框
                    formData.value.content = partialContent;
                    streamingContent.value = partialContent;
                    streamStats.noContentUpdateCount = 0;
                    console.log('✅ 优化内容已更新，当前长度:', partialContent.length);
                } else {
                    // 没有内容时的处理
                    streamStats.noContentUpdateCount++;
                    
                    if (charCount > prevCharCount) {
                        // 字符数在增长，说明正在生成
                        const placeholderText = `正在优化中... (已生成 ${charCount} 字符)`;
                        if (streamStats.noContentUpdateCount > 3 && !streamingContent.value) {
                            streamingContent.value = placeholderText;
                            console.log('📝 显示优化占位符:', placeholderText);
                        }
                    }
                }

                return true; // 继续生成
            }
        );
        
        console.log('流式传输完成，最终结果:', {
            success: !!result,
            contentLength: result?.generatedPrompt?.length || 0
        });

        // 如果流式传输过程中没有获得内容，但最终结果有内容，则立即显示
        if (result && result.generatedPrompt &&
            (!formData.value.content || formData.value.content.startsWith('正在优化中...'))) {
            console.log('🔧 流式传输未提供内容，使用最终结果');
            formData.value.content = result.generatedPrompt;
            streamingContent.value = result.generatedPrompt;
        }
    } else {
        console.log('使用普通生成模式');
        // 使用普通生成
        result = await window.electronAPI.ai.generatePrompt(request, serializedConfig);
        
        // 模拟流式更新
        if (result?.generatedPrompt) {
            const content = result.generatedPrompt;
            const totalChars = content.length;
            const steps = Math.min(30, totalChars);
            const stepSize = Math.ceil(totalChars / steps);
            
            for (let i = 0; i < steps; i++) {
                if (generationControl.shouldStop) break;
                
                const currentCharCount = Math.min((i + 1) * stepSize, totalChars);
                const partialContent = content.substring(0, currentCharCount);
                
                streamStats.charCount = currentCharCount;
                formData.value.content = partialContent;
                streamingContent.value = partialContent;
                
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // 确保显示完整内容
            formData.value.content = content;
            streamingContent.value = content;
        }
    }
    
    return result;
};

// 优化提示词功能（支持流式传输）
const optimizePrompt = async (type: 'shorter' | 'richer' | 'general' | 'extract') => {
    if (!formData.value.content.trim()) {
        message.warning("请先输入提示词内容");
        return;
    }

    const selectedConfig = modelSelectorRef.value?.selectedConfig;
    const selectedModel = modelSelectorRef.value?.selectedModel;

    if (!selectedConfig) {
        message.warning("没有可用的AI配置，请先在AI配置页面添加配置");
        return;
    }

    if (!selectedModel) {
        message.error("请选择一个模型");
        return;
    }

    // 重置状态
    optimizing.value = type;
    isStreaming.value = true;
    generationControl.shouldStop = false;
    streamingContent.value = "";
    
    // 重置流式统计
    Object.assign(streamStats, {
        charCount: 0,
        isStreaming: true,
        lastCharCount: 0,
        noContentUpdateCount: 0,
        lastUpdateTime: Date.now(),
        isGenerationActive: true,
        contentGrowthRate: 0
    });

    // 保存原始内容，以便出错时恢复
    const originalContent = formData.value.content;

    try {
        console.log("开始流式优化提示词:", type, formData.value.content);
        
        // 构建优化指令
        let optimizationPrompt = "";
        switch (type) {
            case 'shorter':
                optimizationPrompt = `请将以下提示词优化得更加简短和精炼，保留核心要求，去除冗余内容：\n\n${formData.value.content}`;
                break;
            case 'richer':
                optimizationPrompt = `请将以下提示词优化得更加丰富和详细，添加更多具体的要求和细节：\n\n${formData.value.content}`;
                break;
            case 'general':
                optimizationPrompt = `请将以下提示词优化得更加通用，适用于更广泛的场景和用途：\n\n${formData.value.content}`;
                break;
            case 'extract':
                optimizationPrompt = `请分析以下提示词，将其中可以变化的部分提取为变量，使用 {{变量名}} 的格式标记：\n\n${formData.value.content}`;
                break;
        }
        
        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map(m => String(m)) : [],
            defaultModel: selectedConfig.defaultModel ? String(selectedConfig.defaultModel) : '',
            customModel: selectedConfig.customModel ? String(selectedConfig.customModel) : '',
            enabled: Boolean(selectedConfig.enabled),
            systemPrompt: selectedConfig.systemPrompt ? String(selectedConfig.systemPrompt) : '',
            createdAt: selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: selectedConfig.updatedAt ? selectedConfig.updatedAt.toISOString() : new Date().toISOString()
        };

        // 构建请求参数
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(optimizationPrompt),
            customPrompt: String(optimizationPrompt),
            model: String(selectedModel)
        };

        console.log("流式优化请求参数:", request);
        console.log("配置参数:", serializedConfig);

        // 创建 AbortController 用于取消请求
        generationControl.abortController = new AbortController();

        // 启动流式传输监听
        await startStreamingGeneration(request, serializedConfig);
        
        // 如果是提取变量类型，立即重新提取变量
        if (type === 'extract') {
            nextTick(() => {
                extractVariables(formData.value.content);
            });
        }
        
        message.success(`提示词已优化（${getOptimizationTypeName(type)}）`);

    } catch (error) {
        console.error("优化失败:", error);
        message.error("优化失败: " + (error.message || "未知错误"));
        
        // 出错时恢复原始内容
        formData.value.content = originalContent;
    } finally {
        // 重置所有状态
        optimizing.value = null;
        isStreaming.value = false;
        generationControl.shouldStop = false;
        streamingContent.value = "";
        streamStats.isStreaming = false;
        streamStats.isGenerationActive = false;
        generationControl.abortController = null;
    }
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
const applyManualAdjustment = async () => {
    if (!manualInstruction.value.trim()) {
        message.warning("请输入调整指令");
        return;
    }
    
    if (!formData.value.content.trim()) {
        message.warning("请先输入提示词内容");
        return;
    }

    const selectedConfig = modelSelectorRef.value?.selectedConfig;
    const selectedModel = modelSelectorRef.value?.selectedModel;

    if (!selectedConfig) {
        message.warning("没有可用的AI配置，请先在AI配置页面添加配置");
        return;
    }

    if (!selectedModel) {
        message.error("请选择一个模型");
        return;
    }

    // 重置状态
    optimizing.value = 'manual';
    isStreaming.value = true;
    generationControl.shouldStop = false;
    streamingContent.value = "";
    
    // 立即隐藏手动调整输入框并向上滚动
    hideManualAdjustment();
    nextTick(() => {
        if (contentScrollbarRef.value) {
            contentScrollbarRef.value.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    // 重置流式传输统计
    streamStats.charCount = 0;
    streamStats.isStreaming = true;
    streamStats.lastCharCount = 0;
    streamStats.noContentUpdateCount = 0;
    streamStats.lastUpdateTime = Date.now();
    streamStats.isGenerationActive = true;
    streamStats.contentGrowthRate = 0;

    try {
        console.log("开始手动调整提示词:", manualInstruction.value, formData.value.content);
        
        // 构建手动调整指令，包含原有提示词
        const adjustmentPrompt = `请根据以下调整指令来改进提示词。

原有提示词：
${formData.value.content}

调整指令：
${manualInstruction.value.trim()}

请输出改进后的完整提示词内容：`;
        
        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map(m => String(m)) : [],
            defaultModel: selectedConfig.defaultModel ? String(selectedConfig.defaultModel) : '',
            customModel: selectedConfig.customModel ? String(selectedConfig.customModel) : '',
            enabled: Boolean(selectedConfig.enabled),
            systemPrompt: selectedConfig.systemPrompt ? String(selectedConfig.systemPrompt) : '',
            createdAt: selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: selectedConfig.updatedAt ? selectedConfig.updatedAt.toISOString() : new Date().toISOString()
        };

        // 构建请求参数
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(adjustmentPrompt),
            customPrompt: String(adjustmentPrompt),
            model: String(selectedModel)
        };

        console.log("手动调整请求参数:", request);
        console.log("配置参数:", serializedConfig);

        // 创建 AbortController 用于取消请求
        generationControl.abortController = new AbortController();

        // 启动流式传输监听
        await startStreamingGeneration(request, serializedConfig);
        
        message.success("提示词已根据指令调整完成");

    } catch (error) {
        console.error("手动调整失败:", error);
        if (error.name === 'AbortError') {
            message.info("手动调整已取消");
        } else {
            message.error("手动调整失败: " + (error.message || "未知错误"));
        }
    } finally {
        optimizing.value = null;
        isStreaming.value = false;
        streamStats.isStreaming = false;
        streamStats.isGenerationActive = false;
        generationControl.abortController = null;
    }
};

// 获取优化类型名称
const getOptimizationTypeName = (type: string) => {
    switch (type) {
        case 'shorter': return '更简短';
        case 'richer': return '更丰富';
        case 'general': return '更通用';
        case 'extract': return '提取变量';
        case 'manual': return '手动调整';
        default: return '优化';
    }
};

// 格式化日期
const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};
const getContentPreview = (content: string) => {
    return content.length > 100 ? content.substring(0, 100) + "..." : content;
};

// 解析预览变量
const getPreviewVariables = (variables: string | any[]) => {
    try {
        if (typeof variables === 'string') {
            return JSON.parse(variables) || [];
        }
        return Array.isArray(variables) ? variables : [];
    } catch (error) {
        console.error("解析变量配置失败:", error);
        return [];
    }
};

// 预览历史版本
const openPreviewHistory = (history: PromptHistory) => {
    previewHistory.value = history;
    showPreviewModal.value = true;
};

// 关闭预览模态框
const closePreviewModal = () => {
    showPreviewModal.value = false;
    previewHistory.value = null;
};

// 回滚到历史版本
const rollbackToHistory = (history: PromptHistory) => {
    try {
        formData.value = {
            title: history.title,
            description: history.description || "",
            content: history.content,
            categoryId: history.categoryId || null,
            tags: history.tags
                ? typeof history.tags === "string"
                    ? history.tags.split(",").map((t) => t.trim()).filter((t) => t)
                    : history.tags
                : [],
            variables: history.variables
                ? JSON.parse(history.variables)
                : [],
        };
        
        // 切换到编辑Tab
        activeTab.value = "edit";
        
        message.success(`已回滚到版本 ${history.version}`);
    } catch (error) {
        console.error("回滚失败:", error);
        message.error("回滚失败");
    }
};

// 获取分类名称
const getCategoryName = (categoryId: any) => {
    if (!categoryId) return "无分类";
    const category = props.categories.find((cat) => cat.id === categoryId);
    return category?.name || "未知分类";
};

// 提取变量的方法 - 优化版本：去重并只保留实际存在的变量
const extractVariables = (content: string) => {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const matches = content.match(variableRegex);

    // 提取当前内容中的所有变量名
    const currentVariableNames = new Set<string>();
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
    formData.value.variables.forEach((variable) => {
        if (variable.name) {
            existingVariableConfigs.set(variable.name, variable);
        }
    });

    // 重新构建变量列表：只包含当前内容中实际存在的变量
    formData.value.variables = Array.from(currentVariableNames).map(
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

// 自动生成标题的函数
const generateAutoTitle = () => {
    if (!formData.value.content) return "";

    const firstLine = formData.value.content.split("\n")[0].trim();
    if (firstLine.length > 30) {
        return firstLine.substring(0, 30) + "...";
    }
    return firstLine || `提示词 ${new Date().toLocaleString()}`;
};

// 监听 prompt 变化，初始化表单
watch(
    () => props.prompt,
    (newPrompt) => {
        if (newPrompt) {
            // 有 prompt 数据，初始化为编辑模式
            formData.value = {
                title: newPrompt.title || "",
                description: newPrompt.description || "",
                content: newPrompt.content || "",
                categoryId: newPrompt.categoryId || null,
                tags: newPrompt.tags
                    ? typeof newPrompt.tags === "string"
                        ? newPrompt.tags
                            .split(",")
                            .map((t) => t.trim())
                            .filter((t) => t)
                        : newPrompt.tags
                    : [],
                variables:
                    newPrompt.variables?.map((v) => ({
                        name: v.name || "",
                        label: v.label || "",
                        type: v.type || "text",
                        options: Array.isArray(v.options)
                            ? v.options
                            : typeof v.options === "string"
                                ? v.options
                                    .split(",")
                                    .map((opt) => opt.trim())
                                    .filter((opt) => opt)
                                : [],
                        defaultValue: v.defaultValue || "",
                        required: v.required !== false,
                        placeholder: v.placeholder || "",
                    })) || [],
            };

            // 如果有内容但没有变量配置，立即提取变量
            if (
                newPrompt.content &&
                (!newPrompt.variables || newPrompt.variables.length === 0)
            ) {
                nextTick(() => {
                    extractVariables(newPrompt.content);
                });
            }
            
            // 加载历史记录
            loadHistory();
        } else {
            // 没有 prompt 数据，重置为新建模式
            resetForm();
            // 在新建模式下，确保当前tab不是历史记录
            if (activeTab.value === 'history') {
                activeTab.value = 'edit';
            }
        }
    },
    { immediate: true }
);

// 监听弹窗显示状态
watch(
    () => props.show,
    (newShow, oldShow) => {
        if (newShow && !oldShow) {
            // 弹窗从隐藏变为显示时
            activeTab.value = "edit";
            
            // 使用 nextTick 确保 props.prompt 已经正确传递
            nextTick(() => {
                // 只有在确实没有 prompt 且不是编辑模式时才重置表单
                if (!props.prompt && !isEdit.value) {
                    resetForm();
                }
            });
        }
        if (oldShow && !newShow) {
            // 弹窗从显示变为隐藏时，清理定时器
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            
            // 重置优化状态
            optimizing.value = null;
            isStreaming.value = false;
            streamingContent.value = "";
            generationControl.shouldStop = false;
            
            // 重置手动调整状态
            showManualInput.value = false;
            manualInstruction.value = "";

            // 延迟重置表单，确保弹窗完全关闭后再重置
            setTimeout(() => {
                if (!props.show) {
                    resetForm();
                }
            }, 200);
        }
    }
);

// 监听内容变化，自动提取变量（使用防抖）
watch(
    () => formData.value.content,
    (newContent) => {
        if (newContent) {
            debouncedExtractVariables(newContent);
        } else {
            // 如果内容为空，立即清空变量列表
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            formData.value.variables = [];
        }
    }
);

// 监听变量类型变化，清理不匹配的默认值
watch(
    () => formData.value.variables,
    (newVariables) => {
        newVariables.forEach((variable) => {
            // 当变量类型为选项时，检查默认值是否在选项中
            if (variable.type === "select" && variable.defaultValue) {
                if (!variable.options || !variable.options.includes(variable.defaultValue)) {
                    variable.defaultValue = "";
                }
            }
            // 当变量类型为文本且选项不为空时，清空选项
            if (
                variable.type === "text" &&
                variable.options &&
                variable.options.length > 0
            ) {
                variable.options = [];
            }
            // 当变量类型切换到选项但没有选项时，提供默认选项
            if (
                variable.type === "select" &&
                (!Array.isArray(variable.options) || variable.options.length === 0)
            ) {
                variable.options = ["选项1", "选项2"];
            }
        });
    },
    { deep: true }
);

// 生成唯一变量名的辅助方法
const generateUniqueVariableName = () => {
    const existingNames = new Set(formData.value.variables.map((v) => v.name));
    let counter = 1;
    let variableName = `变量${counter}`;

    while (existingNames.has(variableName)) {
        counter++;
        variableName = `变量${counter}`;
    }

    return variableName;
};

// 获取变量默认值选项
const getVariableDefaultOptions = (options) => {
    if (!Array.isArray(options) || options.length === 0) return [];
    return options
        .filter((opt) => opt && opt.trim())
        .map((option) => ({
            label: option,
            value: option,
        }));
};

// 方法
const addVariable = () => {
    const variableName = generateUniqueVariableName();

    // 添加变量配置
    formData.value.variables.push({
        name: variableName,
        label: variableName,
        type: "text",
        options: [],
        defaultValue: "",
        required: true,
        placeholder: "",
    });

    // 在左侧内容中自动添加对应的占位符
    const placeholder = `{{${variableName}}}`;

    // 如果内容为空，直接添加占位符
    if (!formData.value.content.trim()) {
        formData.value.content = placeholder;
    } else {
        // 如果内容不为空，在末尾添加占位符（换行后添加）
        const content = formData.value.content.trim();
        formData.value.content = content + "\n" + placeholder;
    }
};

const removeVariable = (index: number) => {
    formData.value.variables.splice(index, 1);
};

const handleCancel = () => {
    // 取消时清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }
    
    // 重置优化和流式传输状态
    optimizing.value = null;
    isStreaming.value = false;
    streamingContent.value = "";
    generationControl.shouldStop = true; // 如果正在生成，停止生成
    
    // 重置手动调整状态
    showManualInput.value = false;
    manualInstruction.value = "";

    emit("update:show", false);
};

const handleSave = async () => {
    try {
        await formRef.value?.validate();
        saving.value = true;

        // 自动生成标题（如果没有填写）
        let finalTitle = formData.value.title;
        if (!finalTitle) {
            finalTitle = generateAutoTitle();
        }

        // 检查标题是否重复，如果重复则自动添加时间戳
        try {
            const response = await api.prompts.getAll.query({ search: finalTitle });
            const existingPrompts = Array.isArray(response)
                ? response
                : response?.data || [];

            let duplicatePrompt = existingPrompts.find(
                (p) =>
                    p.title === finalTitle && (!isEdit.value || p.id !== props.prompt?.id)
            );

            // 如果标题重复，自动添加时间戳
            if (duplicatePrompt) {
                const timestamp = new Date()
                    .toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    })
                    .replace(/[/:]/g, "-")
                    .replace(/,?\s+/g, "_");

                finalTitle = `${finalTitle}_${timestamp}`;

                // 再次检查新标题是否重复（极低概率）
                const newCheck = existingPrompts.find(
                    (p) =>
                        p.title === finalTitle &&
                        (!isEdit.value || p.id !== props.prompt?.id)
                );

                // 如果还是重复，添加随机后缀
                if (newCheck) {
                    const randomSuffix = Math.random().toString(36).substring(2, 8);
                    finalTitle = `${finalTitle}_${randomSuffix}`;
                }
            }
        } catch (error) {
            console.error("检查标题重复时出错:", error);
            // 继续执行，不因为标题检查失败而中断保存流程
        }

        const data = {
            title: finalTitle,
            description: formData.value.description || undefined,
            content: formData.value.content,
            categoryId: formData.value.categoryId || undefined,
            tags:
                formData.value.tags.length > 0
                    ? formData.value.tags.join(",")
                    : undefined,
            variables: formData.value.variables
                .filter((v) => v.name && v.label)
                .map((v) => ({
                    name: v.name,
                    label: v.label,
                    type: v.type,
                    options:
                        v.type === "select" &&
                            Array.isArray(v.options) &&
                            v.options.length > 0
                            ? v.options.filter((opt) => opt.trim())
                            : undefined,
                    defaultValue: v.defaultValue || undefined,
                    required: v.required,
                    placeholder: v.placeholder || undefined,
                })),
        };

        if (isEdit.value) {
            // 编辑模式：先创建历史记录，再更新
            await createHistoryRecord(props.prompt);
            
            await api.prompts.update.mutate({
                id: props.prompt.id,
                data,
            });
            message.success("提示词更新成功");
            
            // 重新加载历史记录
            loadHistory();
        } else {
            await api.prompts.create.mutate(data);
            message.success("提示词创建成功");
        }

        // 立即发送 saved 事件，通知父组件刷新数据
        emit("saved");

        // 短暂延迟后关闭弹窗，确保数据已经刷新
        setTimeout(() => {
            emit("update:show", false);
            // 额外的安全措施：如果是新建模式，确保表单被重置
            if (!isEdit.value) {
                nextTick(() => {
                    resetForm();
                });
            }
        }, 100);
    } catch (error) {
        message.error(isEdit.value ? "更新失败" : "创建失败");
        console.error(error);
    } finally {
        saving.value = false;
    }
};

// 组件卸载时的清理
onBeforeUnmount(() => {
    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }
});
</script>

<style scoped></style>
