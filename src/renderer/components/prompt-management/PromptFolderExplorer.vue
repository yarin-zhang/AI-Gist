<template>
    <div class="folder-explorer ui-surface">
        <aside class="folder-sidebar ui-surface-muted" :aria-label="t('promptManagement.folderLocations')">
            <div class="folder-sidebar-heading">{{ t('promptManagement.folderLocations') }}</div>
            <button type="button" class="folder-nav-item" :class="{
                active: activeCategoryId === null,
                'drop-target': dropTargetKey === 'root',
            }" @click="navigateTo(null)" @dragover="handleDragOver($event, null)"
                @dragleave="handleDragLeave($event, 'root')" @drop="handleDrop($event, null)">
                <NIcon size="18"><Folders /></NIcon>
                <span class="folder-nav-name">{{ t('promptManagement.promptRoot') }}</span>
                <span class="folder-nav-count">{{ totalCount }}</span>
            </button>

            <div class="folder-sidebar-heading folder-category-heading">
                <span>{{ t('promptManagement.categories') }}</span>
                <NTooltip>
                    <template #trigger>
                        <NButton size="tiny" quaternary circle class="folder-category-settings"
                            :aria-label="t('promptManagement.categoryManageTitle')"
                            @click="emit('manage-categories')">
                            <template #icon><NIcon size="16"><Settings /></NIcon></template>
                        </NButton>
                    </template>
                    {{ t('promptManagement.categoryManageTitle') }}
                </NTooltip>
            </div>
            <div class="folder-nav-list">
                <button v-for="category in sortedCategories" :key="category.id" type="button"
                    class="folder-nav-item" :class="{
                        active: activeCategoryId === category.id,
                        'drop-target': dropTargetKey === `category-${category.id}`,
                    }" @click="navigateTo(category.id || null)" @dragover="handleDragOver($event, category.id || null)"
                    @dragleave="handleDragLeave($event, `category-${category.id}`)"
                    @drop="handleDrop($event, category.id || null)">
                    <span class="folder-nav-color" :style="{ background: category.color || 'var(--content-tertiary)' }" />
                    <span class="folder-nav-name">{{ category.name }}</span>
                    <span class="folder-nav-count">{{ categoryCounts[category.id || 0] || 0 }}</span>
                </button>
                <NText v-if="sortedCategories.length === 0" depth="3" class="folder-sidebar-empty">
                    {{ t('promptManagement.noCategories') }}
                </NText>
            </div>
        </aside>

        <section class="folder-content">
            <header class="folder-content-toolbar">
                <div class="folder-breadcrumb" :aria-label="t('promptManagement.folderBreadcrumb')">
                    <NButton text size="small" :type="activeCategoryId === null ? 'default' : 'primary'"
                        @click="navigateTo(null)" @dragover="handleDragOver($event, null)"
                        @dragleave="handleDragLeave($event, 'root')" @drop="handleDrop($event, null)">
                        {{ t('promptManagement.promptRoot') }}
                    </NButton>
                    <template v-if="activeCategory">
                        <NIcon size="14" class="folder-breadcrumb-separator"><ChevronRight /></NIcon>
                        <NText strong>{{ activeCategory.name }}</NText>
                    </template>
                    <template v-else-if="globalResults">
                        <NIcon size="14" class="folder-breadcrumb-separator"><ChevronRight /></NIcon>
                        <NText strong>{{ t('promptManagement.filteredResults') }}</NText>
                    </template>
                </div>
                <NText depth="3" class="folder-result-count">
                    {{ t('promptManagement.folderItemCount', { count: displayedItemCount }) }}
                </NText>
            </header>

            <div v-if="loading" class="folder-state"><NSpin size="large" /></div>
            <div v-else class="folder-scroll-region" @click.self="selectedKey = null">
                <div v-if="hasItems" class="folder-item-grid" role="grid"
                    :aria-label="t('promptManagement.folderContents')" @click.self="selectedKey = null">
                    <div v-for="category in visibleFolderCategories" :key="`folder-${category.id}`"
                        class="folder-item folder-item-category" :class="{
                            selected: selectedKey === `category-${category.id}`,
                            'drop-target': dropTargetKey === `category-${category.id}`,
                        }" role="gridcell" tabindex="0" @click="selectItem(`category-${category.id}`)"
                        @dblclick="navigateTo(category.id || null)"
                        @keydown.enter.prevent="navigateTo(category.id || null)"
                        @keydown.space.prevent="selectItem(`category-${category.id}`)"
                        @dragover="handleDragOver($event, category.id || null)"
                        @dragleave="handleDragLeave($event, `category-${category.id}`)"
                        @drop="handleDrop($event, category.id || null)">
                        <div class="folder-icon" :style="{ color: category.color || 'var(--content-secondary)' }">
                            <svg class="asset-glyph folder-glyph" viewBox="0 0 72 72" aria-hidden="true"
                                focusable="false">
                                <path d="M11 24v-1.5a6 6 0 0 1 6-6h11.7a6 6 0 0 1 4.35 1.87l4.7 4.95a4 4 0 0 0 2.9 1.25H55a6 6 0 0 1 6 6V52a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V24z"
                                    fill="currentColor" fill-opacity=".08" stroke="currentColor" />
                            </svg>
                        </div>
                        <NText strong class="folder-item-name">{{ category.name }}</NText>
                        <NText depth="3" class="folder-item-meta">
                            {{ t('promptManagement.categoryPromptCount', { count: categoryCounts[category.id || 0] || 0 }) }}
                        </NText>
                    </div>

                    <div v-for="prompt in prompts" :key="`prompt-${prompt.id}`" class="folder-item folder-item-prompt"
                        :class="{
                            selected: selectedKey === `prompt-${prompt.id}`,
                            dragging: draggingPromptId === prompt.id,
                            moving: movingPromptId === prompt.id,
                        }" role="gridcell" tabindex="0" :draggable="movingPromptId !== prompt.id"
                        @click="selectItem(`prompt-${prompt.id}`)" @dblclick="openPrompt(prompt)"
                        @keydown.enter.prevent="openPrompt(prompt)"
                        @keydown.space.prevent="selectItem(`prompt-${prompt.id}`)"
                        @dragstart="handleDragStart($event, prompt)" @dragend="handleDragEnd">
                        <div class="prompt-file-icon" aria-hidden="true">
                            <svg class="asset-glyph prompt-file-glyph" viewBox="0 0 72 72" focusable="false">
                                <path d="M21 9.5h20.5L54 22v34a6.5 6.5 0 0 1-6.5 6.5h-26A6.5 6.5 0 0 1 15 56V16a6.5 6.5 0 0 1 6-6.5z"
                                    fill="currentColor" fill-opacity=".055" stroke="currentColor" />
                                <path d="M41.5 9.5v8.7a4.3 4.3 0 0 0 4.3 4.3H54" fill="none"
                                    stroke="currentColor" />
                                <line v-for="line in getSkeletonLines(prompt.content)" :key="line.key" x1="24"
                                    :x2="24 + line.width * 0.27" :y1="line.y" :y2="line.y"
                                    stroke="currentColor" />
                            </svg>
                            <span v-if="getPromptImages(prompt).length" class="prompt-file-attachments">
                                <img v-for="(image, imageIndex) in getPromptImages(prompt).slice(0, 3)"
                                    :key="`${prompt.id}-attachment-${imageIndex}`" class="prompt-file-attachment"
                                    :src="resolveImageUrl(image)" alt="" draggable="false"
                                    :style="getAttachmentStyle(imageIndex, Math.min(getPromptImages(prompt).length, 3))"
                                    @error="handleAttachmentImageError" />
                                <span v-if="getPromptImages(prompt).length > 1" class="prompt-file-attachment-count">
                                    {{ getPromptImages(prompt).length }}
                                </span>
                            </span>
                        </div>
                        <NText strong class="folder-item-name prompt-file-name">{{ prompt.title }}</NText>

                        <NDropdown :options="getPromptOptions(prompt)" :icon-size="16"
                            @select="(key) => emit('prompt-action', key, prompt)">
                            <NButton class="folder-item-actions" size="small" quaternary circle
                                :aria-label="t('promptManagement.promptActions')" @click.stop @dblclick.stop>
                                <template #icon><NIcon size="16"><DotsVertical /></NIcon></template>
                            </NButton>
                        </NDropdown>
                        <NSpin v-if="movingPromptId === prompt.id" size="small" class="folder-item-moving" />
                    </div>
                </div>

                <NEmpty v-else class="folder-empty" :description="emptyDescription">
                    <template #icon><NIcon size="46"><FolderOff /></NIcon></template>
                </NEmpty>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { NButton, NDropdown, NEmpty, NIcon, NSpin, NText, NTooltip } from 'naive-ui'
