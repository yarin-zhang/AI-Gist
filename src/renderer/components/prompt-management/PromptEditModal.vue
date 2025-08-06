<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleCancel">
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex vertical>
                <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                    {{ isEdit ? t('promptManagement.edit') : t('promptManagement.create') }}
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
                    <NTabPane name="edit" :tab="t('promptManagement.edit')">
                        <!-- 常规模式编辑器 -->
                        <RegularPromptEditor v-if="!isJinjaEnabled" :content="formData.content"
                            :variables="formData.variables" :content-height="contentHeight"
                            :quick-optimization-configs="quickOptimizationConfigs" :optimizing="optimizing"
                            :is-streaming="isStreaming" :stream-stats="streamStats" @update:content="updateContent"
                            @update:variables="updateVariables" @optimize-prompt="optimizePrompt"
                            @stop-optimization="stopOptimization"
                            @open-quick-optimization-config="openQuickOptimizationConfig"
                            @manual-adjustment="applyManualAdjustment" ref="regularEditorRef" />

                        <!-- Jinja模式编辑器 -->
                        <JinjaPromptEditor v-else :content="formData.content" :variables="formData.variables"
                            :content-height="contentHeight" :quick-optimization-configs="quickOptimizationConfigs"
                            :optimizing="optimizing" :is-streaming="isStreaming" :stream-stats="streamStats"
                            @update:content="updateContent" @update:variables="updateVariables"
                            @optimize-prompt="optimizePrompt" @stop-optimization="stopOptimization"
                            @open-quick-optimization-config="openQuickOptimizationConfig"
                            @manual-adjustment="applyManualAdjustment" ref="jinjaEditorRef" />
                    </NTabPane>

                    <!-- 补充信息 Tab -->
                    <NTabPane name="info" :tab="t('promptManagement.info')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }"
                            :default-size="0.6" :min="0.3" :max="0.8" :disabled="modalWidth <= 800">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard :title="t('promptManagement.basicInfo')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem :label="t('promptManagement.title')" path="title">
                                                <NInput v-model:value="formData.title"
                                                    :placeholder="t('promptManagement.titlePlaceholder')" />
                                            </NFormItem>

                                            <NFormItem :label="t('promptManagement.description')" path="description">
                                                <NInput v-model:value="formData.description" type="textarea"
                                                    :placeholder="t('promptManagement.descriptionPlaceholder')"
                                                    :rows="6" />
                                            </NFormItem>

                                            <NFormItem :label="t('promptManagement.image')" path="imageUrl">
                                                <NUpload 
                                                    v-model:file-list="imageFileList" 
                                                    :max="5"
                                                    list-type="image-card" 
                                                    accept="image/*"
                                                    :on-before-upload="handleBeforeUpload"
                                                    :on-remove="handleRemoveImage" 
                                                    :custom-request="handleCustomRequest"
                                                    :show-preview-button="true" 
                                                    :show-remove-button="true"
                                                    :show-retry-button="false" 
                                                    :show-cancel-button="false"
                                                    :disabled="saving" 
                                                    :multiple="true" 
                                                    :drag="true"
                                                    :show-file-list="true" 
                                                    :show-upload-button="true"
                                                    :show-download-button="false"
                                                    :preview-file="handlePreviewFile"
                                                    :on-preview="handlePreviewImage"
                                                    :default-file-list="imageFileList">
                                                    <NUploadDragger>
                                                        <NText style="font-size: 8px">
                                                            {{ t('promptManagement.uploadImage') }}
                                                        </NText>
                                                    </NUploadDragger>
                                                </NUpload>
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：分类与标签 -->
                            <template #2>
                                <NCard :title="t('promptManagement.categoryAndTags')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem :label="t('promptManagement.category')">
                                                <NSelect v-model:value="formData.categoryId" :options="categoryOptions"
                                                    :placeholder="t('promptManagement.categoryPlaceholder')"
                                                    clearable />
                                            </NFormItem>
                                            <NFormItem :label="t('promptManagement.tags')" path="tags">
                                                <NDynamicTags v-model:value="formData.tags"
                                                    :placeholder="t('promptManagement.tagsPlaceholder')" :max="5" />
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 历史记录 Tab - 仅在编辑模式下显示 -->
                    <NTabPane v-if="isEdit" name="history" :tab="t('promptManagement.history')">
                        <NCard :title="t('promptManagement.versionHistory')" size="small">
                            <NScrollbar :style="{ height: `${contentHeight - 150}px` }">
                                <!-- 加载状态 -->
                                <div v-if="loadingHistory"
                                    style="display: flex; justify-content: center; align-items: center; height: 200px;">
                                    <NSpin size="medium">
                                        <template #description>
                                            <NText depth="3">{{ t('promptManagement.loadingHistory') }}</NText>
                                        </template>
                                    </NSpin>
                                </div>

                                <!-- 历史记录列表 -->
                                <NFlex vertical size="medium" style="padding-right: 12px;"
                                    v-else-if="historyList.length > 0">
                                    <NCard v-for="(history, index) in historyList" :key="history.id" size="small">
                                        <template #header>
                                            <NFlex justify="space-between" align="center">
                                                <NFlex align="center" size="small">
                                                    <NText strong>{{ t('promptManagement.version') }} {{ history.version
                                                    }}</NText>
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
                                                        {{ t('promptManagement.preview') }}
                                                    </NButton>
                                                    <NButton size="small" type="primary"
                                                        @click="rollbackToHistory(history)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <ArrowBackUp />
                                                            </NIcon>
                                                        </template>
                                                        {{ t('promptManagement.rollback') }}
                                                    </NButton>
                                                </NFlex>
                                            </NFlex>
                                        </template>
                                        <NFlex vertical size="small">
                                            <NText depth="3">{{ history.title }}</NText>
                                            <NText depth="3" v-if="history.changeDescription">
                                                {{ t('promptManagement.changeDescription') }}: {{
                                                    history.changeDescription }}
                                            </NText>
                                            <NText depth="3" style="font-size: 12px;">
                                                {{ t('promptManagement.contentPreview') }}: {{
                                                    getContentPreview(history.content) }}
                                            </NText>
                                        </NFlex>
                                    </NCard>
                                </NFlex>
                                <!-- 空状态 -->
                                <NEmpty v-else :description="t('promptManagement.noHistory')" size="small">
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
                    <!-- 左侧区域：模式切换按钮和提示信息 -->
                    <NFlex align="center" size="small">
                        <!-- 模式切换按钮 - 仅在编辑Tab时显示 -->
                        <NFlex v-if="activeTab === 'edit'" size="small">
                            <NButton :type="!isJinjaEnabled ? 'primary' : 'default'" @click="switchToRegularMode"
                                :disabled="isStreaming || optimizing !== null">
                                <template #icon>
                                    <NIcon>
                                        <Code />
                                    </NIcon>
                                </template>
                                {{ t('promptManagement.regularMode') }}
                            </NButton>
                            <NButton :type="isJinjaEnabled ? 'primary' : 'default'" @click="switchToJinjaMode"
                                :disabled="isStreaming || optimizing !== null">
                                <template #icon>
                                    <NIcon>
                                        <Code />
                                    </NIcon>
                                </template>
                                {{ t('promptManagement.jinjaMode') }}
                            </NButton>
                        </NFlex>

                        <!-- 显示当前活动的tab信息 -->
                        <NText depth="3" v-if="activeTab === 'history' && isEdit">
                            {{ t('promptManagement.historyDescription') }}
                        </NText>
                    </NFlex>
                </div>
                <div>
                    <!-- 右侧区域 -->
                    <NFlex size="small">
                        <NButton @click="handleCancel">{{ t('common.cancel') }}</NButton>
                        <NButton type="primary" @click="handleSave" :loading="saving"
                            :disabled="!formData.content.trim()">
                            {{ isEdit ? t('promptManagement.update') : t('promptManagement.create') }}
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
                {{ t('promptManagement.historyVersionPreview', { version: previewHistory?.version }) }}
            </NText>
            <NText depth="3">
                {{ formatDate(previewHistory?.createdAt || new Date()) }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <div v-if="previewHistory" :style="{ height: `${contentHeight}px`, overflow: 'hidden' }">
                <NTabs type="segment" :style="{ height: '100%' }">
                    <!-- 内容与变量 Tab -->
                    <NTabPane name="content" :tab="t('promptManagement.contentAndVariables')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }"
                            :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：提示词内容 -->
                            <template #1>
                                <NCard :title="t('promptManagement.promptContent')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NInput :value="previewHistory.content" type="textarea" readonly :style="{
                                                height: `${contentHeight - 180}px`,
                                                fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace'
                                            }" :autosize="false" />
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：变量配置 -->
                            <template #2>
                                <NCard :title="t('promptManagement.variableConfig')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NFlex vertical size="medium"
                                                v-if="getPreviewVariables(previewHistory.variables).length > 0">
                                                <NCard
                                                    v-for="(variable, index) in getPreviewVariables(previewHistory.variables)"
                                                    :key="index" size="small">
                                                    <template #header>
                                                        <NText strong>{{ variable.name }}</NText>
                                                    </template>
                                                    <NFlex vertical size="small">
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.variableLabel') }}</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.name }}</NText>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.variableType') }}</NText>
                                                            </div>
                                                            <NTag size="small"
                                                                :type="variable.type === 'text' ? 'default' : 'info'">
                                                                {{ variable.type === 'text' ? t('promptManagement.text')
                                                                    : t('promptManagement.select') }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.variableRequired') }}</NText>
                                                            </div>
                                                            <NTag size="small"
                                                                :type="variable.required ? 'error' : 'success'">
                                                                {{ variable.required ? t('common.yes') : t('common.no')
                                                                }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex v-if="variable.defaultValue">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.variableDefault') }}</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.defaultValue }}
                                                            </NText>
                                                        </NFlex>
                                                        <NFlex v-if="variable.placeholder">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.placeholder') }}</NText>
                                                            </div>
                                                            <NText depth="3" style="font-size: 12px;">{{
                                                                variable.placeholder }}</NText>
                                                        </NFlex>
                                                        <NFlex
                                                            v-if="variable.type === 'select' && variable.options && variable.options.length > 0">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{
                                                                    t('promptManagement.variableOptions') }}</NText>
                                                            </div>
                                                            <NFlex size="small" wrap>
                                                                <NTag v-for="option in variable.options" :key="option"
                                                                    size="small">
                                                                    {{ option }}
                                                                </NTag>
                                                            </NFlex>
                                                        </NFlex>
                                                    </NFlex>
                                                </NCard>
                                            </NFlex>
                                            <NEmpty v-else :description="t('promptManagement.noVariablesInVersion')"
                                                size="small">
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
                    <NTabPane name="info" :tab="t('promptManagement.additionalInfo')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }"
                            :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard :title="t('promptManagement.basicInfo')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div>
                                                <NText depth="3"
                                                    style="font-size: 12px; margin-bottom: 4px; display: block;">{{
                                                        t('promptManagement.historyTitle') }}</NText>
                                                <NInput :value="previewHistory.title" readonly />
                                            </div>

                                            <div v-if="previewHistory.description">
                                                <NText depth="3"
                                                    style="font-size: 12px; margin-bottom: 4px; display: block;">{{
                                                        t('promptManagement.description') }}</NText>
                                                <NInput :value="previewHistory.description" type="textarea" readonly
                                                    :rows="8" />
                                            </div>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：变更记录说明 -->
                            <template #2>
                                <NCard :title="t('promptManagement.historyChangeDescription')" size="small"
                                    :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div v-if="previewHistory.categoryId">
                                                <NText depth="3"
                                                    style="font-size: 12px; margin-bottom: 4px; display: block;">{{
                                                        t('promptManagement.category') }}</NText>
                                                <NInput :value="getCategoryName(previewHistory.categoryId)" readonly />
                                            </div>

                                            <div v-if="previewHistory.tags">
                                                <NText depth="3"
                                                    style="font-size: 12px; margin-bottom: 8px; display: block;">{{
                                                        t('promptManagement.tags') }}</NText>
                                                <NFlex size="small" wrap>
                                                    <NTag
                                                        v-for="tag in (typeof previewHistory.tags === 'string' ? previewHistory.tags.split(',').map(t => t.trim()).filter(t => t) : previewHistory.tags)"
                                                        :key="tag" size="small">
                                                        {{ tag }}
                                                    </NTag>
                                                </NFlex>
                                            </div>

                                            <div>
                                                <NText depth="3"
                                                    style="font-size: 12px; margin-bottom: 4px; display: block;">{{
                                                        t('promptManagement.changeDescription') }}</NText>
                                                <NFlex align="center" size="small">
                                                    <NInput v-model:value="editingChangeDescription"
                                                        :placeholder="t('promptManagement.changeDescriptionPlaceholder')"
                                                        style="flex: 1;" :disabled="savingChangeDescription" />
                                                    <NButton size="small" type="primary"
                                                        :loading="savingChangeDescription"
                                                        @click="saveChangeDescription">
                                                        {{ t('common.save') }}
                                                    </NButton>
                                                    <NButton size="small" @click="cancelEditChangeDescription">
                                                        {{ t('common.cancel') }}
                                                    </NButton>
                                                </NFlex>
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
                        {{ t('promptManagement.historyPreviewDesc') }}
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="closePreviewModal">{{ t('common.close') }}</NButton>
                        <NButton type="primary" @click="rollbackToHistory(previewHistory!); closePreviewModal();">
                            {{ t('promptManagement.rollbackToVersion') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 图片预览模态框 -->
    <CommonModal :show="showImagePreview" @update:show="showImagePreview = false" @close="showImagePreview = false">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ t('promptManagement.imagePreview') }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <div :style="{ height: `${contentHeight}px`, display: 'flex', justifyContent: 'center', alignItems: 'center' }">
                <NImage
                    :src="currentPreviewImage"
                    :style="{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }"
                    :preview-disabled="false"
                    :show-toolbar="true"
                    :show-close-button="true"
                    :show-download-button="true"
                    :show-rotate-button="true"
                    :show-zoom-button="true"
                    :show-reset-button="true"
                />
            </div>
        </template>

        <template #footer>
            <NFlex justify="center">
                <NButton @click="showImagePreview = false">
                    {{ t('common.close') }}
                </NButton>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, reactive } from "vue";
import { useI18n } from 'vue-i18n'
import type { UploadFileInfo } from 'naive-ui'
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
    NTooltip,
    NSpin,
    NUpload,
    NUploadDragger,
    NImage,
    NP,
    useMessage,
} from "naive-ui";
import { Plus, Trash, Eye, ArrowBackUp, History, Settings, Code, Photo } from "@vicons/tabler";
import { api } from "@/lib/api";
import { useWindowSize } from "@/composables/useWindowSize";
import CommonModal from "@/components/common/CommonModal.vue";
import AIModelSelector from "@/components/common/AIModelSelector.vue";
import RegularPromptEditor from "@/components/prompt-management/RegularPromptEditor.vue";
import JinjaPromptEditor from "@/components/prompt-management/JinjaPromptEditor.vue";
import type { PromptHistory } from "@/lib/db";
import { jinjaService } from "@/lib/utils/jinja.service";

