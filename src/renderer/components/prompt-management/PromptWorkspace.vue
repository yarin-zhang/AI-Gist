<template>
    <main class="prompt-workspace">
        <template v-if="prompt || mode === 'edit'">
            <header class="workspace-header">
                <div class="workspace-primary-row">
                    <div class="workspace-identity">
                        <div class="workspace-title-row">
                            <NText strong class="workspace-title">
                                {{ prompt?.title || t('promptWorkspace.newPrompt') }}
                            </NText>
                            <span v-if="hasUnsavedChanges" class="unsaved-dot"
                                :title="t('promptWorkspace.unsavedChanges')" />
                        </div>
                        <NText v-if="prompt?.description" depth="3" class="workspace-description">
                            {{ prompt.description }}
                        </NText>
                    </div>

                    <div class="workspace-controls">
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NText, NTooltip } from 'naive-ui'
import { Edit, FileText as PromptIcon, PlayerPlay, Plus, Star, Trash, X } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
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
const editRef = ref<any>()

const hasUnsavedChanges = computed(() => Boolean(editRef.value?.hasUnsavedChanges))
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
.workspace-identity { min-width: 0; }
.workspace-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.workspace-title { max-width: min(620px, 52vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; line-height: 1.3; letter-spacing: -.015em; }
.workspace-description { display: block; max-width: 660px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
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