import {
    ChevronRight,
    Copy,
    DotsVertical,
    Edit,
    Eye,
    FolderOff,
    Folders,
    Keyboard,
    Settings,
    Star,
    Trash,
} from '@vicons/tabler'
import { useI18n } from 'vue-i18n'
import type { CategoryWithRelations, PromptWithRelations } from '@shared/types/database'

interface Props {
    categories: CategoryWithRelations[]
    prompts: PromptWithRelations[]
    categoryCounts: Record<number, number>
    activeCategoryId: number | null
    totalCount: number
    loading?: boolean
    globalResults?: boolean
    movingPromptId?: number | null
    supportsGlobalShortcuts?: boolean
    resolveImageUrl: (blob: Blob) => string
}

const props = withDefaults(defineProps<Props>(), {
    loading: false,
    globalResults: false,
    movingPromptId: null,
    supportsGlobalShortcuts: false,
})

const emit = defineEmits<{
    navigate: [categoryId: number | null]
    open: [prompt: PromptWithRelations]
    'prompt-action': [action: string, prompt: PromptWithRelations]
    move: [prompt: PromptWithRelations, targetCategoryId: number | null]
    'manage-categories': []
}>()

const { t } = useI18n()
const selectedKey = ref<string | null>(null)
const draggingPromptId = ref<number | null>(null)
const dropTargetKey = ref<string | null>(null)

