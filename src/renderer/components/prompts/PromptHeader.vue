<template>
  <header class="prompt-header">
    <!-- 窄宽度下提示词列表收进了抽屉，打开它的按钮放在页头最左边，不压在底栏上 -->
    <NTooltip v-if="showLibraryToggle" :show-arrow="false">
      <template #trigger>
        <NButton quaternary size="small" class="prompt-header__icon-button" :aria-label="t('promptWorkspace.showLibrary')"
          @click="emit('toggle-library')">
          <template #icon><NIcon :size="16"><LayoutSidebar /></NIcon></template>
        </NButton>
      </template>
      {{ t('promptWorkspace.showLibrary') }}
    </NTooltip>
    <div class="prompt-header__main">
      <template v-if="editing">
        <!-- 标题和描述按内容自动长高，长标题换行显示完整；它们都是单行文字，回车不换行，粘贴进来的换行换成空格 -->
        <textarea v-model="form.title" rows="1" class="prompt-header__title-input ui-title-page" :aria-label="t('promptPage.titleLabel')"
          :placeholder="t('promptPage.titlePlaceholder')" maxlength="200" @keydown.enter.prevent
          @input="flattenLineBreaks($event, 'title')" />
        <textarea v-model="form.description" rows="1" class="prompt-header__description-input" :aria-label="t('promptPage.descriptionLabel')"
          :placeholder="t('promptPage.descriptionPlaceholder')" @keydown.enter.prevent
          @input="flattenLineBreaks($event, 'description')" />
        <div class="prompt-header__taxonomy">
          <!-- 「新建分类…」把下拉换成输入框：回车创建并选中，Esc 取消 -->
          <input v-if="creatingCategory" ref="categoryInputRef" v-model="categoryDraft"
            class="prompt-header__tag-input prompt-header__category-input" maxlength="50"
            :placeholder="t('promptPage.newCategoryPlaceholder')" :aria-label="t('promptPage.newCategory')"
            @keydown.enter="handleEnterKey($event, submitCategory)" @keydown.esc="handleEscapeKey($event, cancelCategory)"
            @blur="commitCategory" />
          <NDropdown v-else trigger="click" :options="categoryOptions" @select="selectCategory">
            <NButton ref="categoryButtonRef" size="tiny" :title="currentCategory?.name || t('promptLibrary.uncategorized')">
              <UiCategoryDot :color="currentCategory?.color" />
              <span class="prompt-header__category-name">{{ currentCategory?.name || t('promptLibrary.uncategorized') }}</span>
              <NIcon :size="12"><ChevronDown /></NIcon>
            </NButton>
          </NDropdown>
          <!-- 分类名、标签名是用户数据：太长时省略，悬停看全文 -->
          <span v-for="tag in form.tags" :key="tag" class="ui-tag" :title="`#${tag}`">
            <span class="ui-tag__text">#{{ tag }}</span>
            <button type="button" class="prompt-header__remove-tag" :aria-label="t('promptPage.removeTag', { tag })" @click="removeTag(tag)">
              <NIcon :size="12"><X /></NIcon>
            </button>
          </span>
          <input v-if="addingTag" ref="tagInputRef" v-model="tagDraft" class="prompt-header__tag-input" list="prompt-tag-suggestions"
            :placeholder="t('promptPage.tagPlaceholder')" :aria-label="t('promptPage.addTag')"
            @keydown.enter="handleEnterKey($event, () => commitTag(true))" @keydown.esc="handleEscapeKey($event, cancelTag)"
            @blur="commitTag()" />
          <NButton v-else ref="addTagButtonRef" quaternary size="tiny" @click="startAddingTag">
            <template #icon><NIcon :size="12"><Plus /></NIcon></template>
            {{ t('promptPage.tag') }}
          </NButton>
          <datalist id="prompt-tag-suggestions">
            <option v-for="tag in tagSuggestions" :key="tag" :value="tag" />
          </datalist>
          <NButton quaternary size="tiny" @click="imageInputRef?.click()">
            <template #icon><NIcon :size="12"><Photo /></NIcon></template>
            {{ t('promptPage.image') }}
          </NButton>
          <input ref="imageInputRef" type="file" accept="image/*" multiple hidden @change="handleImages" />
          <span class="ui-tag ui-tag--line prompt-header__template">
            {{ form.isJinjaTemplate ? t('promptPage.jinjaTemplate') : t('promptPage.regularTemplate') }}
          </span>
          <NButton quaternary size="tiny" @click="emit('switch-template', !form.isJinjaTemplate)">
            {{ form.isJinjaTemplate ? t('promptPage.useRegular') : t('promptPage.useJinja') }}
          </NButton>
          <span v-if="hint" class="prompt-header__hint">{{ hint }}</span>
        </div>
      </template>

      <template v-else>
        <div class="prompt-header__title-row">
          <h1 class="ui-title-page prompt-header__title">{{ form.title || t('promptLibrary.untitled') }}</h1>
          <span v-if="form.isJinjaTemplate" class="ui-tag ui-tag--line">Jinja</span>
          <NTooltip v-if="prompt?.id" :show-arrow="false">
            <template #trigger>
              <NButton quaternary size="small" class="prompt-header__icon-button" :class="{ 'is-favorite': prompt.isFavorite }"
                :aria-label="prompt.isFavorite ? t('promptPage.unfavorite') : t('promptPage.favorite')"
                @click="emit('toggle-favorite')">
                <template #icon><NIcon :size="16"><Star /></NIcon></template>
              </NButton>
            </template>
            {{ prompt.isFavorite ? t('promptPage.unfavorite') : t('promptPage.favorite') }}
          </NTooltip>
        </div>
        <p v-if="form.description" class="prompt-header__description">{{ form.description }}</p>
        <div class="prompt-header__taxonomy">
          <span v-if="currentCategory" class="ui-tag" :title="currentCategory.name">
            <UiCategoryDot :color="currentCategory.color" /><span class="ui-tag__text">{{ currentCategory.name }}</span>
          </span>
          <span v-for="tag in form.tags" :key="tag" class="ui-tag" :title="`#${tag}`"><span class="ui-tag__text">#{{ tag }}</span></span>
          <span v-if="meta" class="prompt-header__meta">{{ meta }}</span>
        </div>
      </template>
    </div>

    <div class="prompt-header__actions">
      <NTooltip v-if="showSideToggle" :show-arrow="false">
        <template #trigger>
          <NButton quaternary size="small" class="prompt-header__icon-button"
            :aria-label="t('promptPage.showSidePanel')" @click="emit('toggle-side-panel')">
            <template #icon><NIcon :size="16"><LayoutSidebarRight /></NIcon></template>
          </NButton>
        </template>
        {{ t('promptPage.showSidePanel') }}
      </NTooltip>
      <NTooltip v-if="prompt?.id" :show-arrow="false">
        <template #trigger>
          <NButton quaternary size="small" class="prompt-header__icon-button" :class="{ 'is-active': historyOpen }"
            :aria-label="t('promptHistory.title')" @click="emit('open-history')">
            <template #icon><NIcon :size="16"><History /></NIcon></template>
          </NButton>
        </template>
        {{ t('promptHistory.title') }}
      </NTooltip>
      <NDropdown v-if="moreOptions.length" trigger="click" placement="bottom-end" :options="moreOptions" @select="handleMore">
        <NButton quaternary size="small" class="prompt-header__icon-button" :aria-label="t('promptPage.moreActions')">
          <template #icon><NIcon :size="16"><Dots /></NIcon></template>
        </NButton>
      </NDropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, h, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NTooltip, useMessage, type DropdownOption } from 'naive-ui'
