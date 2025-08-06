<template>
    <div class="prompt-management-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px;">{{ t('promptManagement.title') }}</NText>
                    <NText depth="3" style="display: block; margin-top: 4px;">
                        {{ t('promptManagement.subtitle') }}
                    </NText>
                </div>
                <NFlex>
                    <NButton @click="showAIGenerator = !showAIGenerator"
                        :type="showAIGenerator ? 'primary' : 'default'">
                        <template #icon>
                            <NIcon>
                                <Robot />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.aiGenerate') }}
                    </NButton>
                    <NButton type="primary" @click="handleCreatePrompt">
                        <template #icon>
                            <NIcon>
                                <Plus />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.createPrompt') }}
                    </NButton>

                </NFlex>
            </NFlex> <!-- AI 生成器组件 -->
            <AIGeneratorComponent v-if="showAIGenerator" @prompt-generated="handlePromptGenerated"
                @prompt-saved="handleListRefresh" @navigate-to-ai-config="handleNavigateToAIConfig" />
            <!-- 提示词列表组件 -->
            <PromptList ref="promptListRef" @edit="handleEditPrompt" @view="handleViewPrompt"
                @refresh="handleListRefresh" @manage-categories="showCategoryManagement = true" />
        </NFlex>

        <!-- 模态框 -->
        <PromptEditModal 
            ref="promptEditModalRef"
            v-model:show="showEditModal" 
            :prompt="selectedPrompt" 
            :categories="categories"
            @saved="handlePromptSaved" 
            @open-quick-optimization-config="handleOpenQuickOptimizationConfig" 
        />

        <PromptDetailModal v-model:show="showDetailModal" :prompt="selectedPrompt" @edit="handleEditFromDetail"
            @updated="loadStatistics" />

        <CategoryManageModal v-model:show="showCategoryManagement" :categories="categories" @updated="loadCategories" />

        <!-- 快速优化提示词配置管理模态窗 -->
        <QuickOptimizationConfigModal 
            :show="showQuickOptimizationModal" 
            @update:show="showQuickOptimizationModal = $event"
            @configs-updated="handleQuickOptimizationConfigsUpdated"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    NFlex,
    NText,
    NButton,
    NIcon,
    NCard,
    NScrollbar,
    NEmpty,
    useMessage
} from 'naive-ui'
import { Plus, Folder, FileText, Heart, Robot } from '@vicons/tabler'

// 组件导入
import PromptList from '@/components/prompt-management/PromptList.vue'
import PromptEditModal from '@/components/prompt-management/PromptEditModal.vue'
import PromptDetailModal from '@/components/prompt-management/PromptDetailModal.vue'
import CategoryManageModal from '@/components/prompt-management/CategoryManageModal.vue'
import AIGeneratorComponent from '@/components/ai/AIGeneratorComponent.vue'
import QuickOptimizationConfigModal from '@/components/ai/QuickOptimizationConfigModal.vue'

// API 导入
import { api } from '@/lib/api'
import { useDatabase } from '@/composables/useDatabase'

// 定义事件
const emit = defineEmits<{
    'navigate-to-ai-config': []
}>()

const { t } = useI18n()
const message = useMessage()
const { safeDbOperation, waitForDatabase } = useDatabase()

// 组件引用
const promptListRef = ref()
const promptEditModalRef = ref()

// 响应式数据
const prompts = ref<any[]>([])
const categories = ref<any[]>([])
const selectedPrompt = ref<any>(null)
const showEditModal = ref(false)
const showDetailModal = ref(false)
const showCategoryManagement = ref(false)
const showAIGenerator = ref(false)
const showQuickOptimizationModal = ref(false)

// 统计数据
const totalPrompts = computed(() => prompts.value.length)
const favoritePrompts = computed(() => prompts.value.filter(p => p.isFavorite).length)
const totalCategories = computed(() => categories.value.length)

// 方法
const loadPrompts = async () => {
    const result = await safeDbOperation(
        () => api.prompts.getAllForTags.query(),
        []
    )
    if (result) {
        prompts.value = result
    }
}

const loadCategories = async () => {
    const result = await safeDbOperation(
        () => api.categories.getAll.query(),
        []
    )
    if (result) {
        categories.value = result
        // 同时刷新 PromptList 的分类数据
        if (promptListRef.value?.loadCategories) {
            promptListRef.value.loadCategories()
        }
    }
}

const loadStatistics = async () => {
    await Promise.all([loadPrompts(), loadCategories()])
    // 不需要在这里调用 PromptList 的方法，因为 PromptList 有自己的加载逻辑
}

const handleCreatePrompt = () => {
    selectedPrompt.value = null
    showEditModal.value = true
}

const handleEditPrompt = (prompt: any) => {
    console.log('🔄 handleEditPrompt 被调用:', {
        hasPrompt: !!prompt,
        promptId: prompt?.id,
        hasImageBlobs: !!prompt?.imageBlobs,
        imageBlobsCount: prompt?.imageBlobs?.length || 0
    });
    
    // 确保数据完整性，特别是图片数据
    const editPrompt = {
        ...prompt,
        imageBlobs: prompt.imageBlobs || [] // 确保图片数据被正确传递
    };
    
    selectedPrompt.value = editPrompt
    showEditModal.value = true
}

