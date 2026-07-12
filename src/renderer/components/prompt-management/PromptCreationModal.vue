<template>
    <NModal :show="show" :mask-closable="false" :close-on-esc="false" display-directive="show">
        <section class="prompt-creation-modal" role="dialog" aria-modal="true">
            <header class="creation-header">
                <div>
                    <NText strong class="creation-title">{{ t('promptManagement.createPrompt') }}</NText>
                    <NText depth="3" class="creation-subtitle">{{ t('promptManagement.contentAndVariables') }}</NText>
                </div>
                <NButton quaternary circle size="small" :aria-label="t('common.close')"
                    @click="$emit('request-close')">
                    <template #icon><NIcon size="17"><X /></NIcon></template>
                </NButton>
            </header>

            <div class="creation-body">
                <aside class="creation-methods">
                    <button type="button" class="creation-method" :class="{ active: activeMethod === 'editor' }"
                        @click="activeMethod = 'editor'">
                        <span class="creation-method-icon"><NIcon size="17"><FilePlus /></NIcon></span>
                        <span>
                            <strong>{{ t('promptWorkspace.blankPrompt') }}</strong>
                            <small>{{ t('promptManagement.edit') }}</small>
                        </span>
                    </button>
                    <button type="button" class="creation-method" :class="{ active: activeMethod === 'ai' }"
                        @click="activeMethod = 'ai'">
                        <span class="creation-method-icon"><NIcon size="17"><Stars /></NIcon></span>
                        <span>
                            <strong>{{ t('promptManagement.aiGenerate') }}</strong>
                            <small>{{ t('aiGenerator.generate') }}</small>
                        </span>
                    </button>
                </aside>

                <main class="creation-content">
                    <PromptEditModal v-show="activeMethod === 'editor'" :key="editorKey" ref="editorRef"
                        :show="activeMethod === 'editor'" :prompt="draftPrompt" :categories="categories" embedded
                        @update:show="handleEditorVisibility" @saved="handleSaved"
                        @open-quick-optimization-config="$emit('open-quick-optimization-config')" />

                    <NScrollbar v-if="activeMethod === 'ai'" class="ai-creation-pane">
                        <AIGeneratorComponent :default-auto-save="false" @prompt-generated="handleGeneratedPrompt"
                            @prompt-saved="handleAIPromptSaved"
                            @navigate-to-ai-config="$emit('navigate-to-ai-config')" />
                    </NScrollbar>
                </main>
            </div>
        </section>
    </NModal>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NModal, NScrollbar, NText } from 'naive-ui'
import { FilePlus, Stars, X } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import PromptEditModal from './PromptEditModal.vue'
import AIGeneratorComponent from '@/components/ai/AIGeneratorComponent.vue'

const props = defineProps<{
    show: boolean
    categories: Category[]
}>()

const emit = defineEmits<{
    'request-close': []
    saved: [prompt?: PromptWithRelations]
    'navigate-to-ai-config': []
    'open-quick-optimization-config': []
}>()

const { t } = useI18n()
const activeMethod = ref<'editor' | 'ai'>('editor')
const draftPrompt = ref<PromptWithRelations>()
const editorKey = ref(0)
const editorRef = ref<InstanceType<typeof PromptEditModal>>()

const resetCreation = () => {
    activeMethod.value = 'editor'
    draftPrompt.value = undefined
    editorKey.value += 1
}

const handleGeneratedPrompt = async (generatedPrompt: any) => {
    draftPrompt.value = {
        uuid: `generated-draft-${Date.now()}`,
        title: generatedPrompt.title || `${t('promptManagement.aiGenerate')}: ${generatedPrompt.topic || ''}`,
        content: generatedPrompt.content || generatedPrompt.generatedPrompt || '',
        description: generatedPrompt.description || '',
        tags: generatedPrompt.tags || [t('promptManagement.aiGenerate')],
        variables: [],
        isFavorite: false,
        useCount: 0,
        isActive: true,
        isJinjaTemplate: false,
        imageBlobs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    editorKey.value += 1
    await nextTick()
    activeMethod.value = 'editor'
}

const handleSaved = (prompt?: PromptWithRelations) => emit('saved', prompt)
const handleAIPromptSaved = () => emit('saved')
const handleEditorVisibility = (visible: boolean) => {
    if (!visible && activeMethod.value === 'editor') emit('request-close')
}

watch(() => props.show, show => {
    if (show) resetCreation()
})

defineExpose({
    get hasUnsavedChanges() {
        return Boolean(editorRef.value?.hasUnsavedChanges)
    },
    discardChanges: () => editorRef.value?.discardChanges?.(),
    refreshQuickOptimizationConfigs: () => editorRef.value?.refreshQuickOptimizationConfigs?.(),
})
</script>

<style scoped>
.prompt-creation-modal { width: calc(100vw - 24px); height: calc(100vh - 24px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--app-border-color); border-radius: 10px; background: var(--app-bg-color); box-shadow: 0 24px 72px rgba(15, 23, 42, .24); }
.creation-header { min-height: 62px; flex: 0 0 62px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px 0 20px; border-bottom: 1px solid var(--app-border-color); background: var(--app-surface-color); }
.creation-title { display: block; font-size: 17px; }
.creation-subtitle { display: block; margin-top: 1px; font-size: 12px; }
.creation-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 188px minmax(0, 1fr); }
.creation-methods { padding: 12px 9px; border-right: 1px solid var(--app-border-color); background: var(--app-surface-color); }
.creation-method { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 8px 9px; border: 1px solid transparent; border-radius: 7px; color: var(--app-text-color); background: transparent; cursor: pointer; text-align: left; font: inherit; }
.creation-method:hover { background: var(--app-hover-color); }
.creation-method.active { border-color: var(--app-border-color); background: var(--app-hover-color); }
.creation-method-icon { width: 30px; height: 30px; flex: 0 0 30px; display: grid; place-items: center; border: 1px solid var(--app-border-color); border-radius: 7px; color: var(--app-text-color-secondary); background: var(--app-bg-color); }
.creation-method strong, .creation-method small { display: block; }
.creation-method strong { font-size: 14px; font-weight: 500; }
.creation-method small { margin-top: 2px; color: var(--app-text-color-secondary); font-size: 12px; }
.creation-content { min-width: 0; min-height: 0; overflow: hidden; background: var(--app-bg-color); }
.ai-creation-pane { height: 100%; }
.ai-creation-pane :deep(.n-scrollbar-content) { padding: 16px; }
.ai-creation-pane :deep(.generator-card), .ai-creation-pane :deep(.history-card) { border-radius: 8px; box-shadow: none; }

@media (max-width: 760px) {
    .prompt-creation-modal { width: 100vw; height: 100vh; border: 0; border-radius: 0; }
    .creation-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .creation-methods { display: flex; gap: 6px; padding: 8px; border-right: 0; border-bottom: 1px solid var(--app-border-color); }
    .creation-method { min-height: 42px; }
    .creation-method small { display: none; }
}
</style>
