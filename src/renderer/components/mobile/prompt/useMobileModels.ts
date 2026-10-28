import { computed, ref } from 'vue'
import type { AIConfig } from '@shared/types/ai'
import { databaseService } from '~/lib/db'
import { isMobileSupportedProvider, pickDefaultModelKey, resolveModelKey } from './mobile-ai'

// 本次运行内共享：在 AI 生成页换了模型，试运行和快速优化也用同一个
const selectedKey = ref('')

/**
 * 移动端已启用的 AI 配置和当前选中的模型。
 * 直接从已启用列表里挑首选配置，避免再查一次库时两边数据不一致。
 * 只能在桌面版使用的服务（Ollama、LM Studio、Azure）不进可选列表，首选是它们时改用下一个配置。
 */
export function useMobileModels() {
  const configs = ref<AIConfig[]>([])
  const loading = ref(true)

  const load = async () => {
    loading.value = true
    try {
      const enabled = await databaseService.aiConfig.getEnabledAIConfigs()
      configs.value = enabled.filter(config => isMobileSupportedProvider(config.type))
    } catch (error) {
      console.error('加载 AI 配置失败:', error)
      configs.value = []
      throw error
    } finally {
      loading.value = false
    }
    if (!resolveModelKey(configs.value, selectedKey.value)) {
      selectedKey.value = pickDefaultModelKey(configs.value)
    }
  }

  const selected = computed(() => resolveModelKey(configs.value, selectedKey.value))

  /** 只有一个配置时只显示模型名，多个配置时在后面带上配置名：胶囊放不下时先省略配置名 */
  const selectedLabel = computed(() => {
    const current = selected.value
    if (!current) return ''
    return configs.value.length > 1 ? `${current.model} · ${current.config.name}` : current.model
  })

  const select = (key: string) => {
    selectedKey.value = key
  }

  return { configs, loading, selectedKey, selected, selectedLabel, load, select }
}
