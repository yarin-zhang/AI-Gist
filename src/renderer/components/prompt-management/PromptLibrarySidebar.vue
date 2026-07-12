<template>
    <aside class="prompt-library">
        <div class="library-header">
            <div class="library-title-row">
                <div class="library-title-copy">
                    <NText strong class="library-title">{{ t('promptWorkspace.library') }}</NText>
                    <span class="library-count">{{ prompts.length }}</span>
                </div>
            </div>

            <NInput v-model:value="searchText" clearable size="small"
                :placeholder="t('promptManagement.searchPrompt')">
                <template #prefix><NIcon size="16"><Search /></NIcon></template>
            </NInput>
        </div>

        <div class="library-navigation">
                <button v-for="item in navigationItems" :key="item.key" type="button"
                    class="library-nav-item" :class="{ active: activeFilter === item.key }"
                    @click="selectNavigation(item.key)">
                    <NIcon size="16"><component :is="item.icon" /></NIcon>
                    <span>{{ item.label }}</span>
                    <span class="nav-count">{{ item.count }}</span>
                </button>
        </div>

        <NSplit v-model:size="librarySplitSize" direction="vertical" :min="0.45" :max="0.82"
            :resize-trigger-size="9" class="library-split">
                <template #1>
                    <section class="prompt-section">
                        <div class="result-heading">
                            <NText depth="3">{{ resultHeading }}</NText>
                            <NFlex size="small" align="center">
                                <NButton v-if="activeFilter !== 'all' || searchText" text size="tiny" @click="clearFilters">
                                    {{ t('common.clear') }}
                                </NButton>
                                <NDropdown :options="sortOptions" :icon-size="16" @select="handleSortAction">
                                    <NButton quaternary circle size="tiny" :aria-label="t('promptWorkspace.sortBy')">
                                        <template #icon><NIcon size="16"><ArrowsSort /></NIcon></template>
                                    </NButton>
                                </NDropdown>
                                <NTooltip>
                                    <template #trigger>
                                        <NButton quaternary circle size="tiny" :type="selectionMode ? 'primary' : 'default'"
                                            :aria-label="t('promptWorkspace.selectMultiple')"
                                            @click="selectionMode ? exitSelectionMode() : selectionMode = true">
                                            <template #icon><NIcon size="16"><Check /></NIcon></template>
                                        </NButton>
                                    </template>
                                    {{ t('promptWorkspace.selectMultiple') }}
                                </NTooltip>
                            </NFlex>
                        </div>

                        <NScrollbar class="prompt-results">
                            <div v-if="loading" class="library-state"><NSpin size="small" /></div>
                            <NEmpty v-else-if="filteredPrompts.length === 0" size="small"
                                :description="t('promptManagement.noPrompts')" class="library-state" />
                            <button v-for="prompt in filteredPrompts" v-else :key="prompt.id" type="button"
                                class="prompt-list-item" :class="{ active: selectedId === prompt.id }"
                                @click="handlePromptClick(prompt)">
                                <span v-if="selectionMode" class="selection-check"
                                    :class="{ checked: prompt.id && selectedIds.includes(prompt.id) }">
                                    <NIcon v-if="prompt.id && selectedIds.includes(prompt.id)" size="12"><Check /></NIcon>
                                </span>
                                <div class="prompt-list-main">
                                    <div class="prompt-list-title-row">
                                        <span class="prompt-list-title">{{ prompt.title || t('promptManagement.untitledPrompt') }}</span>
                                        <NIcon v-if="prompt.isFavorite" size="16" color="var(--accent-warning)"><Star /></NIcon>
                                    </div>
                                    <div v-if="prompt.category" class="prompt-list-meta">
                                        <span>{{ prompt.category.name }}</span>
                                    </div>
                                </div>
                                <img v-if="getPromptThumbnail(prompt)" :src="getPromptThumbnail(prompt)"
                                    class="prompt-thumbnail" alt="" @error="handleThumbnailError" />
                            </button>
                        </NScrollbar>

                        <div v-if="selectionMode" class="selection-toolbar">
                            <NText depth="3">{{ t('promptWorkspace.selectedCount', { count: selectedIds.length }) }}</NText>
                            <NFlex size="small">
                                <NButton size="small" @click="exitSelectionMode">{{ t('common.cancel') }}</NButton>
                                <NButton size="small" type="error" :disabled="selectedIds.length === 0"
                                    @click="confirmBatchDelete">
                                    {{ t('common.delete') }}
                                </NButton>
                            </NFlex>
                        </div>
                    </section>
                </template>

                <template #resize-trigger>
                    <div class="library-resize-line" />
                </template>

                <template #2>
                    <section class="category-section">
                        <div class="category-heading">
                            <NText depth="3">{{ t('promptWorkspace.categories') }}</NText>
                            <NButton quaternary circle size="tiny" :aria-label="t('promptManagement.categories')"
                                @click="$emit('manage-categories')">
                                <template #icon><NIcon size="16"><Settings /></NIcon></template>
                            </NButton>
                        </div>
                        <NScrollbar class="category-list">
                            <button v-for="category in categories" :key="category.id" type="button"
                                class="category-item" :class="{ active: activeFilter === `category:${category.id}` }"
                                @click="selectNavigation(`category:${category.id}`)">
                                <span class="category-dot" :style="{ backgroundColor: category.color || 'var(--content-tertiary)' }" />
                                <span class="category-name">{{ category.name }}</span>
                                <span class="nav-count">{{ categoryCounts.get(category.id) || 0 }}</span>
                            </button>
                        </NScrollbar>
                    </section>
                </template>
        </NSplit>
    </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NEmpty, NFlex, NIcon, NInput, NScrollbar, NSplit, NSpin, NText, NTooltip } from 'naive-ui'
