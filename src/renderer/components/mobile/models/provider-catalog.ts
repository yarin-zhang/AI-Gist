import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { codeSlashOutline } from 'ionicons/icons'
import type { AIConfig, AIProviderType } from '@shared/types'
import {
  useAIProviderChoices,
  type ProviderChoice,
  type ProviderGroupKey
} from '~/composables/ai/useAIProviderChoices'
import { isMobileSupportedProvider } from '~/components/mobile/prompt/mobile-ai'

/** 服务商方块的颜色，只取分类色 */
export type ProviderTone = 'blue' | 'orange' | 'pink' | 'violet' | 'green' | 'teal' | 'amber' | 'grey'

export interface ProviderVisual {
  /** 方块里显示的首字母（有 icon 时不显示） */
  initial: string
  tone: ProviderTone
  /** 自定义兼容服务没有品牌字母，用图标表示 */
  icon?: string
}

const TYPE_TONES: Record<AIProviderType, ProviderTone> = {
  openai: 'green',
  anthropic: 'orange',
  google: 'blue',
  azure: 'teal',
  deepseek: 'blue',
  mistral: 'amber',
  openrouter: 'violet',
  siliconflow: 'violet',
  aliyun: 'orange',
  tencent: 'blue',
  zhipu: 'teal',
  ollama: 'pink',
  lmstudio: 'violet'
}

const CHOICE_TONES: Record<string, ProviderTone> = {
  'preset:groq': 'pink',
  'preset:moonshot': 'violet',
  'preset:together': 'teal',
  'preset:vllm': 'amber',
  'custom:openai': 'teal',
  'custom:claude': 'orange'
}

/**
 * 移动端服务商分组顺序：自定义 → 在线 → 本地。
 * 这是 issue #58 对移动端的要求（手机连本地模型不方便，不适合排在前面），
 * 分组成员与桌面端完全一致，只是顺序不同。
 */
const MOBILE_GROUP_ORDER: ProviderGroupKey[] = ['custom', 'online', 'local']

/** 添加页服务商宫格里直接露出的几个常用项，其余收进「全部」面板 */
const FEATURED_CHOICE_IDS = ['custom:openai', 'official:openai', 'official:anthropic']

/** 服务商目录里是中文名的几家：按界面语言显示（英文等界面用对外的英文名） */
const LOCALIZED_PROVIDER_TYPES: AIProviderType[] = ['siliconflow', 'aliyun', 'zhipu', 'tencent']

const firstLetter = (label: string) => Array.from(label.trim())[0]?.toUpperCase() || '?'

export const getChoiceVisual = (choice: Pick<ProviderChoice, 'id' | 'type' | 'label'>): ProviderVisual => ({
  initial: firstLetter(choice.label),
  tone: CHOICE_TONES[choice.id] || TYPE_TONES[choice.type] || 'blue',
  icon: choice.id.startsWith('custom:') ? codeSlashOutline : undefined
})

/** 在桌面端服务商目录的基础上，补上移动端需要的分组顺序、方块外观和按配置反查 */
export function useMobileProviderCatalog() {
  const catalog = useAIProviderChoices()
  const { t } = useI18n()

  const localizedName = (type: AIProviderType) => (LOCALIZED_PROVIDER_TYPES.includes(type)
    ? t(`mobileModels.providerNames.${type}`)
    : '')

  const localizeChoice = (choice: ProviderChoice): ProviderChoice => {
    const name = choice.id === `official:${choice.type}` ? localizedName(choice.type) : ''
    return name ? { ...choice, label: name, defaultName: name } : choice
  }

  const allProviderChoices = computed(() => catalog.allProviderChoices.value.map(localizeChoice))

  /** 只能在桌面版使用的服务（Ollama、LM Studio、Azure）不出现在移动端的添加面板里 */
  const groups = computed(() => MOBILE_GROUP_ORDER
    .map(key => catalog.providerGroups.value.find(group => group.key === key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group))
    .map(group => ({
      ...group,
      providers: group.providers.filter(choice => isMobileSupportedProvider(choice.type)).map(localizeChoice)
    }))
    .filter(group => group.providers.length > 0))

  const availableChoiceCount = computed(() => groups.value.reduce((count, group) => count + group.providers.length, 0))

  /** 面板底部说明用：被隐藏的服务商名称 */
  const desktopOnlyNames = computed(() => allProviderChoices.value
    .filter(choice => choice.id === `official:${choice.type}` && !isMobileSupportedProvider(choice.type))
    .map(choice => choice.label))

  const findChoice = (id: string) => allProviderChoices.value.find(choice => choice.id === id)

  const officialChoiceFor = (type: AIProviderType) => findChoice(`official:${type}`)

  const choiceForConfig = (config: AIConfig) => findChoice(catalog.resolveProviderChoiceId(config))
    || officialChoiceFor(config.type)

  const visualForConfig = (config: AIConfig): ProviderVisual => {
    const choice = choiceForConfig(config)
    return choice ? getChoiceVisual(choice) : { initial: firstLetter(config.name), tone: TYPE_TONES[config.type] || 'blue' }
  }

  /** 详情页头部的服务名称：官方服务用按语言显示的名称，兼容服务和预设沿用目录里的叫法 */
  const getConfigDisplayLabel = (config: AIConfig) => {
    const name = catalog.resolveProviderChoiceId(config) === `official:${config.type}` ? localizedName(config.type) : ''
    return name || catalog.getConfigDisplayLabel(config)
  }

  /** 宫格露出的三项：选中的服务商不在常用项里时，把它放到第一位 */
  const featuredChoices = (selectedId: string) => {
    const ids = FEATURED_CHOICE_IDS.includes(selectedId)
      ? FEATURED_CHOICE_IDS
      : [selectedId, ...FEATURED_CHOICE_IDS.slice(0, FEATURED_CHOICE_IDS.length - 1)]
    return ids.map(findChoice).filter((choice): choice is ProviderChoice => Boolean(choice))
  }

  return {
    ...catalog,
    allProviderChoices,
    groups,
    availableChoiceCount,
    desktopOnlyNames,
    getConfigDisplayLabel,
    findChoice,
    officialChoiceFor,
    choiceForConfig,
    visualForConfig,
    featuredChoices
  }
}

export { isLocalProvider } from '~/composables/ai/useAIProviderChoices'
export type { ProviderChoice, ProviderGroupKey }