const handleViewPrompt = (prompt: any) => {
    console.log('🔄 handleViewPrompt 设置详情数据:', {
        hasPrompt: !!prompt,
        promptId: prompt?.id,
        hasImageBlobs: !!prompt?.imageBlobs,
        imageBlobsCount: prompt?.imageBlobs?.length || 0,
        imageBlobsType: typeof prompt?.imageBlobs
    });
    
    selectedPrompt.value = prompt
    showDetailModal.value = true
}

const handleEditFromDetail = (prompt: any) => {
    
    if (!prompt || !prompt.id) {
        message.error(t('promptManagement.incompleteDataError'));
        return;
    }
    
    // 确保数据完整性
    const editPrompt = {
        id: prompt.id,
        uuid: prompt.uuid,
        title: prompt.title || "",
        description: prompt.description || "",
        content: prompt.content || "",
        categoryId: prompt.categoryId || null,
        category: prompt.category || null,
        tags: prompt.tags || "",
        variables: Array.isArray(prompt.variables) ? prompt.variables : [],
        isActive: prompt.isActive !== false,
        isFavorite: prompt.isFavorite || false,
        useCount: prompt.useCount || 0,
        isJinjaTemplate: prompt.isJinjaTemplate || false,
        imageBlobs: prompt.imageBlobs || [], // 确保图片数据被正确传递
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt
    };
    
    console.log('🔄 handleEditFromDetail 设置编辑数据:', {
        hasImageBlobs: !!editPrompt.imageBlobs,
        imageBlobsCount: editPrompt.imageBlobs?.length || 0,
        imageBlobsType: typeof editPrompt.imageBlobs
    });
    
    // 关闭详情模态框
    showDetailModal.value = false;
    
    // 设置选中的提示词并打开编辑模态框
    selectedPrompt.value = editPrompt;
    showEditModal.value = true;
}

const handlePromptSaved = () => {
    console.log('🔄 handlePromptSaved 被调用');
    // 延迟刷新数据，避免图片数据丢失
    setTimeout(() => {
        // 刷新 PromptList 组件的数据
        if (promptListRef.value?.loadPrompts && promptListRef.value?.loadCategories && promptListRef.value?.loadStatistics) {
            promptListRef.value.loadPrompts()
            promptListRef.value.loadCategories()
            promptListRef.value.loadStatistics() // 刷新统计信息
        }
        // 同时刷新页面统计数据
        loadStatistics()
    }, 500); // 延迟500ms，确保编辑模态框完全关闭
}

const handlePromptGenerated = (generatedPrompt: any) => {
    // 当 AI 生成提示词后，自动创建新的提示词
    selectedPrompt.value = {
        title: generatedPrompt.title || `AI生成: ${generatedPrompt.topic}`,
        content: generatedPrompt.content || generatedPrompt.generatedPrompt,
        description: generatedPrompt.description || `由 AI 生成的提示词，主题：${generatedPrompt.topic}`,
        tags: 'AI生成',
        isFavorite: false,
        useCount: 0
    }
    showEditModal.value = true
}

const handleNavigateToAIConfig = () => {
    // 向上传递导航事件到 MainPage
    emit('navigate-to-ai-config')
}

const handleListRefresh = () => {
    // 刷新 PromptList 组件的数据
    if (promptListRef.value?.loadPrompts && promptListRef.value?.loadStatistics) {
        promptListRef.value.loadPrompts()
        promptListRef.value.loadStatistics() // 刷新统计信息
    }
    // 同时刷新页面统计数据
    loadStatistics()
}

// 处理打开快速优化配置模态窗
const handleOpenQuickOptimizationConfig = () => {
    showQuickOptimizationModal.value = true;
};

// 处理快速优化配置更新
const handleQuickOptimizationConfigsUpdated = () => {
    // 静默更新，不显示消息
    // 如果编辑模态窗是打开的，立即刷新快速优化配置
    if (showEditModal.value && promptEditModalRef.value?.refreshQuickOptimizationConfigs) {
        promptEditModalRef.value.refreshQuickOptimizationConfigs();
    }
};

// 生命周期
onMounted(async () => {
    // 等待数据库就绪后再加载数据
    await waitForDatabase()
    loadStatistics()
})

// 监听selectedPrompt的变化
watch(selectedPrompt, (newPrompt) => {
    console.log('🔄 selectedPrompt 发生变化:', {
        hasPrompt: !!newPrompt,
        promptId: newPrompt?.id,
        hasImageBlobs: !!newPrompt?.imageBlobs,
        imageBlobsSize: newPrompt?.imageBlobs?.length
    });
});
</script>

<style scoped>
.prompt-management-page {
    padding: 24px;
    overflow-y: auto;
}

.stat-card {
    flex: 1;
    text-align: center;
    cursor: default;
}

.stat-card :deep(.n-card__content) {
    padding: 20px;
}
</style>