import {
    ArrowsSort, Check, Clock, Heart, ListDetails, Search, Settings, Star
} from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'

interface Props {
    prompts: PromptWithRelations[]
    categories: Category[]
    selectedId?: number | null
    loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    selectedId: null,
    loading: false,
})

const emit = defineEmits<{
    select: [prompt: PromptWithRelations]
    'manage-categories': []
    'batch-delete': [ids: number[]]
}>()

const { t } = useI18n()
const searchText = ref('')
const activeFilter = ref('all')
const sortBy = ref<'updated' | 'usage' | 'title'>('updated')
const selectionMode = ref(false)
const selectedIds = ref<number[]>([])
const thumbnailUrlCache = new Map<Blob, string>()
const storedSplitSize = Number(localStorage.getItem('prompt_library_split_size'))
const librarySplitSize = ref(Number.isFinite(storedSplitSize) && storedSplitSize > 0 ? storedSplitSize : 0.7)

const categoryCounts = computed(() => {
    const counts = new Map<number | undefined, number>()
    props.prompts.forEach(prompt => counts.set(prompt.categoryId, (counts.get(prompt.categoryId) || 0) + 1))
    return counts
})

const navigationItems = computed(() => [
    { key: 'all', label: t('promptWorkspace.allPrompts'), icon: ListDetails, count: props.prompts.length },
    { key: 'recent', label: t('promptWorkspace.recent'), icon: Clock, count: Math.min(props.prompts.length, 12) },
    { key: 'favorites', label: t('promptManagement.favorites'), icon: Heart, count: props.prompts.filter(p => p.isFavorite).length },
])

const filteredPrompts = computed(() => {
    let result = [...props.prompts]
    if (activeFilter.value === 'recent') {
        result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        result = result.slice(0, 12)
    } else if (activeFilter.value === 'favorites') {
        result = result.filter(prompt => prompt.isFavorite)
    } else if (activeFilter.value.startsWith('category:')) {
        const categoryId = Number(activeFilter.value.split(':')[1])
        result = result.filter(prompt => prompt.categoryId === categoryId)
    }

    if (activeFilter.value !== 'recent') {
        if (sortBy.value === 'usage') result.sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
        else if (sortBy.value === 'title') result.sort((a, b) => a.title.localeCompare(b.title))
        else result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }

    const query = searchText.value.trim().toLocaleLowerCase()
    if (query) {
        result = result.filter(prompt => {
            const tags = Array.isArray(prompt.tags) ? prompt.tags.join(' ') : prompt.tags || ''
            return `${prompt.title} ${prompt.description || ''} ${prompt.content} ${tags}`
                .toLocaleLowerCase().includes(query)
        })
    }
    return result
})

const resultHeading = computed(() => {
    if (searchText.value.trim()) return t('promptWorkspace.searchResults', { count: filteredPrompts.value.length })
    const item = navigationItems.value.find(entry => entry.key === activeFilter.value)
    if (item) return item.label
    const categoryId = Number(activeFilter.value.split(':')[1])
    return props.categories.find(category => category.id === categoryId)?.name || t('promptWorkspace.allPrompts')
})

const sortOptions = computed(() => [
    { label: t('promptWorkspace.sortUpdated'), key: 'updated' },
    { label: t('promptWorkspace.sortUsage'), key: 'usage' },
    { label: t('promptWorkspace.sortTitle'), key: 'title' },
])

const handleSortAction = (key: string) => {
    sortBy.value = key as typeof sortBy.value
}

const handlePromptClick = (prompt: PromptWithRelations) => {
    if (!selectionMode.value) {
        emit('select', prompt)
        return
    }
    if (!prompt.id) return
    selectedIds.value = selectedIds.value.includes(prompt.id)
        ? selectedIds.value.filter(id => id !== prompt.id)
        : [...selectedIds.value, prompt.id]
}

