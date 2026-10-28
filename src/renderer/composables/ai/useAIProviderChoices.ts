import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    Api, Atom, BrandGoogle, BrandOpenSource, BrandWindows, Circles, Cloud, DeviceDesktop,
    LetterA, LetterD, LetterM, LetterT, LetterX, LetterZ, Route, Server,
} from '@vicons/tabler'
import type { AIConfig, AIProviderType } from '@shared/types/ai'
import { getDefaultBaseURL, getProviderMetadata } from '@shared/ai-provider-metadata'
import i18n from '@renderer/i18n'

export type ProviderGroupKey = 'online' | 'local' | 'custom'

export interface ProviderChoice {
    id: string
    type: AIProviderType
    group: ProviderGroupKey
    label: string
    /** 卡片上的一行短说明 */
    tag: string
    /** 悬停时显示的完整介绍 */
    description: string
    icon: Component
    defaultName: string
    baseURL?: string
    placeholder?: string
    apiKeyUrl?: string
    docUrl?: string
    custom?: boolean
}

export const LOCAL_PROVIDER_TYPES: AIProviderType[] = ['ollama', 'lmstudio']
const ONLINE_PROVIDER_ORDER: AIProviderType[] = [
    'openai', 'anthropic', 'google', 'azure', 'deepseek', 'mistral', 'openrouter',
    'siliconflow', 'aliyun', 'zhipu', 'tencent',
]

export const providerIcons: Record<AIProviderType, Component> = {
    openai: Atom,
    ollama: BrandOpenSource,
    anthropic: LetterA,
    google: BrandGoogle,
    azure: BrandWindows,
    lmstudio: DeviceDesktop,
    deepseek: LetterD,
    mistral: LetterM,
    siliconflow: Circles,
    tencent: LetterT,
    aliyun: Cloud,
    zhipu: LetterZ,
    openrouter: Route,
}

const PROVIDER_TAG_KEYS: Record<AIProviderType, string> = {
    openai: 'official',
    anthropic: 'official',
    google: 'official',
    deepseek: 'official',
    mistral: 'official',
    azure: 'enterprise',
    openrouter: 'router',
    siliconflow: 'domestic',
    aliyun: 'domestic',
    zhipu: 'domestic',
    tencent: 'domestic',
    ollama: 'ollama',
    lmstudio: 'lmstudio',
}

export const isLocalProvider = (type: AIProviderType) => LOCAL_PROVIDER_TYPES.includes(type)
// 这几家国内服务商的名字按界面语言显示（繁体用繁体、外语用英文名），其余直接用元数据里的名称
const LOCALIZED_PROVIDER_TYPES: AIProviderType[] = ['siliconflow', 'aliyun', 'zhipu', 'tencent']
export const getConfigTypeLabel = (type: AIProviderType) => (LOCALIZED_PROVIDER_TYPES.includes(type)
    ? String(i18n.global.t(`mobileModels.providerNames.${type}`))
    : getProviderMetadata(type).displayName)
const normalizeURL = (value?: string) => (value || '').trim().replace(/\/+$/, '')