import {
  Adjustments, ChevronDown, Copy, Dots, History, Keyboard, LayoutSidebar, LayoutSidebarRight, Photo, Plus, Stars, Star, Trash, X,
} from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import { api } from '@/lib/api'
import { handleEscapeKey } from '@/lib/utils/escape-layers'
import type { PromptEditorForm } from '@/lib/utils/prompt-editor'
import { handleEnterKey } from '@/lib/utils/ime'
import { CATEGORY_COLORS } from '@/lib/utils/tag-colors'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const props = withDefaults(defineProps<{
  form: PromptEditorForm
  prompt: PromptWithRelations | null
  categories: Category[]
  editing: boolean
  meta?: string
  hint?: string
  tagSuggestions?: string[]
  historyOpen?: boolean
  showSideToggle?: boolean
  showLibraryToggle?: boolean
  canSetShortcut?: boolean
}>(), {
  meta: '',
  hint: '',
  tagSuggestions: () => [],
  historyOpen: false,
  showSideToggle: false,
  showLibraryToggle: false,
  canSetShortcut: false,
})

const emit = defineEmits<{
  'toggle-favorite': []
  'open-history': []
  'toggle-side-panel': []
  'toggle-library': []
  'manage-categories': []
  'switch-template': [jinja: boolean]
  'add-images': [files: File[]]
  summarize: []
  'set-shortcut': []
  'copy-raw': []
  delete: []
}>()

