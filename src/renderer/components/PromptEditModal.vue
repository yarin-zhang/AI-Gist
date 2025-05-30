<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" :mask-closable="false" preset="card" style="width: 800px;" title="Prompt 编辑">
    <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top">
      <NFlex vertical size="large">
        <!-- 基本信息 -->
        <NCard title="基本信息" size="small">
          <NFlex vertical size="medium">
            <NFormItem label="标题" path="title">
              <NInput v-model:value="formData.title" placeholder="请输入 Prompt 标题" />
            </NFormItem>
            
            <NFormItem label="描述" path="description">
              <NInput 
                v-model:value="formData.description" 
                type="textarea" 
                placeholder="请输入 Prompt 描述（可选）"
                :rows="2"
              />
            </NFormItem>

            <NFlex>
              <NFormItem label="分类" style="flex: 1">
                <NSelect
                  v-model:value="formData.categoryId"
                  :options="categoryOptions"
                  placeholder="选择分类"
                  clearable
                />
              </NFormItem>
              
              <NFormItem label="标签" style="flex: 1">
                <NInput 
                  v-model:value="formData.tags" 
                  placeholder="用逗号分隔，如：写作,创意"
                />
              </NFormItem>
            </NFlex>
          </NFlex>
        </NCard>

        <!-- Prompt 内容 -->
        <NCard title="Prompt 内容" size="small">
          <NFormItem label="内容" path="content">
            <NInput
              v-model:value="formData.content"
              type="textarea"
              placeholder="请输入 Prompt 内容，使用 {{变量名}} 来定义变量"
              :rows="8"
              show-count
            />
          </NFormItem>
          
          <NAlert type="info" style="margin-top: 8px;">
            <NText depth="3">
              提示：在内容中使用 {{变量名}} 来定义可替换的变量，例如：{{用户名}}、{{产品名称}} 等。
            </NText>
          </NAlert>
        </NCard>

        <!-- 变量定义 -->
        <NCard size="small">
          <template #header>
            <NFlex justify="space-between" align="center">
              <NText>变量定义</NText>
              <NButton size="small" @click="addVariable">
                <template #icon>
                  <NIcon><Plus /></NIcon>
                </template>
                添加变量
              </NButton>
            </NFlex>
          </template>

          <div v-if="formData.variables.length === 0">
            <NEmpty description="暂无变量，点击上方按钮添加" size="small" />
          </div>

          <NFlex v-else vertical size="medium">
            <NCard 
              v-for="(variable, index) in formData.variables" 
              :key="index"
              size="small"
              class="variable-card"
            >
              <template #header>
                <NFlex justify="space-between" align="center">
                  <NText>变量 {{ index + 1 }}</NText>
                  <NButton size="small" text type="error" @click="removeVariable(index)">
                    <template #icon>
                      <NIcon><Trash /></NIcon>
                    </template>
                  </NButton>
                </NFlex>
              </template>

              <NFlex vertical size="small">
                <NFlex>
                  <NFormItem label="变量名" style="flex: 1">
                    <NInput 
                      v-model:value="variable.name" 
                      placeholder="如：userName"
                    />
                  </NFormItem>
                  <NFormItem label="显示标签" style="flex: 1">
                    <NInput 
                      v-model:value="variable.label" 
                      placeholder="如：用户名"
                    />
                  </NFormItem>
                  <NFormItem label="类型" style="width: 120px">
                    <NSelect
                      v-model:value="variable.type"
                      :options="variableTypeOptions"
                    />
                  </NFormItem>
                </NFlex>

                <NFlex>
                  <NFormItem label="默认值" style="flex: 1">
                    <NInput 
                      v-model:value="variable.defaultValue" 
                      placeholder="默认值（可选）"
                    />
                  </NFormItem>
                  <NFormItem label="占位符" style="flex: 1">
                    <NInput 
                      v-model:value="variable.placeholder" 
                      placeholder="输入提示（可选）"
                    />
                  </NFormItem>
                  <NFormItem label="必填" style="width: 80px">
                    <NSwitch v-model:value="variable.required" />
                  </NFormItem>
                </NFlex>

                <NFormItem v-if="variable.type === 'select'" label="选项">
                  <NInput 
                    v-model:value="variable.options" 
                    placeholder="用逗号分隔选项，如：选项1,选项2,选项3"
                  />
                </NFormItem>
              </NFlex>
            </NCard>
          </NFlex>
        </NCard>
      </NFlex>
    </NForm>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="handleCancel">取消</NButton>
        <NButton type="primary" @click="handleSave" :loading="saving">
          {{ isEdit ? '更新' : '创建' }}
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal,
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
  useMessage
} from 'naive-ui'
import { Plus, Trash } from '@vicons/tabler'
import { trpc } from '../lib/trpc'