/** 服务商目录：添加向导的卡片、列表里的服务类型名称和图标都从这里取 */
export function useAIProviderChoices() {
    const { t } = useI18n()

    const getProviderDescription = (type: AIProviderType) => t(`aiConfig.serviceDescriptions.${type}`)

    const officialProviderChoices = computed<ProviderChoice[]>(() => [...LOCAL_PROVIDER_TYPES, ...ONLINE_PROVIDER_ORDER].map(type => ({
        id: `official:${type}`,
        type,
        group: isLocalProvider(type) ? 'local' : 'online',
        label: getConfigTypeLabel(type),
        tag: t(`models.providerTag.${PROVIDER_TAG_KEYS[type]}`),
        description: getProviderDescription(type),
        icon: providerIcons[type],
        defaultName: getConfigTypeLabel(type),
        baseURL: getDefaultBaseURL(type),
    })))

    const onlinePresetChoices = computed<ProviderChoice[]>(() => [
        {
            id: 'preset:groq', type: 'openai', group: 'online', label: 'Groq', tag: t('models.providerTag.fast'),
            description: t('aiConfig.workspace.groqPresetDesc'), icon: LetterX,
            defaultName: 'Groq', baseURL: 'https://api.groq.com/openai/v1', custom: true,
            apiKeyUrl: 'https://console.groq.com/keys', docUrl: 'https://console.groq.com/docs/quickstart',
        },
        {
            id: 'preset:moonshot', type: 'openai', group: 'online', label: 'Moonshot AI', tag: t('models.providerTag.compatible'),
            description: t('aiConfig.workspace.moonshotPresetDesc'), icon: LetterM,
            defaultName: 'Moonshot AI', baseURL: 'https://api.moonshot.cn/v1', custom: true,
            apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys', docUrl: 'https://platform.moonshot.cn/docs/intro',
        },
        {
            id: 'preset:together', type: 'openai', group: 'online', label: 'Together AI', tag: t('models.providerTag.compatible'),
            description: t('aiConfig.workspace.togetherPresetDesc'), icon: Circles,
            defaultName: 'Together AI', baseURL: 'https://api.together.xyz/v1', custom: true,
            apiKeyUrl: 'https://api.together.ai/settings/api-keys', docUrl: 'https://docs.together.ai/docs/quickstart',
        },
        {
            id: 'preset:vllm', type: 'openai', group: 'local', label: 'vLLM', tag: t('models.providerTag.localOrRemote'),
            description: t('aiConfig.workspace.vllmPresetDesc'), icon: Server,
            defaultName: 'vLLM', baseURL: 'http://localhost:8000/v1', custom: true,
            docUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
        },
    ])

    const compatibilityProviderChoices = computed<ProviderChoice[]>(() => [
        {
            id: 'custom:openai', type: 'openai', group: 'custom', label: t('aiConfig.workspace.customOpenAI'),
            tag: t('models.providerTag.customOpenAI'), description: t('aiConfig.workspace.customOpenAIDesc'), icon: Api,
            defaultName: t('aiConfig.workspace.customOpenAI'), baseURL: '',
            placeholder: 'https://your-provider.example/v1', custom: true,
        },
        {
            id: 'custom:claude', type: 'anthropic', group: 'custom', label: t('aiConfig.workspace.customClaude'),
            tag: t('models.providerTag.customClaude'), description: t('aiConfig.workspace.customClaudeDesc'), icon: LetterA,
            defaultName: t('aiConfig.workspace.customClaude'), baseURL: '',
            placeholder: 'https://your-provider.example', custom: true,
        },
    ])

    const allProviderChoices = computed(() => [
        ...officialProviderChoices.value, ...onlinePresetChoices.value, ...compatibilityProviderChoices.value,
    ])

    const providerGroups = computed(() => (['online', 'local', 'custom'] as const).map(key => ({
        key,
        label: key === 'online' ? t('aiConfig.onlineServices') : key === 'local' ? t('aiConfig.localServices') : t('aiConfig.workspace.customServices'),
        providers: allProviderChoices.value.filter(choice => choice.group === key),
    })))

    const isCustomConfig = (config: AIConfig) => (
        config.type === 'openai' && normalizeURL(config.baseURL) !== normalizeURL(getDefaultBaseURL('openai'))
    ) || (
        config.type === 'anthropic' && Boolean(normalizeURL(config.baseURL))
    )

    const findPresetChoice = (config: AIConfig) => onlinePresetChoices.value.find(choice => (
        choice.type === config.type
        && Boolean(choice.baseURL)
        && normalizeURL(choice.baseURL) === normalizeURL(config.baseURL)
    ))

    /** 配置在列表筛选里归到哪一组：在线 / 本地 / 自定义 */
    const getConfigGroup = (config: AIConfig): ProviderGroupKey => {
        const preset = findPresetChoice(config)
        if (preset) return preset.group
        if (isLocalProvider(config.type)) return 'local'
        return isCustomConfig(config) ? 'custom' : 'online'
    }

    const getConfigDisplayLabel = (config: AIConfig) => findPresetChoice(config)?.label || (isCustomConfig(config)
        ? config.type === 'anthropic' ? t('aiConfig.workspace.claudeCompatible') : t('aiConfig.workspace.openAICompatible')
        : getConfigTypeLabel(config.type))

    const getConfigIcon = (config: AIConfig) => findPresetChoice(config)?.icon || (isCustomConfig(config) ? Api : providerIcons[config.type])

    const resolveProviderChoiceId = (config?: AIConfig) => {
        if (!config) return 'official:openai'
        const preset = findPresetChoice(config)
        if (preset) return preset.id
        if (isCustomConfig(config)) return config.type === 'anthropic' ? 'custom:claude' : 'custom:openai'
        return `official:${config.type}`
    }

    return {
        officialProviderChoices,
        onlinePresetChoices,
        compatibilityProviderChoices,
        allProviderChoices,
        providerGroups,
        getProviderDescription,
        getConfigGroup,
        getConfigDisplayLabel,
        getConfigIcon,
        resolveProviderChoiceId,
    }
}