const sortedCategories = computed(() => [...props.categories].sort((left, right) => {
    const sortDifference = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    return sortDifference || left.name.localeCompare(right.name)
}))

const activeCategory = computed(() => props.activeCategoryId === null
    ? null
    : props.categories.find(category => category.id === props.activeCategoryId) || null)

const visibleFolderCategories = computed(() => props.activeCategoryId === null && !props.globalResults
    ? sortedCategories.value
    : [])

const displayedItemCount = computed(() => visibleFolderCategories.value.length + props.prompts.length)
const hasItems = computed(() => displayedItemCount.value > 0)
const emptyDescription = computed(() => props.globalResults
    ? t('promptManagement.noFilteredPrompts')
    : activeCategory.value
        ? t('promptManagement.emptyFolderHint')
        : t('promptManagement.emptyPromptRoot'))

watch(() => props.activeCategoryId, () => {
    selectedKey.value = null
    dropTargetKey.value = null
})

watch(() => props.prompts.map(prompt => prompt.id).join(','), () => {
    if (selectedKey.value?.startsWith('prompt-') && !props.prompts.some(prompt => `prompt-${prompt.id}` === selectedKey.value)) {
        selectedKey.value = null
    }
})

const selectItem = (key: string) => {
    selectedKey.value = key
}

const navigateTo = (categoryId: number | null) => {
    selectedKey.value = null
    emit('navigate', categoryId)
}

const openPrompt = (prompt: PromptWithRelations) => {
    selectedKey.value = `prompt-${prompt.id}`
    emit('open', prompt)
}

const getSkeletonLines = (content: string) => {
    const length = content?.trim().length || 0
    const count = length < 80 ? 2 : length < 240 ? 3 : length < 600 ? 4 : 5
    const widths = [28, 82, 68, 88, 58]
    return widths.slice(0, count).map((width, index) => ({
        key: `${index}-${length}`,
        width: index === count - 1 ? Math.max(38, Math.min(88, 38 + (length % 51))) : width,
        y: 31.5 + index * 8.4,
    }))
}

const getPromptImages = (prompt: PromptWithRelations) => Array.isArray(prompt.imageBlobs)
    ? prompt.imageBlobs.filter((image): image is Blob => image instanceof Blob && image.size > 0)
    : []

const getAttachmentStyle = (index: number, visibleCount: number) => ({
    left: `${index * 5}px`,
    bottom: `${index * 3}px`,
    zIndex: visibleCount - index,
})

const handleAttachmentImageError = (event: Event) => {
    const target = event.currentTarget
    if (target instanceof HTMLImageElement) target.style.display = 'none'
}

