<template>
  <div class="prompt-management-page">
    <NFlex vertical size="large">
      <!-- 页面标题 -->
      <NFlex justify="space-between" align="center">
        <div>
          <NText strong style="font-size: 28px;">AI Prompt 管理中心</NText>
          <NText depth="3" style="display: block; margin-top: 4px;">
            管理和组织你的 AI Prompt 库
          </NText>
        </div>
        <NFlex>
          <NButton type="primary" @click="handleCreatePrompt">
            <template #icon>
              <NIcon><Plus /></NIcon>
            </template>
            新建 Prompt
          </NButton>
          <NButton @click="showCategoryManagement = true">
            <template #icon>
              <NIcon><Folder /></NIcon>
            </template>
            分类管理
          </NButton>
        </NFlex>
      </NFlex>

      <!-- Prompt 列表组件 -->
      <PromptList 
        @edit="handleEditPrompt"
        @view="handleViewPrompt"
        @refresh="loadStatistics"
      />
    </NFlex>

    <!-- 模态框 -->
    <PromptEditModal
      v-model:show="showEditModal"
      :prompt="selectedPrompt"
      :categories="categories"
      @saved="handlePromptSaved"
    />

    <PromptDetailModal
      v-model:show="showDetailModal"
      :prompt="selectedPrompt"
      @edit="handleEditFromDetail"
      @updated="loadStatistics"
    />

    <CategoryManageModal
      v-model:show="showCategoryManagement"
      :categories="categories"
      @updated="loadCategories"
    />
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
  useMessage
} from 'naive-ui'
import { Plus, Folder, FileText, Heart } from '@vicons/tabler'

// 组件导入
import PromptList from '@/components/prompt-management/PromptList.vue'
import PromptEditModal from '@/components/prompt-management/PromptEditModal.vue'
import PromptDetailModal from '@/components/prompt-management/PromptDetailModal.vue'
import CategoryManageModal from '@/components/prompt-management/CategoryManageModal.vue'

// API 导入
import { api } from '@/lib/api'

const message = useMessage()

// 响应式数据
const prompts = ref([])
const categories = ref([])
const selectedPrompt = ref(null)
const showEditModal = ref(false)
const showDetailModal = ref(false)
const showCategoryManagement = ref(false)

// 统计数据
const totalPrompts = computed(() => prompts.value.length)
const favoritePrompts = computed(() => prompts.value.filter(p => p.isFavorite).length)
const totalCategories = computed(() => categories.value.length)

// 方法
const loadPrompts = async () => {
  try {
    prompts.value = await api.prompts.getAll.query({})
  } catch (error) {
    message.error('加载 Prompts 失败')
    console.error(error)
  }
}

const loadCategories = async () => {
  try {
    categories.value = await api.categories.getAll.query()
  } catch (error) {
    message.error('加载分类失败')
    console.error(error)
  }
}

const loadStatistics = async () => {
  await Promise.all([loadPrompts(), loadCategories()])
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
  loadStatistics()
}

// 生命周期
onMounted(() => {
  loadStatistics()
})
</script>

<style scoped>
.prompt-management-page {
  padding: 24px;
  height: 100vh;
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