// 统一变量类型定义
type VariableType = 'str' | 'int' | 'float' | 'bool' | 'list' | 'dict' | 'text' | 'select';

interface Variable {
    name: string;
    type: VariableType;
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
    (e: "open-quick-optimization-config"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n()
const message = useMessage();
const formRef = ref();
const contentScrollbarRef = ref(); // 内容区域滚动条引用
const saving = ref(false);
const activeTab = ref("edit");
const historyList = ref<PromptHistory[]>([]);
const loadingHistory = ref(false);
const showPreviewModal = ref(false);
const previewHistory = ref<PromptHistory | null>(null);
const isInitializing = ref(false); // 防止递归更新的标志

// 编辑变更说明相关状态
const editingChangeDescription = ref("");
const savingChangeDescription = ref(false);

// 优化相关状态
const optimizing = ref<string | null>(null);
const modelSelectorRef = ref();
const selectedModelKey = ref("");
const quickOptimizationConfigs = ref<any[]>([]);

// 手动调整状态现在由子组件处理

// Jinja 模板相关状态
const isJinjaEnabled = ref(false);

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

// 图片上传相关
const imageFileList = ref<UploadFileInfo[]>([]);
const imagePreviewUrl = ref<string>('');
const showImagePreview = ref(false);
const currentPreviewImage = ref<string>('');

// 表单数据
const formData = ref<{
    title: string;
    description: string;
    content: string;
    categoryId: number | null;
    tags: string[];
    variables: Variable[];
    isJinjaTemplate?: boolean;
    imageBlob?: Blob;
}>({
    title: "",
    description: "",
    content: "",
    categoryId: null,
    tags: [],
    variables: [],
    isJinjaTemplate: false,
    imageBlob: undefined,
});

// 计算属性
const isEdit = computed(() => !!props.prompt?.id);

const categoryOptions = computed(() => [
    { label: t('promptManagement.noCategory'), value: null },
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
    return t('promptManagement.untitledPrompt');
});

const variableTypeOptions = [
    { label: t('promptManagement.text'), value: 'text' },
    { label: t('promptManagement.select'), value: 'select' },
];

// 表单验证规则
const rules = {
    content: {
        required: true,
        message: t('promptManagement.contentRequired'),
        trigger: 'blur, focus',
    },
    tags: {
        trigger: ['change'],
        validator(rule: unknown, value: string[]) {
            if (value.length > 5) {
                return new Error(t('promptManagement.maxTagsError'));
            }
            return true;
        },
    },
};

// 获取Tab描述文本
const getTabDescription = () => {
    switch (activeTab.value) {
        case 'edit':
            return t('promptManagement.tabEditDesc');
        case 'info':
            return t('promptManagement.tabInfoDesc');
        case 'history':
            return isEdit.value ? t('promptManagement.tabHistoryDesc') : t('promptManagement.tabEditDesc');
        default:
            return t('promptManagement.tabEditDesc');
    }
};

// 加载快速优化配置
const loadQuickOptimizationConfigs = async () => {
    try {
        quickOptimizationConfigs.value = await api.quickOptimizationConfigs.getEnabled.query();
    } catch (error) {
        console.error("加载快速优化配置失败:", error);
        // 如果加载失败，使用默认配置
        quickOptimizationConfigs.value = [];
    }
};

// 刷新快速优化配置（供外部调用）
const refreshQuickOptimizationConfigs = async () => {
    await loadQuickOptimizationConfigs();
    // 静默刷新，不显示消息
};

// 打开快速优化配置模态窗
const openQuickOptimizationConfig = () => {
    // 通过事件通知父组件打开快速优化配置模态窗
    emit('open-quick-optimization-config');
};

// 重置表单方法
const resetForm = () => {

    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }

    // 设置初始化标志，防止递归更新
    isInitializing.value = true;

    // 清理图片相关数据
    if (imagePreviewUrl.value) {
        URL.revokeObjectURL(imagePreviewUrl.value);
        imagePreviewUrl.value = '';
    }
    // 清理所有图片文件的URL
    imageFileList.value.forEach(file => {
        if (file.url) {
            URL.revokeObjectURL(file.url);
        }
    });
    imageFileList.value = [];

    // 重置表单数据到初始状态
    formData.value = {
        title: "",
        description: "",
        content: "",
        categoryId: null,
        tags: [],
        variables: [],
        isJinjaTemplate: false,
        imageBlob: undefined,
    };
    activeTab.value = "edit";
    historyList.value = [];

    // 重置 Jinja 模式状态
    isJinjaEnabled.value = false;

    // 重置优化状态
    optimizing.value = null;
    isStreaming.value = false;
    streamingContent.value = "";
    generationControl.shouldStop = false;

    // 重置手动调整状态现在由子组件处理

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
        // 重置初始化标志
        isInitializing.value = false;
    });
};