const getPromptOptions = (prompt: PromptWithRelations) => [
    {
        label: t('promptManagement.openPrompt'),
        key: 'view',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Eye) }),
    },
    {
        label: t('common.copy'),
        key: 'copy',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Copy) }),
    },
    {
        label: prompt.isFavorite ? t('promptManagement.cancelFavorite') : t('promptManagement.favorites'),
        key: 'favorite',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Star) }),
    },
    {
        label: t('promptManagement.edit'),
        key: 'edit',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Edit) }),
    },
    {
        label: t('promptManagement.copyOriginalContent'),
        key: 'copyOriginal',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Copy) }),
    },
    ...(props.supportsGlobalShortcuts ? [{
        label: t('promptManagement.shortcutTrigger'),
        key: 'shortcut',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Keyboard) }),
    }] : []),
    { type: 'divider', key: `divider-${prompt.id}` },
    {
        label: () => h(NText, { type: 'error' }, { default: () => t('promptManagement.delete') }),
        key: 'delete',
        icon: () => h(NIcon, { size: 16, color: 'var(--error-color)' }, { default: () => h(Trash) }),
    },
]

const targetKey = (categoryId: number | null) => categoryId === null ? 'root' : `category-${categoryId}`

const canMoveTo = (categoryId: number | null) => {
    const prompt = props.prompts.find(item => item.id === draggingPromptId.value)
    if (!prompt) return false
    return (prompt.categoryId ?? null) !== categoryId
}

const handleDragStart = (event: DragEvent, prompt: PromptWithRelations) => {
    if (!prompt.id || props.movingPromptId === prompt.id) {
        event.preventDefault()
        return
    }
    draggingPromptId.value = prompt.id
    selectedKey.value = `prompt-${prompt.id}`
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', String(prompt.id))
        const source = event.currentTarget
        if (source instanceof HTMLElement) {
            const preview = source.cloneNode(true) as HTMLElement
            preview.querySelector('.folder-item-actions')?.remove()
            preview.querySelector('.folder-item-moving')?.remove()
            preview.classList.remove('selected', 'dragging', 'moving')
            preview.style.cssText = [
                'position: fixed',
                'left: -1000px',
                'top: -1000px',
                `width: ${source.offsetWidth}px`,
                'background: var(--surface-primary)',
                'box-shadow: var(--shadow-popover)',
                'pointer-events: none',
                'opacity: .96',
            ].join(';')
            document.body.appendChild(preview)
            event.dataTransfer.setDragImage(preview, source.offsetWidth / 2, 42)
            requestAnimationFrame(() => preview.remove())
        }
    }
}

const handleDragOver = (event: DragEvent, categoryId: number | null) => {
    if (!canMoveTo(categoryId)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetKey.value = targetKey(categoryId)
}

const clearDropTarget = (key: string) => {
    if (dropTargetKey.value === key) dropTargetKey.value = null
}

const handleDragLeave = (event: DragEvent, key: string) => {
    const currentTarget = event.currentTarget
    const nextTarget = event.relatedTarget
    if (currentTarget instanceof HTMLElement && nextTarget instanceof Node && currentTarget.contains(nextTarget)) return
    clearDropTarget(key)
}

const handleDrop = (event: DragEvent, categoryId: number | null) => {
    event.preventDefault()
    const prompt = props.prompts.find(item => item.id === draggingPromptId.value)
    dropTargetKey.value = null
    if (!prompt || !canMoveTo(categoryId)) return
    emit('move', prompt, categoryId)
}

const handleDragEnd = () => {
    draggingPromptId.value = null
    dropTargetKey.value = null
}
</script>

<style scoped>
.folder-explorer {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(176px, 220px) minmax(0, 1fr);
    margin-top: 12px;
    overflow: hidden;
}

.folder-sidebar {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: var(--compact-padding) 8px;
    border-right: 1px solid var(--border-default);
    border-radius: 0;
}

.folder-sidebar-heading {
    padding: 2px 9px 7px;
    color: var(--content-tertiary);
    font-size: 12px;
    font-weight: var(--font-weight-medium);
}

.folder-category-heading { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding-right: 3px; }
.folder-category-settings { flex: 0 0 auto; color: var(--content-secondary); }
.folder-nav-list { min-height: 0; overflow-y: auto; }

.folder-nav-item {
    width: 100%;
    min-height: 36px;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 6px 9px;
    border: 0;
    border-radius: var(--radius-control);
    color: var(--content-secondary);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    text-align: left;
}

.folder-nav-item:hover, .folder-nav-item.drop-target { color: var(--content-primary); background: var(--interactive-hover); }
.folder-nav-item.active { color: var(--content-primary); background: var(--surface-tertiary); font-weight: var(--font-weight-medium); }
.folder-nav-item:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.folder-nav-color { width: 9px; height: 9px; justify-self: center; border-radius: 50%; }
.folder-nav-item > * { pointer-events: none; }
.folder-nav-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-nav-count, .folder-result-count { font-size: 12px; font-variant-numeric: tabular-nums; }
.folder-sidebar-empty { display: block; padding: 8px 9px; font-size: 12px; }

.folder-content { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--surface-primary); }
.folder-content-toolbar { min-height: 44px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 var(--content-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.folder-breadcrumb { min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.folder-breadcrumb-separator { flex: 0 0 auto; color: var(--content-tertiary); }
.folder-result-count { flex: 0 0 auto; }

.folder-scroll-region { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: var(--content-padding); }
.folder-item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 148px)); align-content: start; gap: 14px 10px; }

