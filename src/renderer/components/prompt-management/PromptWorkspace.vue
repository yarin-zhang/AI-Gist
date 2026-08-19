<template>
    <main class="prompt-workspace">
        <template v-if="prompt || mode === 'edit'">
            <header class="workspace-header">
                <div class="workspace-primary-row">
                    <div class="workspace-identity">
                        <div class="workspace-title-row">
                            <input v-if="editingTitle" ref="titleInputRef" v-model="titleDraft" type="text"
                                class="workspace-title-input" maxlength="200" :disabled="savingField === 'title'"
                                :placeholder="t('promptManagement.titlePlaceholder')"
                                :aria-label="t('promptManagement.title')"
                                @keydown.enter.prevent="commitTitle($event)"
                                @keydown.esc.prevent="cancelEditTitle($event)" @blur="commitTitle()" />
                            <NText v-else strong class="workspace-title"
                                :class="{ 'workspace-field-editable': canInlineEdit }"
                                :tabindex="canInlineEdit ? 0 : undefined" :role="canInlineEdit ? 'button' : undefined"
                                :title="canInlineEdit ? t('promptWorkspace.clickToEdit') : undefined"
                                @click="startEditTitle" @keydown.enter.prevent="startEditTitle"
                                @keydown.space.prevent="startEditTitle">
                                {{ prompt?.title || t('promptWorkspace.newPrompt') }}
                            </NText>
                            <span v-if="hasUnsavedChanges" class="unsaved-dot"
                                :title="t('promptWorkspace.unsavedChanges')" />
                        </div>
                        <textarea v-if="editingDescription" ref="descriptionInputRef" v-model="descriptionDraft"
                            class="workspace-description-input" rows="1" :disabled="savingField === 'description'"
                            :placeholder="t('promptManagement.descriptionPlaceholder')"
                            :aria-label="t('promptManagement.description')" @input="resizeDescriptionInput"
                            @keydown.enter.exact.prevent="commitDescription($event)"
                            @keydown.esc.prevent="cancelEditDescription($event)" @blur="commitDescription()" />
                        <NText v-else-if="prompt?.description" depth="3" class="workspace-description"
                            :class="{ 'workspace-field-editable': canInlineEdit }"
                            :tabindex="canInlineEdit ? 0 : undefined" :role="canInlineEdit ? 'button' : undefined"
                            :title="canInlineEdit ? t('promptWorkspace.clickToEdit') : undefined"
                            @click="startEditDescription" @keydown.enter.prevent="startEditDescription"
                            @keydown.space.prevent="startEditDescription">
                            {{ prompt.description }}
                        </NText>
                        <NText v-else-if="canInlineEdit" depth="3"
                            class="workspace-description workspace-description-placeholder workspace-field-editable"
                            tabindex="0" role="button" :title="t('promptWorkspace.clickToEdit')"
                            @click="startEditDescription" @keydown.enter.prevent="startEditDescription"
                            @keydown.space.prevent="startEditDescription">
                            {{ t('promptWorkspace.addDescription') }}
                        </NText>
                    </div>

                    <div class="workspace-controls">
                        <NTooltip v-if="prompt?.id">
                            <template #trigger>
                                <NButton circle quaternary size="small" :loading="summarizing"
                                    :disabled="!canSummarizeWithAI"
                                    :aria-label="t('promptWorkspace.aiSummarize')" @click="summarizeWithAI">
                                    <template #icon><NIcon size="16"><Stars /></NIcon></template>
                                </NButton>
                            </template>
                            {{ aiSummarizeTooltip }}
                        </NTooltip>
                        <NButton v-if="prompt?.id" circle quaternary size="small"
                            :type="prompt.isFavorite ? 'warning' : 'default'"
                            :aria-label="t('promptManagement.favorites')" @click="$emit('toggle-favorite')">
                            <template #icon>
                                <NIcon size="16" :color="prompt.isFavorite ? 'var(--accent-warning)' : undefined">
                                    <Star />
                                </NIcon>
                            </template>
                        </NButton>
                        <NTooltip v-if="prompt?.id">
                            <template #trigger>
                                <NButton circle quaternary size="small" type="error"
                                    :aria-label="t('common.delete')" @click="$emit('delete')">
                                    <template #icon><NIcon size="16"><Trash /></NIcon></template>
                                </NButton>
                            </template>
                            {{ t('common.delete') }}
                        </NTooltip>
                        <span v-if="closable" class="workspace-control-divider" />
                        <NButton v-if="closable" circle quaternary size="small"
                            :aria-label="t('common.close')" @click="$emit('close')">
                            <template #icon><NIcon size="16"><X /></NIcon></template>
                        </NButton>
                    </div>
                </div>

                <div class="workspace-mode-bar">
                    <div class="workspace-mode-tabs">
                        <button type="button" class="workspace-mode-tab" :class="{ active: mode === 'use' }"
                            :disabled="!prompt?.id" @click="$emit('request-mode', 'use')">
                            <NIcon size="16"><PlayerPlay /></NIcon>
                            <span>{{ t('promptWorkspace.use') }}</span>
                        </button>
                        <button type="button" class="workspace-mode-tab" :class="{ active: mode === 'edit' }"
                            @click="$emit('request-mode', 'edit')">
                            <NIcon size="16"><Edit /></NIcon>
                            <span>{{ t('promptManagement.edit') }}</span>
                        </button>
                    </div>
                    <div v-if="prompt" class="workspace-meta">
                        <span>{{ t('promptManagement.useCount', { count: prompt.useCount || 0 }) }}</span>
                        <span class="meta-divider" />
                        <span>{{ formatDate(prompt.updatedAt) }}</span>
                    </div>
                </div>
            </header>

            <div class="workspace-body">
                <PromptUseWorkspace v-if="mode === 'use' && prompt" :prompt="prompt" :draft="draft"
                    @update:draft="$emit('update:draft', $event)" @updated="$emit('updated', $event)" />
                <PromptEditModal v-show="mode === 'edit'" ref="editRef" :show="mode === 'edit'"
                    :prompt="prompt || undefined" :categories="categories" embedded
                    @update:show="handleEditVisibility" @saved="$emit('saved', $event)"
                    @open-quick-optimization-config="$emit('open-quick-optimization-config')" />
            </div>
        </template>

        <div v-else class="workspace-empty">
            <div class="empty-illustration"><NIcon size="34"><PromptIcon /></NIcon></div>
            <NText strong class="empty-title">{{ t('promptWorkspace.emptyTitle') }}</NText>
            <NText depth="3" class="empty-description">{{ t('promptWorkspace.emptyDescription') }}</NText>
            <NButton type="primary" @click="$emit('create')">
                <template #icon><NIcon><Plus /></NIcon></template>
                {{ t('promptManagement.createPrompt') }}
            </NButton>
        </div>
    </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NText, NTooltip, useMessage } from 'naive-ui'
