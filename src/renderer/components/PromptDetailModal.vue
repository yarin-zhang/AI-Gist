<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" preset="card" style="width: 900px;" :title="prompt?.title">
    <NFlex vertical size="large" v-if="prompt">
      <!-- Prompt 信息 -->
      <NCard size="small">
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
            <NFlex size="small">
              <NTag 
                v-for="tag in prompt.tags.split(',')" 
                :key="tag"
                size="small"
                type="info"
              >
                {{ tag.trim() }}
              </NTag>
            </NFlex>
          </div>
        </NFlex>
      </NCard>

      <!-- 原始内容 -->
      <NCard title="原始 Prompt" size="small">
        <NInput
          :value="prompt.content"
          type="textarea"
          readonly
          :rows="8"
          style="font-family: monospace;"
        />
        <NFlex justify="end" style="margin-top: 8px;">
          <NButton size="small" @click="copyToClipboard(prompt.content)">
            <template #icon>
              <NIcon><Copy /></NIcon>
            </template>
            复制原始内容
          </NButton>
        </NFlex>
      </NCard>

      <!-- 变量填充 -->
      <NCard v-if="prompt.variables && prompt.variables.length > 0" size="small">
        <template #header>
          <NFlex justify="space-between" align="center">
            <NText>变量填充</NText>
            <NButton size="small" @click="fillFromTemplate">
              <template #icon>
                <NIcon><Wand /></NIcon>
              </template>
              使用模板
            </NButton>
          </NFlex>
        </template>

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
              :placeholder="variable.placeholder || `请输入${variable.label}`"
            />
            <NInput
              v-else-if="variable.type === 'textarea'"
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
            <NButton type="primary" @click="generateFilledPrompt">
              生成填充后的 Prompt
            </NButton>
          </NFlex>
        </NFlex>
      </NCard>

      <!-- 填充后的内容 -->
      <NCard v-if="filledContent" title="填充后的 Prompt" size="small">
        <NInput
          :value="filledContent"
          type="textarea"
          readonly
          :rows="8"
          style="font-family: monospace;"
        />
        <NFlex justify="end" style="margin-top: 8px;">
          <NButton @click="copyToClipboard(filledContent)">
            <template #icon>
              <NIcon><Copy /></NIcon>
            </template>
            复制填充内容
          </NButton>
          <NButton type="primary" @click="usePrompt">
            <template #icon>
              <NIcon><Check /></NIcon>
            </template>
            使用此 Prompt
          </NButton>
        </NFlex>
      </NCard>

      <!-- 使用历史 -->
      <NCard title="最近使用记录" size="small" v-if="useHistory.length > 0">
        <NFlex vertical size="small">
          <NCard 
            v-for="(record, index) in useHistory" 
            :key="index"
            size="small"
            style="background-color: #fafafa;"
          >
            <NFlex justify="space-between" align="center">
              <NText depth="3" style="font-size: 12px;">
                {{ record.date }}
              </NText>
              <NButton size="small" text @click="loadHistoryRecord(record)">
                重新加载
              </NButton>
            </NFlex>
            <NText style="margin-top: 8px; font-size: 14px;">
              {{ record.content.substring(0, 100) }}...
            </NText>
          </NCard>
        </NFlex>
      </NCard>
    </NFlex>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="handleClose">关闭</NButton>
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
import { Heart, Edit, Copy, Wand, Check } from '@vicons/tabler'
import { trpc } from '../lib/trpc'

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
const filledContent = ref('')
const useHistory = ref([])

// 初始化变量值
const initializeVariables = () => {
  if (!props.prompt?.variables) return
  
  const values = {}
  props.prompt.variables.forEach(variable => {
    values[variable.name] = variable.defaultValue || ''
  })
  variableValues.value = values
}

// 获取选择框选项
const getSelectOptions = (optionsString) => {
  if (!optionsString) return []
  return optionsString.split(',').map(option => ({
    label: option.trim(),
    value: option.trim()
  }))
}

// 生成填充后的 Prompt
const generateFilledPrompt = () => {
  if (!props.prompt) return
  
  let content = props.prompt.content
  
  // 替换变量
  Object.entries(variableValues.value).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g')
    content = content.replace(regex, value || `{{${key}}}`)
  })
  
  filledContent.value = content
}

// 清空变量
const clearVariables = () => {
  initializeVariables()
  filledContent.value = ''
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
    
    // 通过 tRPC 增加使用计数
    await trpc.prompts.incrementUseCount.mutate(props.prompt.id)
    
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
    await trpc.prompts.toggleFavorite.mutate(props.prompt.id)
    message.success('收藏状态已更新')
    emit('updated') // 通知父组件重新加载数据
  } catch (error) {
    message.error('更新收藏状态失败')
    console.error(error)
  }
}

// 从模板填充
const fillFromTemplate = () => {
  // 这里可以实现一些常用的模板填充逻辑
  message.info('模板功能开发中...')
}

// 加载历史记录
const loadHistoryRecord = (record) => {
  variableValues.value = { ...record.variables }
  filledContent.value = record.content
  message.success('已加载历史记录')
}

// 格式化日期
const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

// 关闭弹窗
const handleClose = () => {
  emit('update:show', false)
}

// 监听 prompt 变化
watch(() => props.prompt, (newPrompt) => {
  if (newPrompt) {
    initializeVariables()
    filledContent.value = ''
    
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

// 监听显示状态
watch(() => props.show, (show) => {
  if (!show) {
    filledContent.value = ''
  }
})
</script>

<style scoped>
:deep(.n-input__textarea-el) {
  font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
</style>
