<template>
    <div ref="rootRef" class="prompt-card-taxonomy">
        <span v-if="$slots.leading" ref="leadingRef" class="taxonomy-leading">
            <slot name="leading" />
        </span>
        <NTag v-if="category" ref="categoryRef" size="small" :bordered="false"
            :color="getCategoryTagColor(category)" class="taxonomy-category" :title="category.name">
            {{ category.name }}
        </NTag>
        <NTag v-for="(tag, index) in tags" :key="tag" size="small"
            :ref="el => setTagRef(el as ComponentPublicInstance | null, index)" :bordered="false"
            :color="getTagColor(tag)" class="taxonomy-tag" :class="{ 'is-measuring': index >= visibleCount }"
            :aria-hidden="index >= visibleCount ? 'true' : undefined" :title="tag">
            {{ tag }}
        </NTag>
        <NTooltip v-if="hiddenTags.length" :delay="300">
            <template #trigger>
                <NText depth="3" class="taxonomy-overflow">+{{ hiddenTags.length }}</NText>
            </template>
            {{ hiddenTags.join(', ') }}
        </NTooltip>
        <!-- 只用于测量 +N 的最大宽度，不参与布局 -->
        <NText v-if="tags.length" ref="overflowProbeRef" depth="3" class="taxonomy-overflow is-measuring"
            aria-hidden="true">+{{ tags.length }}</NText>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { NTag, NText, NTooltip } from 'naive-ui'
import { useTagColors } from '@/composables/useTagColors'
import { fitTaxonomyTags } from '@/lib/utils/taxonomy-fit'
import type { CategoryWithRelations } from '@shared/types/database'

const props = defineProps<{
    category?: CategoryWithRelations | null
    tags: string[]
}>()

const GAP = 5
const CATEGORY_MIN_WIDTH = 72

const { getTagColor, getCategoryTagColor } = useTagColors()

const rootRef = ref<HTMLElement | null>(null)
const leadingRef = ref<HTMLElement | null>(null)
const categoryRef = ref<ComponentPublicInstance | null>(null)
// v-for 的数组 ref 不保证顺序，按下标记录，测量结果才能与 tags 一一对应
const tagRefs: (ComponentPublicInstance | null)[] = []
const setTagRef = (instance: ComponentPublicInstance | null, index: number) => { tagRefs[index] = instance }
const overflowProbeRef = ref<ComponentPublicInstance | null>(null)
const visibleCount = ref(props.tags.length)

const hiddenTags = computed(() => props.tags.slice(visibleCount.value))

const elementOf = (instance: ComponentPublicInstance | null) => (instance?.$el as HTMLElement | undefined) ?? null

// 分类标签可能已被压缩，按内容的 scrollWidth 还原它不受压缩时的宽度
const naturalCategoryWidth = (el: HTMLElement) => {
    const content = el.querySelector<HTMLElement>('.n-tag__content')
    if (!content) return el.offsetWidth
    return el.offsetWidth - content.clientWidth + content.scrollWidth
}

const measure = () => {
    const root = rootRef.value
    if (!root || !root.clientWidth) return

    const categoryEl = elementOf(categoryRef.value)
    const probe = elementOf(overflowProbeRef.value)
    visibleCount.value = fitTaxonomyTags({
        available: root.clientWidth,
        gap: GAP,
        leading: leadingRef.value ? [leadingRef.value.offsetWidth] : [],
        category: categoryEl
            ? { natural: naturalCategoryWidth(categoryEl), minWidth: CATEGORY_MIN_WIDTH }
            : undefined,
        tags: props.tags.map((_, index) => elementOf(tagRefs[index] ?? null)?.offsetWidth ?? 0),
        overflowWidth: () => probe?.offsetWidth ?? 0,
    })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
    measure()
    resizeObserver = new ResizeObserver(() => measure())
    if (rootRef.value) resizeObserver.observe(rootRef.value)
    document.fonts?.ready.then(measure).catch(() => undefined)
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
})

watch(() => [props.category?.name, props.tags.join('\u0000')], async () => {
    await nextTick()
    measure()
})
</script>

<style scoped>
.prompt-card-taxonomy { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.taxonomy-leading { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; }
.taxonomy-category { flex: 0 1 auto; min-width: 0; max-width: 100%; }
.taxonomy-tag { flex: 0 0 auto; max-width: 96px; }
.taxonomy-category :deep(.n-tag__content),
.taxonomy-tag :deep(.n-tag__content) { overflow: hidden; text-overflow: ellipsis; }
.taxonomy-overflow { flex: 0 0 auto; display: inline-flex; white-space: nowrap; align-items: center; height: 22px; font-size: 12px; font-variant-numeric: tabular-nums; }
/* 放不下的标签保留自然宽度用于测量，但不占位、不可见 */
.is-measuring { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
</style>
