<template>
    <div class="ai-model-selector">
        <NFormItem v-if="showLabel" :label="label" size="small" style="margin-bottom: 0; flex: 1;">
            <NSelect v-model:value="selectedModelKey" :options="modelDropdownOptions" :placeholder="placeholder"
                size="small" filterable @update:value="onModelSelect" :disabled="disabled" />
        </NFormItem>
        <NSelect v-else v-model:value="selectedModelKey" :options="modelDropdownOptions" :placeholder="placeholder"
            size="small" filterable @update:value="onModelSelect" :disabled="disabled" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NSelect, NFormItem } from 'naive-ui'
import { api } from '@/lib/api'
import type { AIConfig } from '@shared/types/database'

interface Props {
    modelKey?: string // 当前选中的模型key，格式为 "configId:model"
    placeholder?: string
    disabled?: boolean
    showLabel?: boolean
    label?: string
}

interface Emits {
    (e: 'update:modelKey', value: string): void
    (e: 'configChange', config: AIConfig | null): void
    (e: 'modelChange', model: string): void
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: '选择模型',
    disabled: false,
    showLabel: false,
    label: 'AI模型'
})

const emit = defineEmits<Emits>()

// 数据状态
const configs = ref<AIConfig[]>([])
const selectedModelKey = ref<string>('')

// 计算属性
const modelDropdownOptions = computed(() => {
    if (!configs.value || configs.value.length === 0) return []

    const preferredOptions: Array<{ label: string; value: string; configId: string; configName: string; isPreferred: boolean }> = []
    const regularOptions: Array<{ label: string; value: string; configId: string; configName: string; isPreferred: boolean }> = []

    // 遍历所有启用的配置，分别处理首选和普通配置
    configs.value.forEach(config => {
        const models = Array.isArray(config.models) ? config.models : []
        const isPreferred = config.isPreferred || false
        const targetArray = isPreferred ? preferredOptions : regularOptions

        // 添加默认模型
        if (config.defaultModel) {
            const label = isPreferred
                ? `★ ${config.defaultModel} (${config.name} - 默认)`
                : `${config.defaultModel} (${config.name} - 默认)`

            targetArray.push({
                label,
                value: `${config.configId}:${config.defaultModel}`,
                configId: config.configId,
                configName: config.name,
                isPreferred
            })
        }

        // 添加其他模型
        models.forEach(model => {
            if (model !== config.defaultModel) { // 避免重复添加默认模型
                const label = isPreferred
                    ? `★ ${model} (${config.name})`
                    : `${model} (${config.name})`

                targetArray.push({
                    label,
                    value: `${config.configId}:${model}`,
                    configId: config.configId,
                    configName: config.name,
                    isPreferred
                })
            }
        })

        // 添加自定义模型
        if (config.customModel && !models.includes(config.customModel) && config.customModel !== config.defaultModel) {
            const label = isPreferred
                ? `★ ${config.customModel} (${config.name} - 自定义)`
                : `${config.customModel} (${config.name} - 自定义)`

            targetArray.push({
                label,
                value: `${config.configId}:${config.customModel}`,
                configId: config.configId,
                configName: config.name,
                isPreferred
            })
        }
    })

    // 首选配置的模型排在前面，然后是普通配置的模型
    return [...preferredOptions, ...regularOptions]
})

// 获取当前选中的配置
const selectedConfig = computed(() => {
    if (!selectedModelKey.value) return null
    // 使用第一个冒号分割，因为模型名称可能包含冒号
    const firstColonIndex = selectedModelKey.value.indexOf(':')
    if (firstColonIndex === -1) return null
    const configId = selectedModelKey.value.substring(0, firstColonIndex)
    return configs.value.find(c => c.configId === configId) || null
})

// 获取当前选中的模型
const selectedModel = computed(() => {
    if (!selectedModelKey.value) return ''
    // 使用第一个冒号分割，因为模型名称可能包含冒号
    const firstColonIndex = selectedModelKey.value.indexOf(':')
    if (firstColonIndex === -1) return ''
    const model = selectedModelKey.value.substring(firstColonIndex + 1)
    return model || ''
})

// 加载 AI 配置
const loadConfigs = async () => {
    try {
        console.log('开始加载 AI 配置')
        const allConfigs = await api.aiConfigs.getAll.query()
        configs.value = allConfigs.filter(config => config.enabled)
        console.log('成功获取到启用的 AI 配置:', configs.value.length, '个')

        // 设置默认选择的配置（优先选择首选配置）
        const preferredConfig = configs.value.find(config => config.isPreferred)
        if (preferredConfig) {
            const defaultModel = preferredConfig.defaultModel || ''
            if (defaultModel) {
                selectedModelKey.value = `${preferredConfig.configId}:${defaultModel}`
            }
        } else if (configs.value.length > 0) {
            const firstConfig = configs.value[0]
            const defaultModel = firstConfig.defaultModel || ''
            if (defaultModel) {
                selectedModelKey.value = `${firstConfig.configId}:${defaultModel}`
            }
        }

        // 如果有外部传入的modelKey，使用外部值
        if (props.modelKey) {
            selectedModelKey.value = props.modelKey
        }

        // 触发初始事件
        if (selectedModelKey.value) {
            emit('update:modelKey', selectedModelKey.value)
            emit('configChange', selectedConfig.value)
            emit('modelChange', selectedModel.value)
        }
    } catch (error) {
        console.error("加载AI配置失败:", error)
        configs.value = []
    }
}

// 模型选择处理
const onModelSelect = (modelKey: string) => {
    if (!modelKey) return

    selectedModelKey.value = modelKey

    // 解析选择的模型key，格式为 "configId:model"
    // 使用第一个冒号分割，因为模型名称可能包含冒号
    const firstColonIndex = modelKey.indexOf(':')
    if (firstColonIndex === -1) return
    
    const configId = modelKey.substring(0, firstColonIndex)
    const model = modelKey.substring(firstColonIndex + 1)

    // 更新当前使用的配置
    const config = configs.value.find(c => c.configId === configId)

    console.log('切换到配置:', config?.name, '模型:', model)

    // 触发事件
    emit('update:modelKey', modelKey)
    emit('configChange', config || null)
    emit('modelChange', model || '')
}

// 监听外部modelKey变化
watch(() => props.modelKey, (newModelKey) => {
    if (newModelKey && newModelKey !== selectedModelKey.value) {
        selectedModelKey.value = newModelKey
    }
})

// 组件挂载时加载数据
onMounted(() => {
    loadConfigs()
})

// 暴露方法给父组件
defineExpose({
    loadConfigs,
    selectedConfig,
    selectedModel,
    selectedModelKey,
    configs
})
</script>

<style scoped>
.ai-model-selector {
    width: 100%;
}
</style>