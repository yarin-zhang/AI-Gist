<template>
  <div class="prompt-manager">
    <NFlex vertical>
      <!-- 头部操作栏 -->
      <NFlex justify="space-between" align="center">
        <NText strong style="font-size: 24px;">AI Prompt 管理</NText>
        <NFlex>
          <NButton type="primary" @click="() => { selectedPrompt = null; showCreateModal = true; }">
            <template #icon>
              <NIcon><Plus /></NIcon>
            </template>
            新建 Prompt
          </NButton>
          <NButton @click="showCategoryModal = true">
            <template #icon>
              <NIcon><Folder /></NIcon>
            </template>
            管理分类
          </NButton>
        </NFlex>
      </NFlex>

      <!-- 搜索和过滤器 -->
      <NCard>
        <NFlex vertical size="small">
          <NFlex>
            <NInput
              v-model:value="searchText"
              placeholder="搜索 Prompt..."
              style="flex: 1"
              @input="handleSearch"
            >
              <template #prefix>
                <NIcon><Search /></NIcon>
              </template>
            </NInput>
            <NSelect
              v-model:value="selectedCategory"
              placeholder="选择分类"
              style="width: 200px"
              :options="categoryOptions"
              clearable
              @update:value="handleCategoryFilter"
            />
            <NButton 
              :type="showFavoritesOnly ? 'primary' : 'default'"
              @click="toggleFavoritesFilter"
            >
              <template #icon>
                <NIcon><Heart /></NIcon>
              </template>
              收藏
            </NButton>
          </NFlex>
        </NFlex>
      </NCard>

      <!-- Prompt 列表 -->
      <div v-if="isLoading" style="text-align: center; padding: 40px;">
        <NSpin size="large" />
      </div>
      
      <div v-else-if="prompts.length === 0" style="text-align: center; padding: 40px;">
        <NEmpty description="暂无 Prompt，快来创建第一个吧！" />
      </div>

      <div v-else class="prompt-grid">
        <NCard
          v-for="prompt in prompts"
          :key="prompt.id"
          class="prompt-card"
          hoverable
          @click="selectPrompt(prompt)"
        >
          <template #header>
            <NFlex justify="space-between" align="center">
              <NText strong>{{ prompt.title }}</NText>
              <NFlex size="small">
                <NButton 
                  size="small" 
                  text 
                  @click.stop="toggleFavorite(prompt.id)"
                  :type="prompt.isFavorite ? 'error' : 'default'"
                >
                  <template #icon>
                    <NIcon><Heart /></NIcon>
                  </template>
                </NButton>
                <NDropdown :options="getPromptActions(prompt)" @select="(key) => handlePromptAction(key, prompt)">
                  <NButton size="small" text @click.stop>
                    <template #icon>
                      <NIcon><DotsVertical /></NIcon>
                    </template>
                  </NButton>
                </NDropdown>
              </NFlex>
            </NFlex>
          </template>

          <NFlex vertical size="small">
            <NText depth="3" v-if="prompt.description">{{ prompt.description }}</NText>
            <NText depth="3" style="font-size: 12px;">
              {{ prompt.content.substring(0, 100) }}{{ prompt.content.length > 100 ? '...' : '' }}
            </NText>
            
            <!-- 标签显示 -->
            <div v-if="prompt.tags">
              <NFlex size="small" style="margin: 8px 0;">
                <NTag 
                  v-for="tag in getTagsArray(prompt.tags)" 
                  :key="tag"
                  size="small"
                  :bordered="false"
                  :type="getTagType(tag)"
                >
                  {{ tag }}
                </NTag>
              </NFlex>
            </div>
            
            <NFlex justify="space-between" align="center" style="margin-top: 8px;">
              <NFlex size="small">
                <NTag v-if="prompt.category" size="small" :color="{ color: prompt.category.color || '#18a058' }">
                  {{ prompt.category.name }}
                </NTag>
                <NTag v-if="prompt.variables?.length > 0" size="small" type="info">
                  {{ prompt.variables.length }} 个变量
                </NTag>
              </NFlex>
              <NText depth="3" style="font-size: 12px;">
                使用 {{ prompt.useCount }} 次
              </NText>
            </NFlex>
          </NFlex>
        </NCard>
      </div>
    </NFlex>

    <!-- 创建/编辑 Prompt 弹窗 -->
    <PromptEditModal
      v-model:show="showCreateModal"
      :prompt="selectedPrompt"
      :categories="categories"
      @saved="handlePromptSaved"
    />

    <!-- 分类管理弹窗 -->
    <CategoryManageModal
      v-model:show="showCategoryModal"
      :categories="categories"
      @updated="loadCategories"
    />

    <!-- Prompt 详情和填充弹窗 -->
    <PromptDetailModal
      v-model:show="showDetailModal"
      :prompt="selectedPrompt"
      @use="handlePromptUse"
      @edit="handleEditPrompt"
      @updated="handlePromptUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import {
  NCard,
  NFlex,
  NText,
  NButton,
  NInput,
  NSelect,
  NIcon,
  NTag,
  NSpin,
  NEmpty,
  NDropdown,
  useMessage
} from 'naive-ui'
import {
  Plus,
  Search,
  Heart,
  Folder,
  DotsVertical,
  Edit,
  Trash,
  Copy
} from '@vicons/tabler'
import { api } from '../lib/api'
import PromptEditModal from './PromptEditModal.vue'
import CategoryManageModal from './CategoryManageModal.vue'
import PromptDetailModal from './PromptDetailModal.vue'