interface Variable {
  name: string
  label: string
  type: string
  options?: string
  defaultValue?: string
  required: boolean
  placeholder?: string
}

interface Props {
  show: boolean
  prompt?: any
  categories: any[]
}

interface Emits {
  (e: 'update:show', value: boolean): void
  (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()
const formRef = ref()
const saving = ref(false)

// 表单数据
const formData = ref({
  title: '',
  description: '',
  content: '',
  categoryId: null,
  tags: '',
  variables: [] as Variable[]
})

// 计算属性
const isEdit = computed(() => !!props.prompt?.id)

const categoryOptions = computed(() => [
  { label: '无分类', value: null },
  ...props.categories.map(cat => ({
    label: cat.name,
    value: cat.id
  }))
])

const variableTypeOptions = [
  { label: '单行文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
  { label: '下拉选择', value: 'select' }
]

// 表单验证规则
const rules = {
  title: {
    required: true,
    message: '请输入标题',
    trigger: 'blur'
  },
  content: {
    required: true,
    message: '请输入 Prompt 内容',
    trigger: 'blur'
  }
}

// 监听 prompt 变化，初始化表单
watch(() => props.prompt, (newPrompt) => {
  if (newPrompt) {
    formData.value = {
      title: newPrompt.title || '',
      description: newPrompt.description || '',
      content: newPrompt.content || '',
      categoryId: newPrompt.categoryId || null,
      tags: newPrompt.tags || '',
      variables: newPrompt.variables?.map(v => ({
        name: v.name,
        label: v.label,
        type: v.type || 'text',
        options: v.options || '',
        defaultValue: v.defaultValue || '',
        required: v.required !== false,
        placeholder: v.placeholder || ''
      })) || []
    }
  } else {
    // 重置表单
    formData.value = {
      title: '',
      description: '',
      content: '',
      categoryId: null,
      tags: '',
      variables: []
    }
  }
}, { immediate: true })

// 方法
const addVariable = () => {
  formData.value.variables.push({
    name: '',
    label: '',
    type: 'text',
    options: '',
    defaultValue: '',
    required: true,
    placeholder: ''
  })
}

const removeVariable = (index: number) => {
  formData.value.variables.splice(index, 1)
}

const handleCancel = () => {
  emit('update:show', false)
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
    saving.value = true

    const data = {
      title: formData.value.title,
      description: formData.value.description || undefined,
      content: formData.value.content,
      categoryId: formData.value.categoryId || undefined,
      tags: formData.value.tags || undefined,
      variables: formData.value.variables.filter(v => v.name && v.label)
    }

    if (isEdit.value) {
      await trpc.prompts.update.mutate({
        id: props.prompt.id,
        data
      })
      message.success('Prompt 更新成功')
    } else {
      await trpc.prompts.create.mutate(data)
      message.success('Prompt 创建成功')
    }

    emit('saved')
  } catch (error) {
    message.error(isEdit.value ? '更新失败' : '创建失败')
    console.error(error)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.variable-card {
  border: 1px solid #e0e0e6;
}
</style>