const { t } = useI18n()
const message = useMessage()
const addingTag = ref(false)
const tagDraft = ref('')
const tagInputRef = ref<HTMLInputElement>()
const addTagButtonRef = ref<InstanceType<typeof NButton>>()
const imageInputRef = ref<HTMLInputElement>()
const creatingCategory = ref(false)
const categoryDraft = ref('')
const categoryInputRef = ref<HTMLInputElement>()
const categoryButtonRef = ref<InstanceType<typeof NButton>>()
// 刚建好的分类：列表要等数据刷新后才带上它，这期间按钮照样显示它的名字和颜色
const createdCategory = ref<Category | null>(null)

const currentCategory = computed(() => (
  props.categories.find(category => category.id === props.form.categoryId)
  || (createdCategory.value && createdCategory.value.id === props.form.categoryId ? createdCategory.value : undefined)
))

const menuIcon = (icon: typeof Copy) => () => h(NIcon, { size: 16 }, { default: () => h(icon) })
const dot = (color?: string | null) => () => h(UiCategoryDot, { color })

const CREATE_CATEGORY_KEY = '__create-category'
const MANAGE_CATEGORIES_KEY = '__manage-categories'

const categoryOptions = computed<DropdownOption[]>(() => [
  ...props.categories.map(category => ({ key: category.id!, label: category.name, icon: dot(category.color) })),
  { type: 'divider', key: 'divider' },
  { key: 'none', label: t('promptLibrary.uncategorized'), icon: dot(null) },
  { type: 'divider', key: 'divider-actions' },
  { key: CREATE_CATEGORY_KEY, label: t('promptPage.newCategory'), icon: menuIcon(Plus) },
  { key: MANAGE_CATEGORIES_KEY, label: t('promptLibrary.manageCategories'), icon: menuIcon(Adjustments) },
])

const moreOptions = computed<DropdownOption[]>(() => {
  if (!props.prompt?.id) return []
  return [
    { key: 'summarize', label: t('promptAI.summarize'), icon: menuIcon(Stars) },
    ...(props.canSetShortcut ? [{ key: 'shortcut', label: t('promptPage.setShortcut'), icon: menuIcon(Keyboard) }] : []),
    { key: 'copy-raw', label: t('promptPage.copyRaw'), icon: menuIcon(Copy) },
    { type: 'divider', key: 'divider' },
    { key: 'delete', label: t('common.delete'), icon: menuIcon(Trash), props: { class: 'is-danger' } },
  ]
})

// form 是提示词页编辑状态（usePromptEditor）的共享对象，头部直接改它，和输入框的 v-model 一致
const selectCategory = (key: string | number) => {
  if (key === CREATE_CATEGORY_KEY) void startCreatingCategory()
  else if (key === MANAGE_CATEGORIES_KEY) emit('manage-categories')
  else props.form.categoryId = key === 'none' ? null : Number(key)
}

// NButton 实例上没有 focus，取它渲染的 <button>
const focusButton = (button?: InstanceType<typeof NButton>) => (button?.$el as HTMLElement | undefined)?.focus()

const startCreatingCategory = async () => {
  creatingCategory.value = true
  categoryDraft.value = ''
  await nextTick()
  categoryInputRef.value?.focus()
}

const cancelCategory = async () => {
  // 先清空草稿：输入框卸载时触发的 blur 不会再去创建
  categoryDraft.value = ''
  creatingCategory.value = false
  await nextTick()
  focusButton(categoryButtonRef.value)
}

// 新分类用还没被占用的颜色，都用过了就按数量轮换
const nextCategoryColor = () => {
  const used = new Set(props.categories.map(category => (category.color || '').toLowerCase()))
  return CATEGORY_COLORS.find(color => !used.has(color.toLowerCase())) || CATEGORY_COLORS[props.categories.length % CATEGORY_COLORS.length]
}

const commitCategory = async () => {
  const name = categoryDraft.value.trim()
  categoryDraft.value = ''
  creatingCategory.value = false
  if (!name) return
  // 同名分类已经有了就直接选中，不重复创建
  const existing = props.categories.find(category => category.name.trim().toLowerCase() === name.toLowerCase())
  if (existing?.id) {
    props.form.categoryId = existing.id
    return
  }
  try {
    const created = await api.categories.create.mutate({ name, color: nextCategoryColor(), uuid: '', isActive: true, description: '' })
    createdCategory.value = created
    props.form.categoryId = created.id ?? null
    message.success(t('promptPage.categoryCreated', { name }))
  } catch (error) {
    console.error(error)
    message.error(t('promptManagement.categoryCreatedFailed'))
  }
}

