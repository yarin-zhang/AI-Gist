<template>
    <div class="prompt-management-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px;">AI 提示词</NText>
                    <NText depth="3" style="display: block; margin-top: 4px;">
                        管理和组织你的 AI 提示词库
                    </NText>
                </div>
                <NFlex>
                    <NButton type="primary" @click="handleCreatePrompt">
                        <template #icon>
                            <NIcon>
                                <Plus />
                            </NIcon>
                        </template>
                        新建提示词
                    </NButton>
                    <NButton @click="showCategoryManagement = true">
                        <template #icon>
                            <NIcon>
                                <Folder />
                            </NIcon>
                        </template>
                        分类管理
                    </NButton>
                    <NButton @click="showAIGenerator = !showAIGenerator" :type="showAIGenerator ? 'primary' : 'default'">
                        <template #icon>
                            <NIcon>
                                <Robot />
                            </NIcon>
                        </template>
                        AI 生成器
                    </NButton>
                </NFlex>
            </NFlex>
            
            <!-- AI 生成器组件 -->
            <AIGeneratorComponent v-if="showAIGenerator" @prompt-generated="handlePromptGenerated" />
            
            <!-- 提示词列表组件 -->
            <PromptList ref="promptListRef" @edit="handleEditPrompt" @view="handleViewPrompt"
                @refresh="loadStatistics" />
        </NFlex>

        <!-- 模态框 -->
        <PromptEditModal v-model:show="showEditModal" :prompt="selectedPrompt" :categories="categories"
            @saved="handlePromptSaved" />

        <PromptDetailModal v-model:show="showDetailModal" :prompt="selectedPrompt" @edit="handleEditFromDetail"
            @updated="loadStatistics" />

        <CategoryManageModal v-model:show="showCategoryManagement" :categories="categories" @updated="loadCategories" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
    NFlex,
    NText,
    NButton,
    NIcon,
    NCard,
    NScrollbar,
    useMessage
} from 'naive-ui'
import { Plus, Folder, FileText, Heart, Robot } from '@vicons/tabler'

// 组件导入
import PromptList from '@/components/prompt-management/PromptList.vue'
import PromptEditModal from '@/components/prompt-management/PromptEditModal.vue'
import PromptDetailModal from '@/components/prompt-management/PromptDetailModal.vue'
import CategoryManageModal from '@/components/prompt-management/CategoryManageModal.vue'
import AIGeneratorComponent from '@/components/ai/AIGeneratorComponent.vue'

// API 导入
import { api } from '@/lib/api'

const message = useMessage()

// 组件引用
const promptListRef = ref()

// 响应式数据
const prompts = ref([])
const categories = ref([])
const selectedPrompt = ref(null)
const showEditModal = ref(false)
const showDetailModal = ref(false)
const showCategoryManagement = ref(false)
const showAIGenerator = ref(false)

// 统计数据
const totalPrompts = computed(() => prompts.value.length)
const favoritePrompts = computed(() => prompts.value.filter(p => p.isFavorite).length)
const totalCategories = computed(() => categories.value.length)

// 方法
const loadPrompts = async () => {
    try {
        const result = await api.prompts.getAllForTags.query()
        prompts.value = result
    } catch (error) {
        message.error('加载 Prompts 失败')
        console.error(error)
    }
}

const loadCategories = async () => {
    try {
        categories.value = await api.categories.getAll.query()
        // 同时刷新 PromptList 的分类数据
        if (promptListRef.value?.loadCategories) {
            promptListRef.value.loadCategories()
        }
    } catch (error) {
        message.error('加载分类失败')
        console.error(error)
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

const handleEditPrompt = (prompt) => {
    selectedPrompt.value = prompt
    showEditModal.value = true
}

const handleViewPrompt = (prompt) => {
    selectedPrompt.value = prompt
    showDetailModal.value = true
}

const handleEditFromDetail = (prompt) => {
    showDetailModal.value = false
    selectedPrompt.value = prompt
    showEditModal.value = true
}

const handlePromptSaved = () => {
    // 刷新 PromptList 组件的数据
    if (promptListRef.value?.loadPrompts && promptListRef.value?.loadCategories) {
        promptListRef.value.loadPrompts()
        promptListRef.value.loadCategories()
    }
    // 同时刷新页面统计数据
    loadStatistics()
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

// 生命周期
onMounted(() => {
    loadStatistics()
})
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
