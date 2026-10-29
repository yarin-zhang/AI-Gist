import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialog, useMessage } from 'naive-ui'
import type { AIConfig, AIConfigTestResult, AIProviderType } from '@shared/types/ai'
import { getDefaultBaseURL, getProviderMetadata } from '@shared/ai-provider-metadata'
import { databaseService } from '@/lib/db'
import { serializeAIConfig } from '@/lib/utils/ai-request'
import { mergeLegacyCustomModel, shouldPreferNewConfig } from '@/lib/utils/ai-config-models'
import {
    AI_MODEL_LIST_TIMEOUT_MS, AI_TEST_TIMEOUT_MS, describeAIError, isLocalAIConfig, withAIRequestTimeout,
} from '@/lib/utils/ai-error'
import { getConfigTypeLabel, isLocalProvider, useAIProviderChoices, type ProviderChoice } from './useAIProviderChoices'

export type EditorSection = 'provider' | 'connection' | 'models'
/** builtin：列表是内置常见模型（服务不提供列表，或用户选了「使用常见模型」），不是从服务拿到的 */
export type ModelFetchState = 'idle' | 'success' | 'builtin' | 'empty' | 'error'
export interface ModelTestRecord extends AIConfigTestResult {
    elapsed?: number
}

/** 带 http:// 或 https:// 且能解析出主机名的地址 */
export const isHttpURL = (value: string) => {
    if (!/^https?:\/\/[^\s/]/i.test(value)) return false
    try {
        return Boolean(new URL(value).host)
    } catch {
        return false
    }
}

const normalizeURL = (value?: string) => (value || '').trim().replace(/\/+$/, '')

