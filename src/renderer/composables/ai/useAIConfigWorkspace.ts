import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialog, useMessage } from 'naive-ui'
import type { AIConfig, AIConfigTestResult } from '@shared/types/ai'
import { normalizeCustomSystemPrompt } from '@shared/ai-default-prompts'
import { databaseService } from '@/lib/db'
import { serializeAIConfig, stopGeneration, streamGeneration } from '@/lib/utils/ai-request'
import { AI_TEST_TIMEOUT_MS, withAIRequestTimeout } from '@/lib/utils/ai-error'
import { useAIProviderChoices, type ProviderGroupKey } from './useAIProviderChoices'

export type ConfigFilter = 'all' | ProviderGroupKey

export interface ConnectionTestRecord extends AIConfigTestResult {
    testedAt: Date
}

export interface RequestTestRecord {
    success: boolean
    /** 回复内容；中途停止或失败时是已经收到的部分 */
    response?: string
    error?: string
    /** 从发出请求到拿到完整回复（或停止、失败）的耗时 */
    elapsed?: number
    /** 用户中途停止，回复不完整 */
    stopped?: boolean
}

const LAST_CONFIG_KEY = 'ai_config_workspace_last_id'

/** 模型页的数据和操作：配置列表、筛选、启用 / 首选、连接测试、请求测试 */
export function useAIConfigWorkspace() {
    const { t } = useI18n()
    const message = useMessage()
    const dialog = useDialog()
    const { getConfigGroup, getConfigDisplayLabel } = useAIProviderChoices()

    const configs = ref<AIConfig[]>([])
    const loading = ref(true)
    /** 读取配置失败：页面给「重试」，数据库的原始报错只记在控制台 */
    const loadError = ref(false)
    const selectedConfigId = ref<number | null>(null)
    const searchText = ref('')
    const activeFilter = ref<ConfigFilter>('all')
    const togglingConfigId = ref<number | null>(null)
    const testingConfigs = ref(new Set<number>())
    const requestTestingConfigs = ref(new Set<number>())
    const connectionResults = reactive<Record<number, ConnectionTestRecord>>({})
    const requestResults = reactive<Record<number, RequestTestRecord>>({})
    const requestTestModels = reactive<Record<number, string>>({})
    const requestTestPrompts = reactive<Record<number, string>>({})
    // 每次测试一个编号：停止、取消或超时后，迟到的结果按编号丢弃
    let runSeq = 0
    const connectionRuns: Record<number, number> = {}
    const requestRuns: Record<number, { run: number; started: number }> = {}

    const selectedConfig = computed(() => configs.value.find(config => config.id === selectedConfigId.value) || null)
    const explicitPreferredConfig = computed(() => configs.value.find(config => config.isPreferred && config.enabled) || null)
    const fallbackConfig = computed(() => explicitPreferredConfig.value || configs.value.find(config => config.enabled) || null)

    const filteredConfigs = computed(() => {
        const query = searchText.value.trim().toLocaleLowerCase()
        return configs.value.filter(config => {
            if (activeFilter.value !== 'all' && getConfigGroup(config) !== activeFilter.value) return false
            if (!query) return true
            return `${config.name} ${getConfigDisplayLabel(config)} ${config.baseURL} ${(config.models || []).join(' ')}`
                .toLocaleLowerCase().includes(query)
        })
    })

    const getModelOptions = (config: AIConfig) => [...new Set([
        ...(config.models || []), config.defaultModel, config.customModel,
    ].filter(Boolean) as string[])].map(model => ({ label: model, value: model }))

    const ensureRequestDefaults = (config: AIConfig) => {
        if (!config.id) return
        if (!requestTestModels[config.id]) requestTestModels[config.id] = config.defaultModel || config.customModel || config.models?.[0] || ''
        if (requestTestPrompts[config.id] === undefined) requestTestPrompts[config.id] = t('models.requestTestDefaultPrompt')
    }

    const loadConfigs = async () => {
        loading.value = true
        loadError.value = false
        try {
            const result = await databaseService.aiConfig.getAllAIConfigs()
            configs.value = result
            const storedId = Number(localStorage.getItem(LAST_CONFIG_KEY))
            const selected = result.find(config => config.id === selectedConfigId.value)
                || result.find(config => config.id === storedId)
                || result.find(config => config.isPreferred && config.enabled)
                || result.find(config => config.enabled)
                || result[0]
            selectedConfigId.value = selected?.id || null
            result.forEach(ensureRequestDefaults)
        } catch (error) {
            console.error('读取模型配置失败:', error)
            loadError.value = true
        } finally {
            loading.value = false
        }
    }

    const selectConfig = (config: AIConfig) => {
        selectedConfigId.value = config.id || null
        if (config.id) localStorage.setItem(LAST_CONFIG_KEY, String(config.id))
    }

    const askConfirm = (options: { title: string; content: string; positiveText: string; type?: 'warning' | 'error' }) => new Promise<boolean>(resolve => {
        let settled = false
        const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
        dialog[options.type || 'warning']({
            title: options.title, content: options.content,
            positiveText: options.positiveText, negativeText: t('common.cancel'),
            onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
        })
    })

    const toggleConfig = async (config: AIConfig, enabled: boolean) => {
        if (!config.id) return
        if (!enabled && config.isPreferred && !(await askConfirm({
            title: t('aiConfig.workspace.disablePreferredTitle'),
            content: t('aiConfig.workspace.disablePreferredMessage'),
            positiveText: t('aiConfig.workspace.disableAnyway'),
        }))) return
        togglingConfigId.value = config.id
        try {
            await databaseService.aiConfig.updateAIConfig(config.id, { enabled, ...(enabled ? {} : { isPreferred: false }) })
            await loadConfigs()
        } catch (error) {
            console.error('切换模型配置启用状态失败:', error)
            message.error(t('aiConfig.updateFailed'))
        } finally {
            togglingConfigId.value = null
        }
    }

    const setPreferred = async (config: AIConfig) => {
        if (!config.id || !config.enabled) return
        try {
            if (config.isPreferred) await databaseService.aiConfig.clearPreferredAIConfig()
            else await databaseService.aiConfig.setPreferredAIConfig(config.id)
            await loadConfigs()
        } catch (error) {
            console.error('设置首选模型配置失败:', error)
            message.error(t('aiConfig.setFailed'))
        }
    }

    /** 详情页里直接切换默认模型，立即保存 */
    const updateDefaultModel = async (config: AIConfig, model: string) => {
        if (!config.id || !model || model === config.defaultModel) return
        try {
            const models = [...new Set([...(config.models || []), model])]
            await databaseService.aiConfig.updateAIConfig(config.id, { defaultModel: model, models })
            requestTestModels[config.id] = model
            await loadConfigs()
        } catch (error) {
            console.error('更新默认模型失败:', error)
            message.error(t('aiConfig.updateFailed'))
        }
    }

    /** 删除确认要说清后果：删的是 AI 功能正在用的配置时，告诉用户之后改用哪个 */
    const getDeleteMessage = (config: AIConfig) => {
        if (fallbackConfig.value?.id !== config.id) return t('models.deleteMessage', { name: config.name })
        const next = configs.value.find(item => item.enabled && item.id !== config.id)
        return next
            ? t('models.deleteInUseMessage', { name: config.name, next: next.name })
            : t('models.deleteLastMessage', { name: config.name })
    }

    const deleteConfig = async (config: AIConfig) => {
        if (!config.id) return
        const confirmed = await askConfirm({
            type: 'error',
            title: t('models.deleteTitle'),
            content: getDeleteMessage(config),
            positiveText: t('common.delete'),
        })
        if (!confirmed) return
        try {
            await databaseService.aiConfig.deleteAIConfig(config.id)
            delete connectionResults[config.id]
            delete requestResults[config.id]
            delete connectionRuns[config.id]
            delete requestRuns[config.id]
            selectedConfigId.value = null
            await loadConfigs()
            message.success(t('aiConfig.configDeleteSuccess'))
        } catch (error) {
            console.error('删除模型配置失败:', error)
            message.error(t('aiConfig.deleteFailed'))
        }
    }

    // 没有报错原文时留空：AIErrorNotice 会直接说该检查什么，而不是显示「未知错误」
    const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ''))
    const withoutId = (set: Set<number>, id: number) => new Set([...set].filter(item => item !== id))

    const testConnection = async (config: AIConfig) => {
        if (!config.id) return
        const id = config.id
        const run = ++runSeq
        connectionRuns[id] = run
        testingConfigs.value = new Set([...testingConfigs.value, id])
        try {
            const result = await withAIRequestTimeout(window.electronAPI.ai.testConfig(serializeAIConfig(config)), AI_TEST_TIMEOUT_MS)
            if (connectionRuns[id] !== run) return
            connectionResults[id] = result.success
                ? { success: true, testedAt: new Date() }
                : { success: false, error: result.error || '', testedAt: new Date() }
        } catch (error) {
            if (connectionRuns[id] !== run) return
            connectionResults[id] = { success: false, error: errorText(error), testedAt: new Date() }
        } finally {
            if (connectionRuns[id] === run) testingConfigs.value = withoutId(testingConfigs.value, id)
        }
    }

    /** 不再等这次连接测试；后台请求停不下来，它迟到的结果会被丢弃 */
    const cancelConnectionTest = (config: AIConfig) => {
        if (!config.id) return
        delete connectionRuns[config.id]
        testingConfigs.value = withoutId(testingConfigs.value, config.id)
    }

    /** 用自己填的提示词发一条真实请求，记下回复和耗时；中途停止或失败时保留已经收到的部分 */
    const runRequestTest = async (config: AIConfig) => {
        if (!config.id) return
        const id = config.id
        const model = requestTestModels[id] || config.defaultModel || config.customModel || ''
        const prompt = (requestTestPrompts[id] || '').trim() || t('models.requestTestDefaultPrompt')
        if (!model) return
        const run = ++runSeq
        const started = performance.now()
        const isCurrent = () => requestRuns[id]?.run === run
        requestRuns[id] = { run, started }
        requestTestingConfigs.value = new Set([...requestTestingConfigs.value, id])
        requestResults[id] = { success: true, response: '' }
        let partial = ''
        try {
            const result = await streamGeneration({
                config: { ...config, defaultModel: model },
                model,
                mode: 'raw',
                prompt,
                onPartial: content => {
                    partial = content
                    if (isCurrent()) requestResults[id] = { success: true, response: content }
                },
                shouldStop: () => !isCurrent(),
            })
            if (!isCurrent()) return
            requestResults[id] = result.generatedPrompt
                ? { success: true, response: result.generatedPrompt, elapsed: Math.round(performance.now() - started) }
                : { success: false, error: t('promptGenerate.emptyResult') }
        } catch (error) {
            // 停止时 stopRequestTest 已经写好了结果
            if (!isCurrent()) return
            requestResults[id] = {
                success: false, response: partial || undefined, error: errorText(error),
                elapsed: Math.round(performance.now() - started),
            }
        } finally {
            if (isCurrent()) {
                delete requestRuns[id]
                requestTestingConfigs.value = withoutId(requestTestingConfigs.value, id)
            }
        }
    }

    /** 停止请求测试：立即结束界面上的等待，保留已收到的内容并标为未完成 */
    const stopRequestTest = (config: AIConfig) => {
        if (!config.id || !requestRuns[config.id]) return
        const id = config.id
        const { started } = requestRuns[id]
        delete requestRuns[id]
        requestResults[id] = {
            success: true, response: requestResults[id]?.response || '', stopped: true,
            elapsed: Math.round(performance.now() - started),
        }
        requestTestingConfigs.value = withoutId(requestTestingConfigs.value, id)
        // 停止接口会中断当前所有生成：只在没有别的请求测试时调用，其余的靠 shouldStop 在下一段内容到达时停下
        if (!requestTestingConfigs.value.size) void stopGeneration()
    }

    const saveSystemPrompt = async (config: AIConfig, systemPrompt: string) => {
        if (!config.id) return false
        try {
            // 和内置默认一样就存成空：继续跟随内置默认，生成时用的模板也不变（不会切到「自定义」那一套）
            await databaseService.aiConfig.updateAIConfig(config.id, { systemPrompt: normalizeCustomSystemPrompt(systemPrompt) || undefined })
            await loadConfigs()
            message.success(t('aiConfig.systemPromptUpdateSuccess'))
            return true
        } catch (error) {
            console.error('保存系统提示词失败:', error)
            message.error(t('aiConfig.saveFailed'))
            return false
        }
    }

    watch(selectedConfig, config => { if (config) ensureRequestDefaults(config) })

    // 筛选或搜索后选中的配置不在结果里：改选结果里的第一条（不记成用户上次的选择）；
    // 没有结果时右侧显示空状态（见 ModelsPage），不再停留在已经被筛掉的配置详情上
    watch(filteredConfigs, list => {
        if (!list.length || list.some(config => config.id === selectedConfigId.value)) return
        selectedConfigId.value = list[0].id || null
    })

    return {
        configs,
        loading,
        loadError,
        selectedConfigId,
        selectedConfig,
        searchText,
        activeFilter,
        filteredConfigs,
        explicitPreferredConfig,
        fallbackConfig,
        togglingConfigId,
        testingConfigs,
        requestTestingConfigs,
        connectionResults,
        requestResults,
        requestTestModels,
        requestTestPrompts,
        getModelOptions,
        loadConfigs,
        selectConfig,
        toggleConfig,
        setPreferred,
        updateDefaultModel,
        deleteConfig,
        testConnection,
        cancelConnectionTest,
        runRequestTest,
        stopRequestTest,
        saveSystemPrompt,
    }
}

export type AIConfigWorkspace = ReturnType<typeof useAIConfigWorkspace>