.folder-item {
    position: relative;
    min-width: 0;
    min-height: 142px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 10px 8px 9px;
    border-radius: var(--radius-panel);
    cursor: default;
    transition: background-color .14s ease, opacity .14s ease;
}

.folder-item:hover { background: var(--interactive-hover); }
.folder-item.selected { background: var(--surface-tertiary); }
.folder-item.drop-target { background: var(--interactive-hover); }
.folder-item:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.folder-item.dragging { opacity: .48; }
.folder-item.moving { opacity: .65; pointer-events: none; }
.folder-item.dragging .folder-item-actions { display: none; }

.folder-icon { width: 76px; height: 82px; display: grid; place-items: center; }
.asset-glyph { display: block; overflow: visible; stroke-width: 3.1; stroke-linecap: round; stroke-linejoin: round; shape-rendering: geometricPrecision; }
.folder-glyph { width: 68px; height: 68px; color: inherit; }
.folder-item-category > * { pointer-events: none; }
.folder-item-name { width: 100%; min-width: 0; display: -webkit-box; overflow: hidden; text-align: center; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; font-size: 14px; line-height: 1.3; word-break: break-word; }
.folder-item-meta { width: 100%; margin-top: 3px; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }

.prompt-file-icon {
    position: relative;
    width: 68px;
    height: 78px;
    flex: 0 0 78px;
    display: grid;
    place-items: center;
    margin: 1px 0 3px;
    color: var(--content-secondary);
}

.prompt-file-glyph { width: 66px; height: 72px; }
.prompt-file-glyph line { opacity: .68; }
.prompt-file-attachments { position: absolute; left: -4px; bottom: 2px; width: 42px; height: 34px; pointer-events: none; }
.prompt-file-attachment { position: absolute; width: 27px; height: 27px; box-sizing: border-box; border: 2px solid var(--surface-primary); border-radius: var(--radius-control); object-fit: cover; background: var(--surface-secondary); }
.prompt-file-attachment-count { position: absolute; right: 0; bottom: -2px; z-index: 5; min-width: 18px; height: 18px; display: grid; place-items: center; box-sizing: border-box; padding: 0 4px; border: 2px solid var(--surface-primary); border-radius: 999px; color: var(--content-primary); background: var(--surface-tertiary); font-size: 12px; font-weight: var(--font-weight-semibold); line-height: 1; font-variant-numeric: tabular-nums; }
.folder-item:hover .prompt-file-icon, .folder-item.selected .prompt-file-icon { color: var(--content-primary); }
.prompt-file-name { margin-top: 2px; }

.folder-item-actions { position: absolute; top: 5px; right: 5px; opacity: 0; pointer-events: none; background: var(--surface-primary); }
.folder-item:hover .folder-item-actions, .folder-item.selected .folder-item-actions, .folder-item-actions:focus-visible { opacity: 1; pointer-events: auto; }
.folder-item-moving { position: absolute; inset: 0; display: grid; place-items: center; }
.folder-state, .folder-empty { height: 100%; min-height: 240px; display: grid; place-items: center; }

@media (max-width: 1120px) {
    .folder-explorer { grid-template-columns: 176px minmax(0, 1fr); }
    .folder-item-grid { grid-template-columns: repeat(auto-fill, minmax(118px, 138px)); }
}
</style>
