import { computed, ref } from 'vue'
import type { AIConfig } from '@shared/types/ai'
import { api } from '@/lib/api'
import { onDataChange } from '@/lib/services/data-change-events'

export interface AIModelOption {
  key: string
  config: AIConfig
  model: string
  isDefault: boolean
}

// 全应用共享：AI 面板、新建时的 AI 生成和启动器用同一个选择，切到别的提示词也不会重置
const configs = ref<AIConfig[]>([])
const selectedKey = ref('')
const loaded = ref(false)
let loading: Promise<void> | null = null
let subscribed = false

const modelKey = (config: AIConfig, model: string) => `${config.configId}:${model}`

const parseKey = (key: string) => {
  const separator = key.indexOf(':')
  return separator < 0 ? null : { configId: key.slice(0, separator), model: key.slice(separator + 1) }
}

/** 首选配置排在前面；每个配置先列默认模型，再列其他模型和自定义模型 */
export function buildModelOptions(list: AIConfig[]): AIModelOption[] {
  const ordered = [...list].sort((a, b) => Number(Boolean(b.isPreferred)) - Number(Boolean(a.isPreferred)))
  return ordered.flatMap(config => {
    const models = [
      config.defaultModel,
      ...(Array.isArray(config.models) ? config.models : []),
      config.customModel,
    ].filter((model): model is string => Boolean(model))
    return [...new Set(models)].map(model => ({
      key: modelKey(config, model),
      config,
      model,
      isDefault: model === config.defaultModel,
    }))
  })
}

async function load(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const all = await api.aiConfigs.getAll.query()
      configs.value = all.filter(config => config.enabled)
    } catch {
      configs.value = []
    } finally {
      loaded.value = true
      loading = null
    }
    const options = buildModelOptions(configs.value)
    if (!options.some(option => option.key === selectedKey.value)) {
      selectedKey.value = options.find(option => option.isDefault)?.key || options[0]?.key || ''
    }
  })()
  return loading
}

export function useAIModels() {
  if (!subscribed) {
    subscribed = true
    onDataChange('ai_configs', () => { void load() })
  }
  if (!loaded.value) void load()

  const options = computed(() => buildModelOptions(configs.value))
  const selected = computed(() => {
    const parsed = parseKey(selectedKey.value)
    if (!parsed) return null
    const config = configs.value.find(item => item.configId === parsed.configId)
    return config ? { config, model: parsed.model } : null
  })

  return {
    configs,
    options,
    selectedKey,
    selected,
    loaded,
    hasModels: computed(() => options.value.length > 0),
    refresh: load,
    select: (key: string) => { selectedKey.value = key },
  }
}