const message = useMessage()

// 响应式数据
const prompts = ref([])
const categories = ref([])
const isLoading = ref(false)
const searchText = ref('')
const selectedCategory = ref(null)
const showFavoritesOnly = ref(false)
const showCreateModal = ref(false)
const showCategoryModal = ref(false)
const showDetailModal = ref(false)
const selectedPrompt = ref(null)

// 计算属性
const categoryOptions = computed(() => [
  { label: '全部分类', value: null },
  ...categories.value.map(cat => ({
    label: `${cat.name} (${cat._count?.prompts || 0})`,
    value: cat.id
  }))
])

// 加载数据
const loadPrompts = async () => {
  try {
    isLoading.value = true
    const filters = {
      categoryId: selectedCategory.value || undefined,
      search: searchText.value || undefined,
      isFavorite: showFavoritesOnly.value || undefined
    }
    prompts.value = await api.prompts.getAll.query(filters)
  } catch (error) {
    message.error('加载 Prompt 失败')
    console.error(error)
  } finally {
    isLoading.value = false
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

// 事件处理
const handleSearch = () => {
  loadPrompts()
}

const handleCategoryFilter = () => {
  loadPrompts()
}

const toggleFavoritesFilter = () => {
  showFavoritesOnly.value = !showFavoritesOnly.value
  loadPrompts()
}

// 处理标签相关方法
const getTagsArray = (tags) => {
  if (!tags) return []
  return typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags
}

const getTagType = (tag) => {
  // 根据标签内容返回不同的类型，让标签更有视觉层次
  const types = ['default', 'success', 'warning', 'error', 'info']
  const index = tag.length % types.length
  return types[index]
}

const selectPrompt = (prompt) => {
  selectedPrompt.value = prompt
  showDetailModal.value = true
}

const toggleFavorite = async (promptId) => {
  try {
    await api.prompts.toggleFavorite.mutate(promptId)
    await loadPrompts() // 重新加载数据而不是直接修改本地状态
    message.success('收藏状态已更新')
  } catch (error) {
    message.error('更新收藏状态失败')
    console.error(error)
  }
}

const getPromptActions = (prompt) => [
  {
    label: '编辑',
    key: 'edit',
    icon: () => h(NIcon, null, { default: () => h(Edit) })
  },
  {
    label: '复制',
    key: 'copy',
    icon: () => h(NIcon, null, { default: () => h(Copy) })
  },
  {
    label: '删除',
    key: 'delete',
    icon: () => h(NIcon, null, { default: () => h(Trash) })
  }
]

const handlePromptAction = (action, prompt) => {
  switch (action) {
    case 'edit':
      handleEditPrompt(prompt)
      break
    case 'copy':
      handleCopyPrompt(prompt)
      break
    case 'delete':
      handleDeletePrompt(prompt)
      break
  }
}

const handleEditPrompt = (prompt) => {
  selectedPrompt.value = { ...prompt } // 创建副本避免直接修改
  showCreateModal.value = true
}

const handleCopyPrompt = async (prompt) => {
  try {
    await navigator.clipboard.writeText(prompt.content)
    message.success('Prompt 内容已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

const handleDeletePrompt = async (prompt) => {
  if (confirm(`确定要删除 "${prompt.title}" 吗？`)) {
    try {
      await api.prompts.delete.mutate(prompt.id)
      await loadPrompts()
      message.success('Prompt 已删除')
    } catch (error) {
      message.error('删除失败')
      console.error(error)
    }
  }
}

const handlePromptSaved = () => {
  showCreateModal.value = false
  selectedPrompt.value = null
  loadPrompts()
  // 移除这里的消息提示，让子组件处理
}

const handlePromptUse = () => {
  showDetailModal.value = false
  loadPrompts() // 刷新使用计数
}

const handlePromptUpdated = () => {
  loadPrompts() // 重新加载数据以反映更新
}

// 组件挂载时加载数据
onMounted(() => {
  loadPrompts()
  loadCategories()
})
</script>

<style scoped>
.prompt-manager {
  padding: 20px;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.prompt-card {
  transition: all 0.3s ease;
  cursor: pointer;
}

.prompt-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
</style>
