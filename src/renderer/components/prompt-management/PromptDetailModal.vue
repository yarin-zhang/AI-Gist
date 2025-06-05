<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" preset="card" style="width: 1200px; height: 90%;" :title="prompt?.title">
    <div style="height: 100%; display: flex; flex-direction: column;" v-if="prompt">
      <!-- Prompt 信息头部 -->
      <NCard size="small" style="margin-bottom: 16px;">
        <NFlex vertical size="medium">
          <NFlex justify="space-between" align="center">
            <NFlex align="center">
              <NTag v-if="prompt.category" :color="{ color: prompt.category.color || '#18a058' }">
                {{ prompt.category.name }}
              </NTag>
              <NText depth="3">使用 {{ prompt.useCount }} 次</NText>
              <NText depth="3">{{ formatDate(prompt.updatedAt) }}</NText>
            </NFlex>
            <NFlex>
              <NButton 
                text 
                @click="toggleFavorite"
                :type="prompt.isFavorite ? 'error' : 'default'"
              >
                <template #icon>
                  <NIcon><Heart /></NIcon>
                </template>
                {{ prompt.isFavorite ? '取消收藏' : '收藏' }}
              </NButton>
              <NButton text @click="$emit('edit', prompt)">
                <template #icon>
                  <NIcon><Edit /></NIcon>
                </template>
                编辑
              </NButton>
            </NFlex>
          </NFlex>

          <NText v-if="prompt.description">{{ prompt.description }}</NText>

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
        </NFlex>
      </NCard>

      <!-- 主内容区 - 左右布局 -->
      <div v-show="!showHistoryPage" style="flex: 1; display: flex; gap: 20px; overflow: hidden;">
        <!-- 左侧：变量输入区 -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <NScrollbar style="max-height: 100%;">
            <!-- 变量填充 -->
            <NCard v-if="prompt.variables && prompt.variables.length > 0" size="small" title="变量设置">
              <NFlex vertical size="medium">
                <NFormItem 
                  v-for="variable in prompt.variables" 
                  :key="variable.id"
                  :label="variable.label"
                  :required="variable.required"
                >
                  <NInput
                    v-if="variable.type === 'text'"
                    v-model:value="variableValues[variable.name]"
                    type="textarea"
                    :placeholder="variable.placeholder || `请输入${variable.label}`"
                    :rows="3"
                  />
                  <NSelect
                    v-else-if="variable.type === 'select'"
                    v-model:value="variableValues[variable.name]"
                    :options="getSelectOptions(variable.options)"
                    :placeholder="variable.placeholder || `请选择${variable.label}`"
                  />
                </NFormItem>

                <NFlex justify="end">
                  <NButton @click="clearVariables">清空</NButton>
                </NFlex>
              </NFlex>
            </NCard>

            <!-- 无变量时的提示 -->
            <NCard v-else size="small" title="变量设置">
              <NEmpty description="此 Prompt 没有可配置的变量" style="padding: 40px;">
                <template #icon>
                  <NIcon><Wand /></NIcon>
                </template>
              </NEmpty>
            </NCard>
          </NScrollbar>
        </div>

        <!-- 右侧：结果预览区 -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <NScrollbar style="max-height: 100%;">
            <!-- Prompt 内容 -->
            <NCard size="small">
              <template #header>
                <NFlex justify="space-between" align="center">
                  <NText strong>Prompt 内容</NText>
                  <NFlex>
                    <NButton size="small" @click="copyToClipboard(filledContent)">
                      <template #icon>
                        <NIcon><Copy /></NIcon>
                      </template>
                      复制内容
                    </NButton>
                    <NButton size="small" v-if="hasVariables" type="primary" @click="usePrompt">
                      <template #icon>
                        <NIcon><Check /></NIcon>
                      </template>
                      使用此 Prompt
                    </NButton>
                  </NFlex>
                </NFlex>
              </template>
              
              <NInput
                :value="filledContent"
                type="textarea"
                readonly
                :rows="12"
                style="font-family: monospace;"
                :placeholder="!filledContent ? '内容为空' : ''"
              />
              
              <!-- 如果有未填写的变量，显示提示 -->
              <NFlex v-if="hasUnfilledVariables" align="center" style="margin-top: 8px; padding: 8px; border-radius: 6px;">
                <NIcon color="#fa8c16"><Wand /></NIcon>
                <NText style="font-size: 14px;">
                  检测到未填写的变量，请在左侧填写以生成完整的 Prompt
                </NText>
              </NFlex>
            </NCard>
          </NScrollbar>
        </div>
      </div>

      <!-- 历史记录页面 -->
      <div v-show="showHistoryPage" style="flex: 1; display: flex; gap: 20px; overflow: hidden;">
        <!-- 左侧：历史记录列表 -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <NScrollbar style="max-height: 100%;">
            <NCard size="small" title="使用历史记录">
              <NFlex vertical size="small" v-if="useHistory.length > 0">
                <NCard 
                  v-for="(record, index) in useHistory" 
                  :key="index"
                  size="small"
                  :class="{ 'selected-history': selectedHistoryIndex === index }"
                  style="cursor: pointer; transition: all 0.2s;"
                  @click="selectHistoryRecord(index)"
                >
                  <NFlex justify="space-between" align="center">
                    <NText depth="3" style="font-size: 12px;">
                      {{ record.date }}
                    </NText>
                    <NButton size="small" text @click.stop="loadHistoryRecord(record)">
                      重新加载
                    </NButton>
                  </NFlex>
                  <NText style="margin-top: 8px; font-size: 14px;" :depth="selectedHistoryIndex === index ? 1 : 2">
                    {{ record.content.substring(0, 100) }}{{ record.content.length > 100 ? '...' : '' }}
                  </NText>
                </NCard>
              </NFlex>
              <NEmpty v-else description="暂无使用历史记录" style="padding: 40px;">
                <template #icon>
                  <NIcon><History /></NIcon>
                </template>
              </NEmpty>
            </NCard>
          </NScrollbar>
        </div>

        <!-- 右侧：历史记录预览 -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <NScrollbar style="max-height: 100%;">
            <NCard size="small" title="历史记录预览">
              <div v-if="selectedHistory">
                <!-- 变量信息 -->
                <div v-if="selectedHistory.variables && Object.keys(selectedHistory.variables).length > 0" style="margin-bottom: 16px;">
                  <NText strong style="margin-bottom: 8px; display: block;">使用的变量：</NText>
                  <NFlex vertical size="small">
                    <div v-for="(value, key) in selectedHistory.variables" :key="key" style="padding: 8px; background: var(--n-color-target); border-radius: 6px;">
                      <NText depth="2" style="font-size: 12px;">{{ key }}:</NText>
                      <NText style="margin-left: 8px;">{{ value }}</NText>
                    </div>
                  </NFlex>
                </div>

                <!-- 完整内容 -->
                <div>
                  <NText strong style="margin-bottom: 8px; display: block;">完整内容：</NText>
                  <NInput
                    :value="selectedHistory.content"
                    type="textarea"
                    readonly
                    :rows="10"
                    style="font-family: monospace;"
                  />
                </div>

                <!-- 操作按钮 -->
                <NFlex justify="end" style="margin-top: 16px;">
                  <NButton @click="copyToClipboard(selectedHistory.content)">
                    <template #icon>
                      <NIcon><Copy /></NIcon>
                    </template>
                    复制此记录
                  </NButton>
                </NFlex>
              </div>
              <NEmpty v-else description="请选择一条历史记录查看详情" style="padding: 40px;">
                <template #icon>
                  <NIcon><FileText /></NIcon>
                </template>
              </NEmpty>
            </NCard>
          </NScrollbar>
        </div>
      </div>
    </div>

    <template #footer>
      <NFlex justify="space-between">
        <div>
          <!-- 历史记录按钮（主页面左下角） -->
          <NButton v-show="!showHistoryPage" @click="showHistoryPage = true" :disabled="useHistory.length === 0">
            <template #icon>
              <NIcon><History /></NIcon>
            </template>
            查看历史记录 ({{ useHistory.length }})
          </NButton>
          
          <!-- 返回按钮（历史记录页面左下角） -->
          <NButton v-show="showHistoryPage" @click="showHistoryPage = false">
            <template #icon>
              <NIcon><ArrowLeft /></NIcon>
            </template>
            返回
          </NButton>
        </div>
        
        <NFlex>
          <NButton @click="handleClose">关闭</NButton>
        </NFlex>
      </NFlex>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  NModal,
  NCard,
  NFlex,
  NText,
  NTag,
  NButton,
  NIcon,
  NInput,
  NFormItem,
  NSelect,
  useMessage
} from 'naive-ui'
import { Heart, Edit, Copy, Wand, Check, History, ArrowLeft, FileText } from '@vicons/tabler'
import { api } from '@/lib/api'