import { Edit, FileText as PromptIcon, PlayerPlay, Plus, Star, Stars, Trash, X } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import { api } from '@/lib/api'
import { buildAISummaryPrompt, parseAISummaryResponse } from '@/lib/utils/ai-summary'
import PromptUseWorkspace from './PromptUseWorkspace.vue'
import PromptEditModal from './PromptEditModal.vue'

export type PromptWorkspaceMode = 'use' | 'edit'

const props = defineProps<{
    prompt: PromptWithRelations | null
    categories: Category[]
    mode: PromptWorkspaceMode
    draft: Record<string, any>
    closable?: boolean
}>()

const emit = defineEmits<{
    'request-mode': [mode: PromptWorkspaceMode]
    'update:draft': [value: Record<string, any>]
    updated: [prompt?: PromptWithRelations]
    saved: [prompt?: PromptWithRelations]
    'toggle-favorite': []
    delete: []
    create: []
    'cancel-edit': []
    'open-quick-optimization-config': []
    close: []
}>()

const { t } = useI18n()
const message = useMessage()
const editRef = ref<any>()

const hasUnsavedChanges = computed(() => Boolean(editRef.value?.hasUnsavedChanges))

// 标题 / 描述原地编辑：点击文本直接进入编辑态，失焦或回车保存，Esc 取消
//
// 进入编辑态时把目标 prompt id 与原始值捕获到独立的 ref 中，commitTitle/commitDescription
// 一律使用这个捕获值而不是实时读取 props.prompt，避免编辑期间 props.prompt 被父组件替换
// （例如跨窗口广播触发的 reconcileSelection 静默切换了选中项）时把文本误写到另一个 prompt 上。
// 一旦检测到 prompt 身份在编辑过程中发生变化，watch 会强制放弃当前编辑，不做任何保存。
const editingTitle = ref(false)
const editingDescription = ref(false)
const titleDraft = ref('')
const descriptionDraft = ref('')
const editingTitleTarget = ref<{ id: number; original: string } | null>(null)
const editingDescriptionTarget = ref<{ id: number; original: string } | null>(null)
const savingField = ref<'title' | 'description' | null>(null)
const titleInputRef = ref<HTMLInputElement>()
const descriptionInputRef = ref<HTMLTextAreaElement>()

const canInlineEdit = computed(() => Boolean(props.prompt?.id))