/** 添加 / 编辑 AI 配置向导：选择服务商 → 连接验证 → 模型确认 */
export function useAIConfigEditor(onSaved: (config: AIConfig) => void | Promise<void>) {
    const { t } = useI18n()
    const message = useMessage()
    const dialog = useDialog()
    const { allProviderChoices, getProviderDescription, resolveProviderChoiceId } = useAIProviderChoices()

    const show = ref(false)
    const editingConfig = ref<AIConfig | null>(null)
    const activeSection = ref<EditorSection>('provider')
    const snapshot = ref('')
    const saving = ref(false)
    const testingConnection = ref(false)
    const connectionResult = ref<AIConfigTestResult | null>(null)
    const lastTestFingerprint = ref('')
    const fetchingModels = ref(false)
    const modelFetchAttempted = ref(false)
    const modelFetchState = ref<ModelFetchState>('idle')
    const modelFetchMessage = ref('')
    // 获取失败时的原始报错，界面按原因给出说明
    const modelFetchError = ref('')
    // 获取失败时可以让用户明确选择使用的内置常见模型
    const commonModels = ref<string[]>([])
    const selectedTestModel = ref('')
    const testingModel = ref(false)
    const modelTestResult = ref<ModelTestRecord | null>(null)
    const selectedProviderChoiceId = ref('official:openai')
    const lastAutoConfigName = ref('OpenAI')
    // 编辑时打开向导那一刻的连接信息：没改过就是一个本来能用的配置，进第 3 步不再提醒「尚未测试连接」
    const savedConnectionFingerprint = ref('')

    const formData = reactive({
        type: 'openai' as AIProviderType,
        name: '',
        baseURL: '',
        apiKey: '',
        models: [] as string[],
        defaultModel: '',
        systemPrompt: '',
    })
    // 每次测试一个编号：取消或超时后，迟到的结果按编号丢弃
    let connectionTestRun = 0
    let modelTestRun = 0

    const selectedProviderChoice = computed(() => allProviderChoices.value.find(choice => choice.id === selectedProviderChoiceId.value) || null)
    const isCustomProviderChoice = computed(() => Boolean(selectedProviderChoice.value?.custom))
    const supportsCustomEndpoint = computed(() => ['anthropic', 'google'].includes(formData.type))
    const needsBaseURL = computed(() => isCustomProviderChoice.value || !supportsCustomEndpoint.value)
    const needsApiKey = computed(() => !isLocalProvider(formData.type))
    const canTestConnection = computed(() => (!needsApiKey.value || Boolean(formData.apiKey.trim())) && (!needsBaseURL.value || Boolean(formData.baseURL.trim())))
    const connectionFingerprint = computed(() => JSON.stringify({ type: formData.type, baseURL: formData.baseURL.trim(), apiKey: formData.apiKey }))
    // 自定义的兼容服务不是 OpenAI 官方：Key 用通用的「API Key」；预设服务（Moonshot AI 等）用它自己的名字
    const apiKeyLabel = computed(() => selectedProviderChoice.value?.group === 'custom'
        ? t('aiConfig.workspace.apiKeyLabel')
        : t('aiConfig.workspace.providerApiKeyLabel', { provider: selectedProviderChoice.value?.label || getConfigTypeLabel(formData.type) }))
    const providerLinks = computed(() => selectedProviderChoice.value?.custom
        ? { apiKeyUrl: selectedProviderChoice.value.apiKeyUrl || '', docUrl: selectedProviderChoice.value.docUrl || '' }
        : getProviderMetadata(formData.type))
    // 留空时的提示和字段名用同一个叫法（兼容服务地址 / Base URL）
    const baseURLInfo = computed(() => ({
        label: isCustomProviderChoice.value ? t('aiConfig.workspace.customServiceEndpoint')
            : supportsCustomEndpoint.value ? t('aiConfig.customEndpoint') : t('aiConfig.baseURL'),
        placeholder: selectedProviderChoice.value?.placeholder || getDefaultBaseURL(formData.type) || t('aiConfig.useOfficialEndpoint'),
        requiredMessage: isCustomProviderChoice.value ? t('aiConfig.workspace.pleaseEnterServiceEndpoint') : t('aiConfig.pleaseEnterBaseURL'),
    }))
    /** 地址为空或格式正确返回空字符串，否则返回提示；没有 http(s):// 的地址请求时只会得到 Invalid URL */
    const baseURLProblem = () => {
        const url = formData.baseURL.trim()
        if (!url) return needsBaseURL.value ? baseURLInfo.value.requiredMessage : ''
        return isHttpURL(url) ? '' : t('aiConfig.workspace.endpointNeedsProtocol')
    }
    const providerSummary = computed(() => ({
        label: selectedProviderChoice.value?.label || getConfigTypeLabel(formData.type),
        description: selectedProviderChoice.value?.description || getProviderDescription(formData.type),
    }))
    const modelOptions = computed(() => formData.models.map(model => ({ label: model, value: model })))
    /** 本机服务连不上时提示「服务没有启动」，而不是「地址错误」 */
    const isLocalTarget = computed(() => isLocalAIConfig({ type: formData.type, baseURL: formData.baseURL }))

    const serializeForm = () => JSON.stringify({
        type: formData.type, name: formData.name, baseURL: formData.baseURL, apiKey: formData.apiKey,
        models: formData.models, defaultModel: formData.defaultModel, systemPrompt: formData.systemPrompt,
    })
    const dirty = computed(() => show.value && serializeForm() !== snapshot.value)

    const formRules = computed(() => ({
        name: [{ required: true, message: t('aiConfig.pleaseEnterConfigName'), trigger: 'blur' }],
        baseURL: [{
            required: needsBaseURL.value, trigger: 'blur',
            validator: () => { const problem = baseURLProblem(); return problem ? new Error(problem) : true },
        }],
        apiKey: [{ required: needsApiKey.value, message: t('aiConfig.pleaseEnterAPIKey'), trigger: 'blur' }],
    }))

    const resetModelState = () => {
        connectionTestRun++
        modelTestRun++
        testingConnection.value = false
        testingModel.value = false
        connectionResult.value = null
        lastTestFingerprint.value = ''
        fetchingModels.value = false
        modelFetchAttempted.value = false
        modelFetchState.value = 'idle'
        modelFetchMessage.value = ''
        modelFetchError.value = ''
        commonModels.value = []
        modelTestResult.value = null
    }

    const resetForm = (config?: AIConfig) => {
        formData.type = config?.type || 'openai'
        formData.name = config?.name || getConfigTypeLabel(formData.type)
        formData.baseURL = config?.baseURL ?? getDefaultBaseURL(formData.type)
        formData.apiKey = config?.apiKey || ''
        // 旧数据里的「自定义模型」并进可用模型列表；没有默认模型时它就是默认模型
        const { models, defaultModel } = mergeLegacyCustomModel(config)
        formData.models = models
        formData.defaultModel = defaultModel
        formData.systemPrompt = config?.systemPrompt || ''
        selectedProviderChoiceId.value = resolveProviderChoiceId(config)
        lastAutoConfigName.value = config ? '' : getConfigTypeLabel(formData.type)
        resetModelState()
        selectedTestModel.value = defaultModel
        snapshot.value = serializeForm()
        savedConnectionFingerprint.value = config ? connectionFingerprint.value : ''
    }

    const openCreate = () => {
        editingConfig.value = null
        activeSection.value = 'provider'
        resetForm()
        show.value = true
    }

    const openEdit = (config: AIConfig) => {
        editingConfig.value = config
        activeSection.value = 'connection'
        resetForm(config)
        show.value = true
    }

    // 没有报错原文时留空：AIErrorNotice 会直接说该检查什么，而不是显示「未知错误」
    const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ''))

    const ask = (options: { title: string; content: string; positiveText: string; negativeText: string }) => new Promise<boolean>(resolve => {
        let settled = false
        const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
        dialog.warning({
            ...options, maskClosable: false,
            onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
        })
    })

    const requestClose = async () => {
        if (dirty.value && !(await ask({
            title: t('aiConfig.workspace.unsavedChanges'), content: t('aiConfig.workspace.unsavedEditorMessage'),
            positiveText: t('aiConfig.workspace.discardChanges'), negativeText: t('aiConfig.workspace.continueEditing'),
        }))) return
        show.value = false
        editingConfig.value = null
    }

    /** 换服务商会清掉和原服务商绑定的 Key、地址和模型列表：已经填过的（包括编辑中的已保存配置）要先确认 */
    const providerSwitchLosesData = () => {
        const defaultURL = selectedProviderChoice.value?.baseURL ?? getDefaultBaseURL(formData.type)
        return Boolean(formData.apiKey.trim()) || formData.models.length > 0
            || (Boolean(formData.baseURL.trim()) && normalizeURL(formData.baseURL) !== normalizeURL(defaultURL))
    }

    /** 返回是否真的换成了这个服务商；用户取消确认时保持原样 */
    const selectProviderChoice = async (choice: ProviderChoice) => {
        // 点已经选中的卡片不做任何事，免得误点一下就清空了 Key
        if (choice.id === selectedProviderChoiceId.value) return true
        if (providerSwitchLosesData() && !(await ask({
            title: t('models.switchProviderTitle', { name: choice.label }), content: t('models.switchProviderMessage'),
            positiveText: t('models.switchProvider'), negativeText: t('common.cancel'),
        }))) return false
        const shouldReplaceName = !formData.name.trim() || formData.name === lastAutoConfigName.value
        selectedProviderChoiceId.value = choice.id
        formData.type = choice.type
        if (shouldReplaceName) formData.name = choice.defaultName
        lastAutoConfigName.value = choice.defaultName
        formData.baseURL = choice.baseURL ?? getDefaultBaseURL(choice.type)
        formData.apiKey = ''
        formData.models = []
        formData.defaultModel = ''
        resetModelState()
        selectedTestModel.value = ''
        return true
    }

    /** 第 2 步「服务类型」下拉：选项和第 1 步的卡片一样（含自定义服务），按 id 切换 */
    const changeProviderChoice = async (id: string) => {
        const choice = allProviderChoices.value.find(provider => provider.id === id)
        return choice ? selectProviderChoice(choice) : false
    }

    const isSectionComplete = (section: EditorSection) => {
        if (section === 'provider') return Boolean(selectedProviderChoiceId.value)
        if (section === 'connection') return Boolean(connectionResult.value?.success)
        return Boolean(formData.defaultModel)
    }

    const validateConnectionFields = () => {
        if (!formData.name.trim()) { message.warning(t('aiConfig.pleaseEnterConfigName')); return false }
        const urlProblem = baseURLProblem()
        if (urlProblem) { message.warning(urlProblem); return false }
        if (needsApiKey.value && !formData.apiKey.trim()) { message.warning(t('aiConfig.pleaseEnterAPIKey')); return false }
        return true
    }

    const confirmContinueAfterConnectionTest = async () => {
        if (connectionResult.value?.success) return true
        // 编辑已有配置且没动过地址和 Key：它本来就能用，不弹「尚未测试连接」吓人
        if (!connectionResult.value && !testingConnection.value && savedConnectionFingerprint.value
            && connectionFingerprint.value === savedConnectionFingerprint.value) return true
        // 测试还在进行：说清楚现在继续会取消这次测试，而不是说「尚未测试」
        if (testingConnection.value) {
            const proceed = await ask({
                title: t('models.testRunningTitle'), content: t('models.testRunningMessage'),
                positiveText: t('aiConfig.workspace.continueToModels'), negativeText: t('models.waitForTest'),
            })
            if (proceed) cancelConnectionTest()
            return proceed || Boolean(connectionResult.value?.success)
        }
        return ask({
            title: connectionResult.value ? t('aiConfig.workspace.continueAfterFailedTestTitle') : t('aiConfig.workspace.continueWithoutTestTitle'),
            content: connectionResult.value
                ? t('aiConfig.workspace.continueAfterFailedTestMessage', {
                    error: describeAIError(connectionResult.value.error, { local: isLocalTarget.value }, t).title,
                })
                : t('aiConfig.workspace.continueWithoutTestMessage'),
            positiveText: t('aiConfig.workspace.continueToModels'),
            negativeText: t('aiConfig.workspace.stayAndTest'),
        })
    }

    const buildTemporaryConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
        configId: editingConfig.value?.configId || 'temp_test',
        name: formData.name || 'Test', type: formData.type, baseURL: formData.baseURL,
        apiKey: formData.apiKey, models: [...formData.models], defaultModel: formData.defaultModel || undefined,
        enabled: true,
        createdAt: editingConfig.value?.createdAt || new Date(), updatedAt: new Date(),
        ...overrides,
    })

    const fetchModelList = async (manual = false) => {
        if (!validateConnectionFields()) return false
        if (manual && formData.models.length && !(await ask({
            title: t('aiConfig.workspace.replaceModelsTitle'), content: t('aiConfig.workspace.replaceModelsMessage'),
            positiveText: t('aiConfig.workspace.fetchAndReplace'), negativeText: t('common.cancel'),
        }))) return false
        fetchingModels.value = true
        modelFetchAttempted.value = true
        modelFetchState.value = 'idle'
        modelFetchMessage.value = ''
        modelFetchError.value = ''
        commonModels.value = []
        try {
            const result = await withAIRequestTimeout(
                window.electronAPI.ai.getModels(serializeAIConfig(buildTemporaryConfig())), AI_MODEL_LIST_TIMEOUT_MS,
            )
            const models = [...new Set(result.models || [])]
            commonModels.value = [...new Set(result.fallbackModels || [])]
            if (result.modelSource === 'unavailable' || !models.length) {
                // 没拿到真实列表：如实说明，不自动填入常见模型
                modelFetchState.value = result.error ? 'error' : 'empty'
                modelFetchError.value = result.error || ''
                modelFetchMessage.value = result.error ? '' : t('aiConfig.workspace.noModelsReturned')
                return false
            }
            applyModels(models)
            // 服务不提供列表接口时给的是内置常见模型，用警告色提醒先测试
            modelFetchState.value = result.modelSource === 'remote' ? 'success' : 'builtin'
            modelFetchMessage.value = result.modelSource === 'remote'
                ? t('models.modelsFetched', { count: models.length }, models.length)
                : t('aiConfig.workspace.modelsBuiltinList')
            return true
        } catch (error) {
            modelFetchState.value = 'error'
            modelFetchError.value = errorText(error)
            return false
        } finally {
            fetchingModels.value = false
        }
    }

    // 重新获取时保留已选的默认模型（服务没返回它也留在列表里）
    const applyModels = (models: string[]) => {
        formData.models = formData.defaultModel && !models.includes(formData.defaultModel) ? [formData.defaultModel, ...models] : models
        if (!formData.defaultModel) formData.defaultModel = models[0]
        if (!selectedTestModel.value) selectedTestModel.value = formData.defaultModel || models[0]
    }

    /** 默认模型下拉里直接输入的新名字，自动加进可用模型列表 */
    const setDefaultModel = (model: string | null) => {
        const name = (model || '').trim()
        if (name && !formData.models.includes(name)) formData.models = [...formData.models, name]
        formData.defaultModel = name
    }

    /** 获取失败后，用户明确选择使用内置常见模型；保留已经填好的模型名 */
    const fillCommonModels = () => {
        if (!commonModels.value.length) return
        const count = commonModels.value.length
        applyModels([...new Set([...formData.models, ...commonModels.value])])
        commonModels.value = []
        modelFetchState.value = 'builtin'
        modelFetchMessage.value = t('aiConfig.workspace.commonModelsFilled', { count }, count)
    }

    const enterModelsStep = async () => {
        if (!validateConnectionFields()) { activeSection.value = 'connection'; return }
        if (!(await confirmContinueAfterConnectionTest())) return
        activeSection.value = 'models'
        if (!modelFetchAttempted.value && (!editingConfig.value || formData.models.length === 0)) await fetchModelList(false)
    }

    const goToSection = async (section: EditorSection) => {
        if (section === activeSection.value) return
        if (section === 'models') { await enterModelsStep(); return }
        activeSection.value = section
    }

    const previousStep = () => { activeSection.value = activeSection.value === 'models' ? 'connection' : 'provider' }
    const nextStep = async () => {
        if (activeSection.value === 'provider') { activeSection.value = 'connection'; return }
        await enterModelsStep()
    }

    const testConnection = async () => {
        if (!validateConnectionFields()) return
        const run = ++connectionTestRun
        const fingerprint = connectionFingerprint.value
        testingConnection.value = true
        connectionResult.value = null
        try {
            const result = await withAIRequestTimeout(
                window.electronAPI.ai.testConfig(serializeAIConfig(buildTemporaryConfig())), AI_TEST_TIMEOUT_MS,
            )
            if (run !== connectionTestRun) return
            connectionResult.value = result.success
                ? { success: true }
                : { success: false, error: result.error || '' }
            lastTestFingerprint.value = fingerprint
        } catch (error) {
            if (run !== connectionTestRun) return
            connectionResult.value = { success: false, error: errorText(error) }
            lastTestFingerprint.value = fingerprint
        } finally {
            if (run === connectionTestRun) testingConnection.value = false
        }
    }

    /** 不再等这次连接测试；后台请求停不下来，它迟到的结果会被丢弃 */
    const cancelConnectionTest = () => {
        connectionTestRun++
        testingConnection.value = false
    }

    /** 第 2 步在输入框里按回车：还没测通就测试连接，测通之后再按一次进入下一步 */
    const submitConnectionStep = async () => {
        if (testingConnection.value) return
        if (connectionResult.value?.success) { await nextStep(); return }
        await testConnection()
    }

    const testSelectedModel = async () => {
        if (!selectedTestModel.value) return
        const run = ++modelTestRun
        testingModel.value = true
        modelTestResult.value = null
        const started = performance.now()
        try {
            const result = await withAIRequestTimeout(window.electronAPI.ai.testModel(
                serializeAIConfig(buildTemporaryConfig({ configId: 'temp_test', defaultModel: selectedTestModel.value })),
                selectedTestModel.value,
                // 测试提示词跟随界面语言，不用后端写死的中文
                t('models.requestTestDefaultPrompt'),
            ), AI_TEST_TIMEOUT_MS)
            if (run !== modelTestRun) return
            modelTestResult.value = { ...result, elapsed: Math.round(performance.now() - started) }
        } catch (error) {
            if (run !== modelTestRun) return
            modelTestResult.value = { success: false, error: errorText(error) }
        } finally {
            if (run === modelTestRun) testingModel.value = false
        }
    }

    const cancelModelTest = () => {
        modelTestRun++
        testingModel.value = false
    }

    const save = async () => {
        if (!editingConfig.value && activeSection.value !== 'models') return
        if (!validateConnectionFields()) return
        if (!formData.defaultModel) { message.warning(t('aiConfig.pleaseSelectDefaultModel')); return }
        saving.value = true
        try {
            const data = {
                type: formData.type, name: formData.name.trim(), baseURL: formData.baseURL.trim(),
                apiKey: formData.apiKey || undefined,
                models: [...new Set([...formData.models, formData.defaultModel])],
                // 「自定义模型」已经并进可用模型列表，这里清掉旧字段，免得删掉的模型还从它冒出来
                defaultModel: formData.defaultModel, customModel: '',
                systemPrompt: formData.systemPrompt || undefined,
            }
            let saved: AIConfig
            if (editingConfig.value?.id) {
                saved = await databaseService.aiConfig.updateAIConfig(editingConfig.value.id, { ...data, isPreferred: editingConfig.value.isPreferred })
                message.success(t('aiConfig.configUpdateSuccess'))
            } else {
                // 还没有别的启用配置时，新加的这个就是 AI 功能实际在用的，直接设为首选
                const preferNew = shouldPreferNewConfig(await databaseService.aiConfig.getAllAIConfigs())
                saved = await databaseService.aiConfig.createAIConfig({
                    ...data, configId: `config_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, enabled: true,
                })
                if (preferNew && saved.id) {
                    await databaseService.aiConfig.setPreferredAIConfig(saved.id)
                    saved = { ...saved, isPreferred: true }
                }
                message.success(t('aiConfig.configAddSuccess'))
            }
            show.value = false
            editingConfig.value = null
            await onSaved(saved)
        } catch (error) {
            console.error('保存模型配置失败:', error)
            message.error(t('aiConfig.saveFailed'))
        } finally {
            saving.value = false
        }
    }

    // 默认模型始终在可用模型里：删掉了它就改用列表第一个，列表从空变成有模型时自动选上
    watch(() => formData.models, models => {
        if (!formData.defaultModel || !models.includes(formData.defaultModel)) formData.defaultModel = models[0] || ''
        if (selectedTestModel.value && !models.includes(selectedTestModel.value)) selectedTestModel.value = ''
        if (!selectedTestModel.value) selectedTestModel.value = formData.defaultModel
    }, { deep: true })

    // 改了地址或密钥，之前的连接测试结果就不再作数
    watch(connectionFingerprint, fingerprint => {
        if (lastTestFingerprint.value && fingerprint !== lastTestFingerprint.value) {
            connectionResult.value = null
            lastTestFingerprint.value = ''
        }
    })

    return {
        show,
        editingConfig,
        activeSection,
        formData,
        formRules,
        dirty,
        saving,
        selectedProviderChoiceId,
        selectedProviderChoice,
        providerSummary,
        providerLinks,
        needsBaseURL,
        supportsCustomEndpoint,
        needsApiKey,
        canTestConnection,
        apiKeyLabel,
        baseURLInfo,
        modelOptions,
        testingConnection,
        connectionResult,
        fetchingModels,
        modelFetchState,
        modelFetchMessage,
        modelFetchError,
        isLocalTarget,
        commonModels,
        selectedTestModel,
        testingModel,
        modelTestResult,
        openCreate,
        openEdit,
        requestClose,
        selectProviderChoice,
        changeProviderChoice,
        isSectionComplete,
        goToSection,
        previousStep,
        nextStep,
        testConnection,
        cancelConnectionTest,
        submitConnectionStep,
        fetchModelList,
        fillCommonModels,
        setDefaultModel,
        testSelectedModel,
        cancelModelTest,
        save,
    }
}

export type AIConfigEditor = ReturnType<typeof useAIConfigEditor>