// 加载历史记录
const loadHistory = async () => {
    // 防止递归调用
    if (loadingHistory.value) {
        return;
    }

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
    } catch (error: any) {
        console.error("加载历史记录失败:", error);
        historyList.value = [];
        // 如果是数据库表不存在的错误，静默失败
        if (error.name === 'NotFoundError' || error.message.includes('object stores was not found')) {
            console.warn("PromptHistories 表不存在，跳过历史记录创建");
        } else {
            // 其他错误也不影响主流程，只是记录失败
            console.warn("创建历史记录失败，但不影响主流程");
        }
    } finally {
        loadingHistory.value = false;
    }
};

// 创建历史记录
const createHistoryRecord = async (currentPrompt: any) => {
    try {
        console.log('开始创建历史记录:', {
            promptId: currentPrompt.id,
            title: currentPrompt.title,
            variables: currentPrompt.variables
        });

        const latestVersion = await api.promptHistories.getLatestVersion.query(currentPrompt.id);
        console.log('获取最新版本号:', latestVersion);

        const historyData = {
            promptId: currentPrompt.id,
            version: latestVersion + 1,
            title: currentPrompt.title,
            content: currentPrompt.content,
            description: currentPrompt.description,
            categoryId: currentPrompt.categoryId,
            tags: Array.isArray(currentPrompt.tags) ? currentPrompt.tags.join(',') : currentPrompt.tags,
            variables: JSON.stringify(currentPrompt.variables || []),
            isJinjaTemplate: currentPrompt.isJinjaTemplate || false,
            changeDescription: t('promptManagement.editUpdate'),
            uuid: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date()
        };

        console.log('历史记录数据:', historyData);
        await api.promptHistories.create.mutate(historyData);
        console.log('历史记录创建成功');
    } catch (error: any) {
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
    console.log(t('promptManagement.stopOptimizationLog'));

    try {
        generationControl.shouldStop = true;

        // 调用停止API
        if ((window as any).electronAPI?.ai?.stopGeneration) {
            await (window as any).electronAPI.ai.stopGeneration();
        }

        // 重置状态
        isStreaming.value = false;
        optimizing.value = null;
        generationControl.shouldStop = false;

        message.info(t('promptManagement.optimizationStopped'));
    } catch (error) {
        console.error('停止优化失败:', error);
        message.error(t('promptManagement.stopOptimizationFailed'));
    }
};

// 启动流式生成
const startStreamingGeneration = async (request: any, serializedConfig: any) => {
    let result;

    // 检查是否支持流式传输
    if ((window as any).electronAPI?.ai?.generatePromptStream) {
        console.log(t('promptManagement.streamModeLog'));

        // 使用流式传输
        result = await (window as any).electronAPI.ai.generatePromptStream(
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
                        const placeholderText = `${t('promptManagement.optimizing')} (${t('promptManagement.generatedChars', { count: charCount })})`;
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
        console.log(t('promptManagement.normalModeLog'));
        // 使用普通生成
        result = await (window as any).electronAPI.ai.generatePrompt(request, serializedConfig);

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
const optimizePrompt = async (configId: number) => {
    if (!formData.value.content.trim()) {
        message.warning("请先输入提示词内容");
        return;
    }

    // 根据当前模式获取对应的模型选择器
    const currentEditorRef = isJinjaEnabled.value ? jinjaEditorRef.value : regularEditorRef.value;
    const selectedConfig = currentEditorRef?.modelSelectorRef?.selectedConfig;
    const selectedModel = currentEditorRef?.modelSelectorRef?.selectedModel;

    if (!selectedConfig) {
        message.warning(t('promptManagement.noAIConfigAvailable'));
        return;
    }

    if (!selectedModel) {
        message.error(t('promptManagement.selectModel'));
        return;
    }

    // 查找对应的优化配置
    const optimizationConfig = quickOptimizationConfigs.value.find(c => c.id === configId);
    if (!optimizationConfig) {
        message.error(t('promptManagement.optimizationConfigNotFound'));
        return;
    }

    // 重置状态
    optimizing.value = optimizationConfig.name;
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
        console.log("开始流式优化提示词:", optimizationConfig.name, formData.value.content);

        // 使用配置的提示词模板
        const optimizationPrompt = optimizationConfig.prompt.replace('{{content}}', formData.value.content);

        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map((m: any) => String(m)) : [],
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

        message.success(t('promptManagement.optimizationComplete'));

    } catch (error: any) {
        console.error("优化失败:", error);
        message.error(t('promptManagement.optimizationFailed') + ": " + (error.message || t('common.unknownError')));

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

// 手动调整方法现在由子组件处理

// 应用手动调整
const applyManualAdjustment = async (instruction: string) => {
    if (!instruction.trim()) {
        message.warning(t('promptManagement.enterAdjustmentInstruction'));
        return;
    }

    if (!formData.value.content.trim()) {
        message.warning(t('promptManagement.enterPromptContentFirst'));
        return;
    }

    // 根据当前模式获取对应的模型选择器
    const currentEditorRef = isJinjaEnabled.value ? jinjaEditorRef.value : regularEditorRef.value;
    const selectedConfig = currentEditorRef?.modelSelectorRef?.selectedConfig;
    const selectedModel = currentEditorRef?.modelSelectorRef?.selectedModel;

    if (!selectedConfig) {
        message.warning(t('promptManagement.noAIConfigAvailable'));
        return;
    }

    if (!selectedModel) {
        message.error(t('promptManagement.selectModel'));
        return;
    }

    // 重置状态
    optimizing.value = 'manual';
    isStreaming.value = true;
    generationControl.shouldStop = false;
    streamingContent.value = "";

    // 重置流式传输统计
    streamStats.charCount = 0;
    streamStats.isStreaming = true;
    streamStats.lastCharCount = 0;
    streamStats.noContentUpdateCount = 0;
    streamStats.lastUpdateTime = Date.now();
    streamStats.isGenerationActive = true;
    streamStats.contentGrowthRate = 0;

    try {
        console.log("开始手动调整提示词:", instruction, formData.value.content);

        // 构建手动调整指令，包含原有提示词
        const adjustmentPrompt = `${t('promptManagement.adjustPromptInstruction')}

${t('promptManagement.originalPrompt')}
${formData.value.content}

${t('promptManagement.adjustmentInstruction')}
${instruction.trim()}

${t('promptManagement.outputImprovedPrompt')}`;

        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map((m: any) => String(m)) : [],
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

        message.success(t('promptManagement.adjustmentComplete'));

    } catch (error: any) {
        console.error("手动调整失败:", error);
        if (error.name === 'AbortError') {
            message.info(t('promptManagement.manualAdjustmentCancelled'));
        } else {
            message.error(t('promptManagement.manualAdjustmentFailed') + ": " + (error.message || t('common.unknownError')));
        }
    } finally {
        optimizing.value = null;
        isStreaming.value = false;
        streamStats.isStreaming = false;
        streamStats.isGenerationActive = false;
        generationControl.abortController = null;
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
const getPreviewVariables = (variables: string | any[] | undefined) => {
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
    editingChangeDescription.value = history.changeDescription || "";
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
        // 设置初始化标志，防止递归更新
        isInitializing.value = true;

        // 使用 nextTick 避免递归更新
        nextTick(() => {
            formData.value = {
                title: history.title,
                description: history.description || "",
                content: history.content,
                categoryId: history.categoryId ? history.categoryId : null,
                tags: history.tags
                    ? typeof history.tags === "string"
                        ? history.tags.split(",").map((t) => t.trim()).filter((t) => t)
                        : history.tags
                    : [],
                variables: history.variables
                    ? JSON.parse(history.variables)
                    : [],
            };

            // 设置 Jinja 模式状态
            isJinjaEnabled.value = history.isJinjaTemplate || false;

            // 切换到编辑Tab
            activeTab.value = "edit";

            message.success(t('promptManagement.rolledBackToVersion', { version: history.version }));

            // 重置初始化标志
            nextTick(() => {
                isInitializing.value = false;
            });
        });
    } catch (error) {
        console.error("回滚失败:", error);
        message.error(t('promptManagement.rollbackFailed'));
        isInitializing.value = false;
    }
};

// 获取分类名称
const getCategoryName = (categoryId: any) => {
    if (!categoryId) return t('promptManagement.noCategory');
    const category = props.categories.find((cat) => cat.id === categoryId);
    return category?.name || t('promptManagement.unknownCategory');
};

// 保存变更说明
const saveChangeDescription = async () => {
    if (!previewHistory.value?.id) {
        message.error(t('promptManagement.historyNotFound'));
        return;
    }

    try {
        savingChangeDescription.value = true;

        const result = await api.promptHistories.update.mutate({
            id: previewHistory.value.id,
            data: {
                changeDescription: editingChangeDescription.value.trim()
            }
        });

        // 更新本地数据
        if (previewHistory.value) {
            previewHistory.value.changeDescription = editingChangeDescription.value.trim();
        }

        // 更新历史记录列表中的对应项
        const historyIndex = historyList.value.findIndex(h => h.id === previewHistory.value?.id);
        if (historyIndex !== -1) {
            historyList.value[historyIndex].changeDescription = editingChangeDescription.value.trim();
        }

        message.success(t('promptManagement.changeDescriptionSaved'));

        // 重新加载历史记录以确保数据同步
        if (isEdit.value && props.prompt?.id) {
            await loadHistory();
        }
    } catch (error) {
        console.error('保存变更说明失败:', error);
        message.error(t('promptManagement.changeDescriptionSaveFailed'));
    } finally {
        savingChangeDescription.value = false;
    }
};

// 取消编辑变更说明
const cancelEditChangeDescription = () => {
    editingChangeDescription.value = previewHistory.value?.changeDescription || "";
};

// 变量提取方法现在由子组件处理，这里只保留基础逻辑
const extractVariables = (content: string) => {
    // 这个方法现在由子组件处理，保留空实现以兼容现有代码
};

// 防抖的变量提取方法
const debouncedExtractVariables = (content: string) => {
    // 这个方法现在由子组件处理，保留空实现以兼容现有代码
};

// 自动生成标题的函数
const generateAutoTitle = () => {
    if (!formData.value.content) return "";

    const firstLine = formData.value.content.split("\n")[0].trim();
    if (firstLine.length > 30) {
        return firstLine.substring(0, 30) + "...";
    }
    return firstLine || `${t('promptManagement.prompt')} ${new Date().toLocaleString()}`;
};

// 监听 prompt 变化，初始化表单
watch(
    () => props.prompt,
    (newPrompt, oldPrompt) => {
        console.log('🔄 props.prompt 发生变化:', {
            hasPrompt: !!newPrompt,
            promptId: newPrompt?.id,
            hasImageBlob: !!newPrompt?.imageBlob,
            imageBlobSize: newPrompt?.imageBlob?.size,
            oldPromptId: oldPrompt?.id,
            oldHasImageBlob: !!oldPrompt?.imageBlob
        });
        
        // 防止递归更新
        if (newPrompt === undefined || isInitializing.value) return;

        // 如果新数据和旧数据基本相同，且都有图片数据，则跳过更新
        if (oldPrompt && newPrompt && 
            oldPrompt.id === newPrompt.id && 
            oldPrompt.imageBlob && newPrompt.imageBlob &&
            oldPrompt.imageBlob.size === newPrompt.imageBlob.size) {
            console.log('🔄 跳过相同数据的更新');
            return;
        }

        isInitializing.value = true;

        if (newPrompt) {
            // 处理图片数据
            console.log('加载提示词图片数据:', {
                hasImageBlob: !!newPrompt.imageBlob,
                imageBlobType: typeof newPrompt.imageBlob,
                isBlob: newPrompt.imageBlob instanceof Blob,
                size: newPrompt.imageBlob?.size,
                constructor: newPrompt.imageBlob?.constructor?.name,
                mimeType: newPrompt.imageBlob?.type
            });

            // 兼容旧版本的单个图片数据
            let imageBlob: Blob | undefined = undefined;
            if (newPrompt.imageBlob) {
                if (newPrompt.imageBlob instanceof Blob) {
                    imageBlob = newPrompt.imageBlob;
                    console.log('✅ 成功获取图片数据:', {
                        size: imageBlob?.size,
                        type: imageBlob?.type
                    });
                }
            }

            formData.value = {
                title: newPrompt.title || "",
                description: newPrompt.description || "",
                content: newPrompt.content || "",
                categoryId: newPrompt.categoryId || null,
                tags: newPrompt.tags
                    ? typeof newPrompt.tags === "string"
                        ? newPrompt.tags
                            .split(",")
                            .map((t: string) => t.trim())
                            .filter((t: string) => t)
                        : Array.isArray(newPrompt.tags)
                            ? newPrompt.tags
                            : []
                    : [],
                variables:
                    newPrompt.variables?.map((v: any) => ({
                        name: v.name || "",
                        type: v.type || "text",
                        options: Array.isArray(v.options)
                            ? v.options
                            : typeof v.options === "string"
                                ? v.options
                                    .split(",")
                                    .map((opt: string) => opt.trim())
                                    .filter((opt: string) => opt)
                                : [],
                        defaultValue: v.defaultValue || "",
                        required: v.required !== false,
                        placeholder: v.placeholder || "",
                    })) || [],
                isJinjaTemplate: newPrompt.isJinjaTemplate || false,
                imageBlob: imageBlob,
            };

            console.log('✅ 设置表单数据后的imageBlob:', {
                hasImageBlob: !!formData.value.imageBlob,
                size: formData.value.imageBlob?.size,
                type: formData.value.imageBlob?.type
            });

            // 设置NUpload的默认值
            if (imageBlob && imageBlob instanceof Blob && imageBlob.size > 0) {
                // 将Blob转换为File对象
                const file = new File([imageBlob], 'uploaded-image', { type: imageBlob.type });
                imageFileList.value = [{
                    id: Date.now().toString(),
                    name: 'uploaded-image',
                    status: 'finished' as const,
                    url: URL.createObjectURL(imageBlob),
                    file: file
                }];
                console.log('✅ 设置NUpload默认值成功，文件列表长度:', imageFileList.value.length);
            } else {
                // 只有在确实没有图片数据时才清空文件列表
                if (imageFileList.value.length > 0) {
                    console.log('❌ 没有有效的图片数据，清空文件列表');
                    imageFileList.value = [];
                }
            }

            // 设置 Jinja 模式状态
            isJinjaEnabled.value = newPrompt.isJinjaTemplate || false;

            // 如果是 Jinja 模式，初始化 Jinja 编辑器
            if (isJinjaEnabled.value) {
                nextTick(() => {
                    if (jinjaEditorRef.value?.initializeJinjaVariables) {
                        jinjaEditorRef.value.initializeJinjaVariables();
                    }
                });
            } else {
                // 常规模式：如果有内容但没有变量配置，立即提取变量
                if (
                    newPrompt.content &&
                    (!newPrompt.variables || newPrompt.variables.length === 0)
                ) {
                    nextTick(() => {
                        // 防止在初始化过程中触发
                        if (!isInitializing.value) {
                            extractVariables(newPrompt.content);
                        }
                    });
                }
            }

            // 加载历史记录
            nextTick(() => {
                if (!isInitializing.value) {
                    loadHistory();
                }
            });

            // 如果当前tab是历史记录，确保历史记录已加载
            if (activeTab.value === 'history') {
                nextTick(() => {
                    loadHistory();
                });
            }
        } else {
            // 没有 prompt 数据，重置为新建模式
            resetForm();
            // 在新建模式下，确保当前tab不是历史记录
            nextTick(() => {
                if (activeTab.value === 'history') {
                    activeTab.value = 'edit';
                }
            });
        }

        // 重置初始化标志
        nextTick(() => {
            isInitializing.value = false;
        });
    },
    { immediate: true }
);

// 监听弹窗显示状态
watch(
    () => props.show,
    (newShow, oldShow) => {
        if (newShow) {
            // 加载快速优化配置
            loadQuickOptimizationConfigs();
            
            if (!oldShow) {
                // 弹窗从隐藏变为显示时
                activeTab.value = "edit";

                // 使用 nextTick 确保 props.prompt 已经正确传递
                nextTick(() => {
                    // 只有在确实没有 prompt 且不是编辑模式时才重置表单
                    if (!props.prompt && !isEdit.value) {
                        resetForm();
                    }

                    // 如果当前tab是历史记录且是编辑模式，立即加载历史记录
                    if (activeTab.value === 'history' && isEdit.value && props.prompt?.id) {
                        loadHistory();
                    }
                });
            }
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

            // 重置手动调整状态现在由子组件处理

            // 延迟重置表单，确保弹窗完全关闭后再重置
            // 注意：只有在新建模式下才重置表单，编辑模式下保留数据
            setTimeout(() => {
                if (!props.show && !isEdit.value) {
                    resetForm();
                }
            }, 200);
        }
    }
);

// 监听tab切换，当切换到历史记录tab时立即加载数据
watch(
    () => activeTab.value,
    (newTab) => {
        if (newTab === 'history' && isEdit.value && props.prompt?.id) {
            // 切换到历史记录tab时，立即加载历史记录
            nextTick(() => {
                loadHistory();
            });
        }
    }
);

// 监听内容变化，自动提取变量（使用防抖）
watch(
    () => formData.value.content,
    (newContent) => {
        // 防止在初始化过程中触发
        if (isInitializing.value) return;

        if (newContent) {
            debouncedExtractVariables(newContent);
        } else {
            // 如果内容为空，立即清空变量列表
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            // 使用 nextTick 避免递归更新
            nextTick(() => {
                if (!isInitializing.value) {
                    formData.value.variables = [];
                }
            });
        }
    }
);

// 监听变量类型变化，清理不匹配的默认值
watch(
    () => formData.value.variables,
    (newVariables) => {
        // 防止在初始化过程中触发
        if (isInitializing.value) return;

        // 检查是否需要更新变量
        let needsUpdate = false;
        const updatedVariables = newVariables.map((variable) => {
            const updatedVariable = { ...variable };

            // 当变量类型为选项时，检查默认值是否在选项中
            if (updatedVariable.type === "select" && updatedVariable.defaultValue) {
                if (!updatedVariable.options || !updatedVariable.options.includes(updatedVariable.defaultValue)) {
                    updatedVariable.defaultValue = "";
                    needsUpdate = true;
                }
            }
            // 当变量类型为文本且选项不为空时，清空选项
            if (
                updatedVariable.type === "text" &&
                updatedVariable.options &&
                updatedVariable.options.length > 0
            ) {
                updatedVariable.options = [];
                needsUpdate = true;
            }
            // 当变量类型切换到选项但没有选项时，提供默认选项
            if (
                updatedVariable.type === "select" &&
                (!Array.isArray(updatedVariable.options) || updatedVariable.options.length === 0)
            ) {
                updatedVariable.options = ["选项1", "选项2"];
                needsUpdate = true;
            }

            return updatedVariable;
        });

        // 只有在确实需要更新时才更新，避免无限循环
        if (needsUpdate) {
            nextTick(() => {
                if (!isInitializing.value) {
                    formData.value.variables = updatedVariables;
                }
            });
        }
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
const getVariableDefaultOptions = (options: any) => {
    if (!Array.isArray(options) || options.length === 0) return [];
    return options
        .filter((opt: any) => opt && opt.trim())
        .map((option: any) => ({
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

// 图片上传处理函数
const handleBeforeUpload = async (data: { file: any, fileList: any[] }) => {
    const file = data.file.file as File; // 获取原始File对象

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
        message.error(t('promptManagement.invalidImageType'));
        return false;
    }

    // 检查文件大小 (限制为5MB)
    if (file.size > 5 * 1024 * 1024) {
        message.error(t('promptManagement.imageTooLarge'));
        return false;
    }

    return true;
};

const handleCustomRequest = async ({ file, onFinish, onError }: any) => {
    try {
        // 存储图片数据
        formData.value.imageBlob = file.file;
        onFinish();
        message.success(t('promptManagement.imageUploadSuccess'));
    } catch (error) {
        console.error('图片上传失败:', error);
        onError();
        message.error(t('promptManagement.imageUploadFailed'));
    }
};

const handleRemoveImage = (file: any) => {
    // 清除图片数据
    formData.value.imageBlob = undefined;
    message.success(t('promptManagement.imageRemoveSuccess'));
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

    // 重置手动调整状态现在由子组件处理

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

        // 处理变量数据
        let variablesData: any[] = [];

        if (isJinjaEnabled.value) {
            // Jinja 模式：使用 Jinja 编辑器中的变量
            const jinjaVariables = jinjaEditorRef.value?.jinjaVariables || [];
            variablesData = jinjaVariables
                .filter((v: any) => v.name)
                .map((v: any) => ({
                    name: v.name,
                    type: v.type,
                    defaultValue: v.defaultValue || undefined,
                    required: v.required,
                    placeholder: v.placeholder || undefined,
                }));
        } else {
            // 常规模式：使用表单中的变量
            variablesData = formData.value.variables
                .filter((v) => v.name)
                .map((v) => ({
                    name: v.name,
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
                }));
        }

        // 从imageFileList中获取图片数据
        const imageFile = imageFileList.value
            .filter(file => file.file && file.status === 'finished')
            .map(file => file.file)[0]; // 只取第一张图片

        // 将File转换为Blob
        const imageBlob = imageFile ? new Blob([imageFile], { type: imageFile.type }) : undefined;

        const data = {
            title: finalTitle,
            description: formData.value.description || undefined,
            content: formData.value.content,
            categoryId: formData.value.categoryId || undefined,
            tags: formData.value.tags.length > 0 ? formData.value.tags : [],
            isFavorite: false,
            useCount: 0,
            isActive: true,
            isJinjaTemplate: isJinjaEnabled.value,
            variables: variablesData,
            imageBlob: imageBlob,
        };

        console.log('保存提示词数据:', {
            hasImageBlob: !!imageBlob,
            imageBlobType: typeof imageBlob,
            isBlob: imageBlob instanceof Blob,
            size: imageBlob?.size,
            constructor: imageBlob?.constructor?.name,
            mimeType: imageBlob?.type
        });



        if (isEdit.value) {
            // 编辑模式：先创建历史记录，再更新
            // 构建当前提示词的完整数据用于历史记录
            const currentPromptData = {
                ...props.prompt,
                title: finalTitle,
                description: formData.value.description || undefined,
                content: formData.value.content,
                categoryId: formData.value.categoryId || undefined,
                tags: formData.value.tags.length > 0 ? formData.value.tags : [],
                isJinjaTemplate: isJinjaEnabled.value,
                variables: variablesData, // 这里保持为数组，createHistoryRecord 会处理 JSON.stringify
                imageBlob: formData.value.imageBlob,
            };

            console.log('创建历史记录 - 当前数据:', {
                promptId: currentPromptData.id,
                title: currentPromptData.title,
                content: currentPromptData.content,
                isJinjaTemplate: currentPromptData.isJinjaTemplate,
                variables: currentPromptData.variables,
                variablesCount: currentPromptData.variables?.length || 0
            });

            await createHistoryRecord(currentPromptData);

            await api.prompts.update.mutate({
                id: props.prompt.id,
                data,
            });
            message.success(t('promptManagement.updateSuccess'));

            // 重新加载历史记录
            await loadHistory();
        } else {
            // 新建模式：需要添加 uuid 字段
            const createData = {
                ...data,
                uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            await api.prompts.create.mutate(createData);
            message.success(t('promptManagement.createSuccess'));
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
        message.error(isEdit.value ? t('promptManagement.updateFailed') : t('promptManagement.createFailed'));
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

// Jinja 相关方法
const toggleJinjaMode = () => {
    if (isJinjaEnabled.value) {
        // 从 Jinja 模式切换到变量模式
        isJinjaEnabled.value = false;
        message.info(t('promptManagement.jinjaDisabled'));
    } else {
        // 从变量模式切换到 Jinja 模式
        if (formData.value.content.trim()) {
            // 如果有现有内容，提示用户确认
            if (confirm(t('promptManagement.jinjaClearContentMessage'))) {
                isJinjaEnabled.value = true;
                formData.value.content = '';
                formData.value.variables = [];
                message.success(t('promptManagement.jinjaEnabled'));
            }
        } else {
            // 没有内容，直接切换
            isJinjaEnabled.value = true;
            message.success(t('promptManagement.jinjaEnabled'));
        }
    }
};

const openJinjaWebsite = () => {
    // 打开 Jinja 官网
    if ((window as any).electronAPI?.shell?.openExternal) {
        (window as any).electronAPI.shell.openExternal('https://jinja.palletsprojects.com/en/stable/');
    } else {
        // 降级到浏览器打开
        window.open('https://jinja.palletsprojects.com/en/stable/', '_blank');
    }
};

// 编辑器引用
const regularEditorRef = ref();
const jinjaEditorRef = ref();

// 模式切换方法
const switchToRegularMode = () => {
    if (isJinjaEnabled.value) {
        // 从 Jinja 模式切换到常规模式
        if (formData.value.content.trim()) {
            // 如果有现有内容，提示用户确认
            if (confirm(t('promptManagement.regularModeClearContentMessage'))) {
                isJinjaEnabled.value = false;
                formData.value.content = '';
                formData.value.variables = [];
                message.success(t('promptManagement.regularModeEnabled'));
            }
        } else {
            // 没有内容，直接切换
            isJinjaEnabled.value = false;
            message.success(t('promptManagement.regularModeEnabled'));
        }
    }
};

const switchToJinjaMode = () => {
    if (!isJinjaEnabled.value) {
        // 从常规模式切换到 Jinja 模式
        if (formData.value.content.trim()) {
            // 如果有现有内容，提示用户确认
            if (confirm(t('promptManagement.jinjaClearContentMessage'))) {
                isJinjaEnabled.value = true;
                formData.value.content = '';
                formData.value.variables = [];
                message.success(t('promptManagement.jinjaEnabled'));
            }
        } else {
            // 没有内容，直接切换
            isJinjaEnabled.value = true;
            message.success(t('promptManagement.jinjaEnabled'));
        }
    }
};

// 内容更新方法
const updateContent = (newContent: string) => {
    formData.value.content = newContent;
};

// 变量更新方法
const updateVariables = (newVariables: any[]) => {
    // 防止在初始化过程中触发
    if (isInitializing.value) return;

    // 检查变量是否真的发生了变化
    const currentVariables = formData.value.variables;
    if (currentVariables.length === newVariables.length) {
        const hasChanges = newVariables.some((newVar, index) => {
            const currentVar = currentVariables[index];
            return newVar.name !== currentVar.name ||
                newVar.type !== currentVar.type ||
                newVar.required !== currentVar.required ||
                newVar.defaultValue !== currentVar.defaultValue ||
                newVar.placeholder !== currentVar.placeholder ||
                JSON.stringify(newVar.options) !== JSON.stringify(currentVar.options);
        });

        if (!hasChanges) {
            return; // 没有变化，不更新
        }
    }

    formData.value.variables = newVariables.map(v => ({
        name: v.name,
        type: v.type,
        options: v.options,
        defaultValue: v.defaultValue,
        required: v.required,
        placeholder: v.placeholder,
    })) as Variable[];
};

// 暴露方法给父组件
defineExpose({
    refreshQuickOptimizationConfigs
});

// 图片预览处理函数
const handlePreviewFile = (file: any) => {
    if (file.file) {
        return URL.createObjectURL(file.file);
    }
    return file.url || '';
};

const handlePreviewImage = (file: any) => {
    const imageUrl = handlePreviewFile(file);
    if (imageUrl) {
        currentPreviewImage.value = imageUrl;
        showImagePreview.value = true;
    }
};

// 监听formData.imageBlob的变化
watch(
    () => formData.value.imageBlob,
    (newImageBlob) => {
        console.log('🔄 formData.imageBlob 发生变化:', {
            hasImageBlob: !!newImageBlob,
            size: newImageBlob?.size,
            type: newImageBlob?.type
        });
    }
);

// 监听imageFileList的变化
watch(
    () => imageFileList.value,
    (newFileList) => {
        console.log('🔄 imageFileList 发生变化:', {
            length: newFileList.length,
            files: newFileList.map(f => ({
                name: f.name,
                status: f.status,
                hasFile: !!f.file
            }))
        });
    },
    { deep: true }
);
</script>

<style scoped></style>