interface Props {
  show: boolean
  prompt?: any
}

interface Emits {
  (e: 'update:show', value: boolean): void
  (e: 'use'): void
  (e: 'edit', prompt: any): void
  (e: 'updated'): void // 添加数据更新事件
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()

// 响应式数据
const variableValues = ref({})
const useHistory = ref([])
const showHistoryPage = ref(false)
const selectedHistoryIndex = ref(-1)

// 初始化变量值
const initializeVariables = () => {
  if (!props.prompt?.variables) {
    variableValues.value = {}
    return
  }
  
  const values = {}
  props.prompt.variables.forEach(variable => {
    // 确保每个变量都有初始值，即使是空字符串
    values[variable.name] = variable.defaultValue || ''
  })
  variableValues.value = values
  
  console.log('初始化变量:', values) // 调试用
  console.log('Prompt 内容:', props.prompt.content) // 调试用
}

// 获取选择框选项
const getSelectOptions = (options) => {
  if (!options) return []
  // 如果是数组，直接使用；如果是字符串，按逗号分割
  const optionsArray = Array.isArray(options) ? options : options.split(',').map(opt => opt.trim()).filter(opt => opt)
  return optionsArray.map(option => ({
    label: option,
    value: option
  }))
}

// 生成填充后的 Prompt - 改为计算属性，自动生成
const filledContent = computed(() => {
  if (!props.prompt?.content) return ''
  
  let content = props.prompt.content
  
  // 如果没有变量，直接返回原始内容
  if (!props.prompt.variables || props.prompt.variables.length === 0) {
    return content
  }
  
  // 替换变量
  Object.entries(variableValues.value).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    // 如果变量有值，就替换；如果没有值，保留原始的 {{key}} 格式
    if (value !== undefined && value !== null && value.toString().trim() !== '') {
      content = content.replace(regex, value.toString())
    }
  })
  