// 回车创建后焦点回到分类按钮；点别处（blur）提交时焦点留在用户点的地方
const submitCategory = () => {
  void commitCategory()
  void nextTick(() => focusButton(categoryButtonRef.value))
}

const flattenLineBreaks = (event: Event, field: 'title' | 'description') => {
  const value = (event.target as HTMLTextAreaElement).value
  if (/[\r\n]/.test(value)) props.form[field] = value.replace(/\s*[\r\n]+\s*/g, ' ')
}

const startAddingTag = async () => {
  addingTag.value = true
  tagDraft.value = ''
  await nextTick()
  tagInputRef.value?.focus()
}

/** 回车（keepOpen）加一个标签后输入框留着，可以接着输入下一个；空着回车或点别处结束 */
const commitTag = (keepOpen = false) => {
  const tag = tagDraft.value.trim().replace(/^#/, '')
  tagDraft.value = ''
  if (!keepOpen) addingTag.value = false
  else if (!tag) {
    addingTag.value = false
    void nextTick(() => focusButton(addTagButtonRef.value))
    return
  }
  if (!tag || props.form.tags.includes(tag)) return
  props.form.tags = [...props.form.tags, tag]
}

// Esc 放弃这次输入：先清空草稿，输入框卸载时触发的 blur 就不会把半截文字加成标签
const cancelTag = async () => {
  tagDraft.value = ''
  addingTag.value = false
  await nextTick()
  focusButton(addTagButtonRef.value)
}

const removeTag = (tag: string) => {
  props.form.tags = props.form.tags.filter(item => item !== tag)
}

const handleImages = (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const accepted = files.filter(file => {
    if (!file.type.startsWith('image/')) {
      message.error(t('promptManagement.invalidImageType'))
      return false
    }
    if (file.size > MAX_IMAGE_SIZE) {
      message.error(t('promptManagement.imageTooLarge'))
      return false
    }
    return true
  })
  if (accepted.length) emit('add-images', accepted)
}

const handleMore = (key: string | number) => {
  if (key === 'summarize') emit('summarize')
  else if (key === 'shortcut') emit('set-shortcut')
  else if (key === 'copy-raw') emit('copy-raw')
  else if (key === 'delete') emit('delete')
}
</script>

<style scoped>
.prompt-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.prompt-header__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.prompt-header__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.prompt-header__title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.prompt-header__description {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  /* 和标题一样：没有空格的超长描述也要换行，不能伸到侧栏下面 */
  overflow-wrap: anywhere;
}

.prompt-header__title-input,
.prompt-header__description-input {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--reading-width);
  field-sizing: content;
  resize: none;
  overflow: hidden;
  padding: 0 0 2px;
  border: 0;
  border-bottom: 1px dashed var(--border-strong);
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font-family: inherit;
}

.prompt-header__title-input:focus,
.prompt-header__description-input:focus {
  border-bottom-color: var(--accent-primary);
}

.prompt-header__description-input {
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.prompt-header__title-input::placeholder,
.prompt-header__description-input::placeholder {
  color: var(--content-muted);
}

.prompt-header__taxonomy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.prompt-header__taxonomy :deep(.n-button__content) {
  gap: 6px;
}

.prompt-header__category-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-header__remove-tag {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  cursor: pointer;
}

.prompt-header__remove-tag:hover {
  color: var(--content-primary);
}

.prompt-header__tag-input {
  width: 110px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--accent-brand);
  border-radius: var(--radius-tag);
  outline: none;
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-xs);
}

.prompt-header__category-input {
  width: 150px;
}

.prompt-header__template {
  margin-left: 6px;
}

.prompt-header__meta,
.prompt-header__hint {
  margin-left: 6px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

/* AI 补上标题和描述后的提示单独占一行，和上面的分类按钮左对齐 */
.prompt-header__hint {
  flex-basis: 100%;
  margin-left: 0;
}

.prompt-header__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.prompt-header__icon-button {
  width: 28px;
  padding: 0;
}

.prompt-header__icon-button.is-favorite {
  color: var(--accent-favorite);
}

.prompt-header__icon-button.is-favorite :deep(svg) {
  fill: currentColor;
}

.prompt-header__icon-button.is-active {
  background: var(--surface-tertiary);
}
</style>