const getPromptThumbnail = (prompt: PromptWithRelations) => {
    const blob = prompt.imageBlobs?.[0]
    if (!(blob instanceof Blob) || blob.size === 0) return ''
    const cached = thumbnailUrlCache.get(blob)
    if (cached) return cached
    const url = URL.createObjectURL(blob)
    thumbnailUrlCache.set(blob, url)
    return url
}

const handleThumbnailError = (event: Event) => {
    const image = event.currentTarget as HTMLImageElement | null
    if (image) image.style.display = 'none'
}

const exitSelectionMode = () => {
    selectionMode.value = false
    selectedIds.value = []
}

const confirmBatchDelete = () => {
    if (!selectedIds.value.length) return
    emit('batch-delete', [...selectedIds.value])
    exitSelectionMode()
}

const selectNavigation = (key: string) => {
    activeFilter.value = key
}

const clearFilters = () => {
    activeFilter.value = 'all'
    searchText.value = ''
}

const handleSearchShortcut = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.prompt-library .n-input__input-el')?.focus()
    }
}

watch(librarySplitSize, size => localStorage.setItem('prompt_library_split_size', String(size)))

onMounted(() => window.addEventListener('keydown', handleSearchShortcut))
onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleSearchShortcut)
    thumbnailUrlCache.forEach(url => URL.revokeObjectURL(url))
    thumbnailUrlCache.clear()
})
</script>

<style scoped>
.prompt-library {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    background: var(--surface-primary);
    border-right: 0;
}

.library-header { padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.library-title-row { height: 26px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.library-title-copy { display: flex; align-items: center; min-width: 0; gap: 7px; }
.library-title { font-size: 14px; letter-spacing: -.01em; }
.library-count { min-width: 22px; height: 20px; display: inline-flex; align-items: center; justify-content: center; padding: 0 7px; border: 1px solid var(--border-default); border-radius: 999px; color: var(--content-secondary); background: var(--surface-primary); font-size: 12px; font-variant-numeric: tabular-nums; }
.library-navigation { padding: 8px 8px 4px; }
.library-split { flex: 1; min-height: 0; }
.prompt-section, .category-section { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.category-list { flex: 1; min-height: 0; padding: 0 8px 8px; }
.library-nav-item, .category-item, .prompt-list-item {
    appearance: none; width: 100%; border: 0; color: var(--content-primary); background: transparent;
    cursor: pointer; text-align: left; border-radius: var(--radius-panel);
}
.library-nav-item, .category-item { display: flex; align-items: center; gap: 9px; min-height: 36px; padding: 6px 9px; font-size: var(--font-size-base); }
.library-nav-item:hover, .category-item:hover, .prompt-list-item:hover { background: var(--interactive-hover); }
.library-nav-item.active, .category-item.active { background: var(--surface-tertiary); color: var(--content-primary); font-weight: var(--font-weight-medium); }
.nav-count { margin-left: auto; color: var(--content-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.category-heading, .result-heading { min-height: 38px; display: flex; align-items: center; justify-content: space-between; padding: 8px 14px 5px; font-size: 12px; letter-spacing: .02em; }
.category-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.category-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt-results { flex: 1; min-height: 0; padding: 0 7px 10px; }
.prompt-list-item { position: relative; min-height: 56px; display: flex; align-items: center; gap: 10px; padding: 8px 9px 8px 10px; margin-bottom: 2px; border-radius: var(--radius-panel); }
.prompt-list-item.active { color: var(--content-primary); background: var(--surface-tertiary); }
.selection-check { width: 18px; height: 18px; margin: 1px 9px 0 0; flex: 0 0 auto; display: grid; place-items: center; border: 1px solid var(--border-default); border-radius: var(--radius-control); }
.selection-check.checked { color: white; border-color: var(--accent-primary); background: var(--accent-primary); }
.prompt-list-main { flex: 1; min-width: 0; }
.prompt-list-title-row { display: flex; align-items: center; gap: 6px; }
.prompt-list-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-base); font-weight: var(--font-weight-medium); }
.prompt-list-meta { display: flex; gap: 7px; margin-top: 4px; color: var(--content-secondary); font-size: 12px; overflow: hidden; white-space: nowrap; }
.prompt-thumbnail { width: 38px; height: 38px; flex: 0 0 38px; border-radius: var(--radius-image); object-fit: cover; background: var(--surface-secondary); }
.library-state { padding: 32px 8px; text-align: center; }
.selection-toolbar { margin: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.library-resize-line { width: 100%; height: 1px; margin: 4px 0; background: var(--border-default); transition: height .12s ease, margin .12s ease, background-color .12s ease; }
.library-split :deep(.n-split__resize-trigger-wrapper:hover) .library-resize-line,
.library-split :deep(.n-split__resize-trigger--hover) { height: 3px; margin: 3px 0; background: var(--content-secondary); }
</style>