// AI 一键生成标题 / 描述：读取已保存的正文内容，调用已配置的首选 AI 模型
// 总结出简短的标题和描述并直接回填、保存。正文为空时按钮禁用，避免对空内容总结。
const summarizing = ref(false)
const hasSummarizableContent = computed(() => Boolean(props.prompt?.content?.trim()))
const canSummarizeWithAI = computed(() => hasSummarizableContent.value && !summarizing.value)
// 按钮 tooltip：三种状态各用独立文案，避免“生成中被禁用”这一状态误用“内容为空”
// 的提示文案（内容其实并不为空，只是正在生成中）
const aiSummarizeTooltip = computed(() => {
    if (summarizing.value) return t('promptWorkspace.aiSummarizing')
    if (!hasSummarizableContent.value) return t('promptWorkspace.aiSummarizeEmptyContent')
    return t('promptWorkspace.aiSummarize')
})

const toISOString = (value: any) => {
    const date = value ? new Date(value) : new Date()
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

const serializeAIConfig = (config: any) => ({
    ...config,
    models: Array.isArray(config.models) ? config.models.map(String) : [],
    createdAt: toISOString(config.createdAt),
    updatedAt: toISOString(config.updatedAt),
})

const summarizeWithAI = async () => {
    const target = props.prompt
    const content = (target?.content || '').trim()
    if (!target?.id || !content || summarizing.value) return

    // 生成结果即将覆盖标题/描述，先放弃正在进行中的手动编辑，避免草稿残留遮住新值
    if (editingTitle.value) cancelEditTitle()
    if (editingDescription.value) cancelEditDescription()

    summarizing.value = true
    try {
        const preferredConfig = await api.aiConfigs.getPreferred.query()
        if (!preferredConfig) {
            message.warning(t('promptManagement.noAIConfigAvailable'))
            return
        }

        const model = preferredConfig.defaultModel
            || preferredConfig.customModel
            || (Array.isArray(preferredConfig.models) ? preferredConfig.models[0] : '')
            || ''

        if (!model) {
            message.error(t('promptManagement.selectModel'))
            return
        }

        const request = {
            configId: String(preferredConfig.configId || ''),
            topic: content,
            customPrompt: buildAISummaryPrompt(content),
            model: String(model),
        }

        const result = await (window as any).electronAPI?.ai?.generatePrompt(request, serializeAIConfig(preferredConfig))
        const summary = parseAISummaryResponse(result?.generatedPrompt || '')

        const updated = await api.prompts.update.mutate({
            id: target.id,
            data: { title: summary.title, description: summary.description || undefined },
        })
        emit('updated', updated)
    } catch (error) {
        console.error(error)
        message.error(`${t('promptWorkspace.aiSummarizeFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
        summarizing.value = false
    }
}

const startEditTitle = () => {
    const id = props.prompt?.id
    if (!id || editingTitle.value) return
    const original = props.prompt?.title || ''
    editingTitleTarget.value = { id, original }
    titleDraft.value = original
    editingTitle.value = true
    nextTick(() => titleInputRef.value?.focus())
}

const cancelEditTitle = (event?: KeyboardEvent) => {
    if (event?.isComposing) return
    editingTitle.value = false
    editingTitleTarget.value = null
}

const commitTitle = async (event?: KeyboardEvent) => {
    if (event?.isComposing) return
    if (!editingTitle.value) return
    const next = titleDraft.value.trim()
    const target = editingTitleTarget.value
    editingTitle.value = false
    editingTitleTarget.value = null
    if (!target || !next || next === target.original) return
    savingField.value = 'title'
    try {
        const updated = await api.prompts.update.mutate({ id: target.id, data: { title: next } })
        emit('updated', updated)
    } catch (error) {
        console.error(error)
        message.error(t('promptManagement.updateFailed'))
    } finally {
        savingField.value = null
    }
}

const startEditDescription = () => {
    const id = props.prompt?.id
    if (!id || editingDescription.value) return
    const original = props.prompt?.description || ''
    editingDescriptionTarget.value = { id, original }
    descriptionDraft.value = original
    editingDescription.value = true
    nextTick(() => {
        resizeDescriptionInput()
        descriptionInputRef.value?.focus()
    })
}

const cancelEditDescription = (event?: KeyboardEvent) => {
    if (event?.isComposing) return
    editingDescription.value = false
    editingDescriptionTarget.value = null
}

const commitDescription = async (event?: KeyboardEvent) => {
    if (event?.isComposing) return
    if (!editingDescription.value) return
    const next = descriptionDraft.value.trim()
    const target = editingDescriptionTarget.value
    editingDescription.value = false
    editingDescriptionTarget.value = null
    if (!target) return
    if (next === target.original) return
    savingField.value = 'description'
    try {
        const updated = await api.prompts.update.mutate({ id: target.id, data: { description: next || undefined } })
        emit('updated', updated)
    } catch (error) {
        console.error(error)
        message.error(t('promptManagement.updateFailed'))
    } finally {
        savingField.value = null
    }
}

// prompt 身份在编辑过程中发生变化（例如跨窗口数据变更触发了选中项静默切换）时，
// 强制放弃当前编辑态，绝不把草稿保存到新的 prompt 上。
watch(() => props.prompt?.id, (newId) => {
    if (editingTitle.value && newId !== editingTitleTarget.value?.id) {
        editingTitle.value = false
        editingTitleTarget.value = null
    }
    if (editingDescription.value && newId !== editingDescriptionTarget.value?.id) {
        editingDescription.value = false
        editingDescriptionTarget.value = null
    }
})

const resizeDescriptionInput = () => {
    const el = descriptionInputRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

const handleEditVisibility = (show: boolean) => {
    if (!show && props.mode === 'edit') {
        if (props.prompt?.id) emit('request-mode', 'use')
        else emit('cancel-edit')
    }
}

const formatDate = (date: Date | string) => new Date(date).toLocaleDateString()

defineExpose({
    hasUnsavedChanges,
    refreshQuickOptimizationConfigs: () => editRef.value?.refreshQuickOptimizationConfigs?.(),
    discardChanges: () => editRef.value?.discardChanges?.(),
})
</script>

<style scoped>
.prompt-workspace { flex: 1; min-width: 0; min-height: 0; height: 100%; display: flex; flex-direction: column; background: var(--surface-body); }
.workspace-header { flex: 0 0 auto; border-bottom: 1px solid var(--border-default); background: var(--surface-primary); }
.workspace-primary-row { min-height: 60px; padding: 9px var(--page-padding); display: flex; align-items: center; justify-content: space-between; gap: var(--section-gap); }
.workspace-identity { flex: 1 1 auto; min-width: 0; }
.workspace-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.workspace-title { max-width: min(620px, 52vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; line-height: 1.3; letter-spacing: -.015em; }
.workspace-description { display: block; max-width: 660px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.workspace-field-editable { cursor: text; border-radius: var(--radius-control); padding: 1px 6px; margin: -1px -6px; }
.workspace-field-editable:hover { background: var(--interactive-hover); }
.workspace-field-editable:focus-visible { outline: 2px solid var(--interactive-focus); outline-offset: 1px; }
.workspace-title-input { max-width: min(620px, 52vw); width: 100%; font: inherit; font-weight: 600; font-size: 18px; line-height: 1.3; letter-spacing: -.015em; color: var(--content-primary); background: var(--surface-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); padding: 1px 6px; margin: -1px -6px; outline: none; }
.workspace-title-input:focus-visible { outline: 2px solid var(--interactive-focus); outline-offset: 1px; border-color: var(--border-strong); }
.workspace-title-input:disabled { opacity: .6; }
.workspace-description-input { display: block; width: 100%; max-width: 660px; margin-top: 2px; font: inherit; font-size: 13px; line-height: 1.5; color: var(--content-secondary); background: var(--surface-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); padding: 3px 6px; resize: none; outline: none; overflow-y: auto; }
.workspace-description-input:focus-visible { outline: 2px solid var(--interactive-focus); outline-offset: 1px; border-color: var(--border-strong); }
.workspace-description-input:disabled { opacity: .6; }
.workspace-controls { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.workspace-control-divider { width: 1px; height: 18px; margin: 0 5px; background: var(--border-default); }
.workspace-mode-bar { height: 38px; padding: 0 var(--page-padding); display: flex; align-items: flex-end; justify-content: space-between; border-top: 1px solid var(--border-subtle); background: var(--surface-secondary); }
.workspace-mode-tabs { height: 100%; display: flex; align-items: stretch; gap: var(--section-gap); }
.workspace-mode-tab { position: relative; min-width: 72px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 4px; border: 0; color: var(--content-secondary); background: transparent; cursor: pointer; font: inherit; font-size: 14px; }
.workspace-mode-tab::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: transparent; }
.workspace-mode-tab:hover:not(:disabled) { color: var(--content-primary); }
.workspace-mode-tab.active { color: var(--accent-primary); font-weight: 500; }
.workspace-mode-tab.active::after { background: var(--accent-primary); }
.workspace-mode-tab:disabled { cursor: not-allowed; opacity: .45; }
.workspace-meta { height: 100%; display: flex; align-items: center; gap: 8px; color: var(--content-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.meta-divider { width: 1px; height: 11px; background: var(--border-default); }
.workspace-body { flex: 1; min-height: 0; overflow: hidden; }
.unsaved-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-warning); }
.workspace-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px; text-align: center; }
.empty-illustration { display: grid; place-items: center; width: 64px; height: 64px; border: 1px solid var(--border-default); border-radius: var(--radius-modal); color: var(--accent-primary); background: var(--surface-secondary); }
.empty-title { font-size: 18px; }
.empty-description { max-width: 420px; margin-bottom: 8px; }
@media (max-width: 1080px) {
    .workspace-meta { display: none; }
    .workspace-title { max-width: 34vw; }
}
</style>