  console.log('计算填充内容:', { 
    original: props.prompt.content, 
    variables: variableValues.value, 
    result: content 
  }) // 调试用
  
  return content
})

// 是否有变量
const hasVariables = computed(() => {
  return props.prompt?.variables && props.prompt.variables.length > 0
})

// 是否有未填写的变量
const hasUnfilledVariables = computed(() => {
  if (!hasVariables.value) return false
  
  // 检查是否还有未替换的变量占位符
  const content = filledContent.value
  const hasPlaceholders = /\{\{[^}]+\}\}/.test(content)
  
  return hasPlaceholders
})

// 选中的历史记录
const selectedHistory = computed(() => {
  if (selectedHistoryIndex.value >= 0 && selectedHistoryIndex.value < useHistory.value.length) {
    return useHistory.value[selectedHistoryIndex.value]
  }
  return null
})

// 清空变量
const clearVariables = () => {
  initializeVariables()
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

// 使用 Prompt
const usePrompt = async () => {
  try {
    // 保存使用记录到本地存储
    const record = {
      date: formatDate(new Date()),
      content: filledContent.value,
      variables: { ...variableValues.value }
    }
    
    useHistory.value.unshift(record)
    if (useHistory.value.length > 5) {
      useHistory.value = useHistory.value.slice(0, 5)
    }
    
    // 保存到本地存储
    localStorage.setItem(`prompt_history_${props.prompt.id}`, JSON.stringify(useHistory.value))
    
    // 增加使用计数
    await api.prompts.incrementUseCount.mutate(props.prompt.id)
    
    // 复制到剪贴板
    await copyToClipboard(filledContent.value)
    
    message.success('Prompt 已复制，使用计数已更新')
    emit('use')
    emit('updated') // 通知父组件重新加载数据以更新使用计数
  } catch (error) {
    message.error('操作失败')
    console.error(error)
  }
}

// 切换收藏状态
const toggleFavorite = async () => {
  try {
    await api.prompts.toggleFavorite.mutate(props.prompt.id)
    message.success('收藏状态已更新')
    emit('updated') // 通知父组件重新加载数据
  } catch (error) {
    message.error('更新收藏状态失败')
    console.error(error)
  }
}

// 加载历史记录
const loadHistoryRecord = (record) => {
  variableValues.value = { ...record.variables }
  message.success('已加载历史记录')
}

// 选择历史记录
const selectHistoryRecord = (index) => {
  selectedHistoryIndex.value = index
}

// 格式化日期
const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
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

// 关闭弹窗
const handleClose = () => {
  emit('update:show', false)
}

// 监听 prompt 变化
watch(() => props.prompt, (newPrompt) => {
  console.log('Prompt 变化:', newPrompt) // 调试用
  if (newPrompt) {
    initializeVariables()
    
    // 加载使用历史
    const history = localStorage.getItem(`prompt_history_${newPrompt.id}`)
    if (history) {
      try {
        useHistory.value = JSON.parse(history)
      } catch {
        useHistory.value = []
      }
    } else {
      useHistory.value = []
    }
  }
}, { immediate: true })

// 监听变量值变化，用于调试
watch(() => variableValues.value, (newValues) => {
  console.log('变量值变化:', newValues)
  console.log('填充后内容:', filledContent.value)
}, { deep: true })

// 监听显示状态
watch(() => props.show, (show) => {
  if (!show) {
    // 关闭弹窗时重置状态
    showHistoryPage.value = false
    selectedHistoryIndex.value = -1
  }
})
</script>

<style scoped>
.selected-history {
  border: 2px solid var(--n-color-target);
  background: var(--n-color-target);
}

.selected-history:hover {
  border-color: var(--n-color-target);
}
</style>
