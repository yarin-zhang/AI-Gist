<template>
    <NModal :show="show" :mask-closable="false" :close-on-esc="false" display-directive="show">
        <section class="prompt-workspace-modal" role="dialog" aria-modal="true">
            <PromptWorkspace ref="workspaceRef" :prompt="prompt" :categories="categories" :mode="mode"
                :draft="draft" closable @close="$emit('request-close')"
                @request-mode="$emit('request-mode', $event)" @update:draft="$emit('update:draft', $event)"
                @updated="$emit('updated', $event)" @saved="$emit('saved', $event)"
                @toggle-favorite="$emit('toggle-favorite')" @delete="$emit('delete')"
                @create="$emit('create')" @cancel-edit="$emit('cancel-edit')"
                @open-quick-optimization-config="$emit('open-quick-optimization-config')" />
        </section>
    </NModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal } from 'naive-ui'
import type { Category, PromptWithRelations } from '@shared/types/database'
import PromptWorkspace, { type PromptWorkspaceMode } from './PromptWorkspace.vue'

defineProps<{
    show: boolean
    prompt: PromptWithRelations | null
    categories: Category[]
    mode: PromptWorkspaceMode
    draft: Record<string, any>
}>()

defineEmits<{
    'request-close': []
    'request-mode': [mode: PromptWorkspaceMode]
    'update:draft': [value: Record<string, any>]
    updated: [prompt?: PromptWithRelations]
    saved: [prompt?: PromptWithRelations]
    'toggle-favorite': []
    delete: []
    create: []
    'cancel-edit': []
    'open-quick-optimization-config': []
}>()

const workspaceRef = ref<InstanceType<typeof PromptWorkspace>>()

defineExpose({
    get hasUnsavedChanges() {
        return Boolean(workspaceRef.value?.hasUnsavedChanges)
    },
    discardChanges: () => workspaceRef.value?.discardChanges?.(),
    refreshQuickOptimizationConfigs: () => workspaceRef.value?.refreshQuickOptimizationConfigs?.(),
})
</script>

<style scoped>
.prompt-workspace-modal {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-modal);
    background: var(--surface-primary);
    box-shadow: var(--shadow-overlay);
}

@media (max-width: 760px) {
    .prompt-workspace-modal {
        width: 100vw;
        height: 100vh;
        border: 0;
        border-radius: 0;
    }
}
</style>
