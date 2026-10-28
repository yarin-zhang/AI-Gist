<template>
  <ion-page>
    <MobileNavBar :title="isEdit ? t('mobilePrompt.editTitle') : t('promptManagement.createPrompt')" leading="none" solid>
      <template #start>
        <button type="button" class="m-btn cancel-button" @click="handleCancel">{{ t('common.cancel') }}</button>
      </template>
      <template #end>
        <button type="button" class="m-save" :disabled="saving || loading" @click="handleSave">{{ t('common.save') }}</button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <form v-else class="m-body editor" @submit.prevent="handleSave">
        <!-- 核心内容：标题和正文在同一张卡片里，底部是插入变量和快速优化 -->
        <div class="m-card editor-card">
          <input v-model="form.title" class="editor-title" :placeholder="t('promptPage.titlePlaceholder')"
            :aria-label="t('promptPage.titleLabel')" enterkeyhint="next" @keydown.enter.prevent="focusBody" />

          <!-- 正文：普通文本框，背后一层同样排版的文字把 {{变量}} 标成变量色块 -->
          <div class="editor-text">
            <div class="editor-text__backdrop" aria-hidden="true"><template v-for="(segment, index) in bodySegments" :key="index"><mark v-if="segment.kind === 'variable'" class="editor-text__var">{{ segment.raw }}</mark><template v-else>{{ segment.text }}</template></template>{{ '\n' }}</div>
            <textarea ref="bodyRef" v-model="form.content" class="editor-text__input" rows="7"
              :placeholder="t('promptManagement.contentPlaceholder')" :aria-label="t('promptManagement.content')"
              @input="autoGrowBody" @blur="rememberSelection" @select="rememberSelection" @keyup="rememberSelection"
              @click="rememberSelection"></textarea>
          </div>

          <!-- 文字长的语言里放不下一行时换行，字数始终靠右 -->
          <div class="editor-toolbar">
            <button type="button" class="m-chip editor-chip" @click="insertVariable">
              <ion-icon :icon="codeSlashOutline" aria-hidden="true" />
              <span class="editor-chip__label">{{ t('promptEditor.insertVariable') }}</span>
            </button>
            <button type="button" class="m-chip editor-chip editor-chip--ai" @click="openQuickOptimize">
              <ion-icon :icon="sparkles" aria-hidden="true" />
              <span class="editor-chip__label">{{ t('mobilePrompt.quickOptimize') }}</span>
              <ion-icon :icon="chevronDown" class="editor-chip__caret" aria-hidden="true" />
            </button>
            <span class="editor-toolbar__meta">
              <span v-if="form.isJinjaTemplate" class="m-pill m-pill-blue">Jinja</span>
              <span class="char-count">{{ contentLength }} {{ t('promptManagement.characters') }}</span>
            </span>
          </div>
        </div>

        <!-- 元信息：点进去分别编辑 -->
        <div class="m-group ic">
          <button type="button" class="m-row" @click="showDescriptionSheet = true">
            <span class="m-tile m-tile--teal" aria-hidden="true"><ion-icon :icon="readerOutline" /></span>
            <span class="title">{{ t('promptManagement.description') }}</span>
            <span class="end">
              <span class="row-value">{{ form.description || t('mobilePrompt.notSet') }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
          <button type="button" class="m-row" @click="showCategorySheet = true">
            <span class="m-tile m-tile--orange" aria-hidden="true"><ion-icon :icon="folderOutline" /></span>
            <span class="title">{{ t('promptManagement.category') }}</span>
            <span class="end">
              <span class="row-value">{{ selectedCategoryName }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
          <button type="button" class="m-row" @click="openTagsSheet">
            <span class="m-tile m-tile--pink" aria-hidden="true"><ion-icon :icon="pricetagOutline" /></span>
            <span class="title">{{ t('promptManagement.tags') }}</span>
            <span class="end">
              <span class="row-value">{{ form.tags.length ? form.tags.join(listSeparator) : t('mobilePrompt.notSet') }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
          <button type="button" class="m-row" @click="showVariableSettings = true">
            <span class="m-tile m-tile--blue" aria-hidden="true"><ion-icon :icon="optionsOutline" /></span>
            <span class="title">{{ t('promptManagement.detailModal.variableSettings') }}</span>
            <span class="end">
              <span class="row-value">{{ activeVariables.length ? t('promptLibrary.variableCount', { count: activeVariables.length }) : t('promptPage.none') }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
          <button type="button" class="m-row" @click="showImagesSheet = true">
            <span class="m-tile m-tile--violet" aria-hidden="true"><ion-icon :icon="imageOutline" /></span>
            <span class="title">{{ t('promptManagement.images') }}</span>
            <span class="end">
              <span class="row-value">{{ form.imageBlobs.length ? t('mobilePrompt.imageCount', { count: form.imageBlobs.length }) : t('promptPage.none') }}</span>
              <ion-icon :icon="chevronForward" class="chev" aria-hidden="true" />
            </span>
          </button>
        </div>

        <div class="m-group ic">
          <div class="m-row m-row--static">
            <span class="m-tile m-tile--amber" aria-hidden="true"><ion-icon :icon="star" /></span>
            <span class="title">{{ t('promptManagement.detailModal.favorite') }}</span>
            <span class="end">
              <ion-toggle :checked="form.isFavorite" :aria-label="t('promptManagement.detailModal.favorite')"
                @ionChange="form.isFavorite = $event.detail.checked" />
            </span>
          </div>
        </div>
      </form>
    </ion-content>

    <!-- 描述：底部面板里直接编辑，文本框随内容撑高，长描述也能整段看到 -->
    <ion-modal class="m-sheet-modal" :is-open="showDescriptionSheet" :breakpoints="[0, 0.85, 1]" :initial-breakpoint="0.85"
      :handle="false" @didPresent="focusDescription" @didDismiss="closeDescriptionSheet">
      <div class="m-sheet picker-sheet">
        <div class="m-grab" aria-hidden="true" />
        <header class="picker-sheet__head">
          <span class="picker-sheet__side" aria-hidden="true" />
          <h2 class="picker-sheet__title">{{ t('promptManagement.description') }}</h2>
          <button type="button" class="m-btn picker-sheet__done" @click="showDescriptionSheet = false">{{ t('mobilePrompt.done') }}</button>
        </header>
        <ion-content class="picker-sheet__content">
          <div class="m-body picker-sheet__body">
            <textarea ref="descriptionRef" v-model="form.description" class="description-input" rows="5"
              :placeholder="t('promptManagement.descriptionPlaceholder')" :aria-label="t('promptManagement.description')"
              @input="autoGrowDescription"></textarea>
          </div>
        </ion-content>
      </div>
    </ion-modal>

    <!-- 分类 -->
    <ion-modal class="m-sheet-modal" :is-open="showCategorySheet" :breakpoints="[0, 0.6, 1]" :initial-breakpoint="0.6"
      :handle="false" @didDismiss="showCategorySheet = false">
      <div class="m-sheet picker-sheet">
        <div class="m-grab" aria-hidden="true" />
        <header class="picker-sheet__head">
          <span class="picker-sheet__side" aria-hidden="true" />
          <h2 class="picker-sheet__title">{{ t('promptManagement.category') }}</h2>
          <button type="button" class="m-btn picker-sheet__done" @click="showCategorySheet = false">{{ t('mobilePrompt.done') }}</button>
        </header>
        <ion-content class="picker-sheet__content">
          <div class="m-body picker-sheet__body">
            <div class="m-group picker-sheet__group" role="radiogroup" :aria-label="t('promptManagement.category')">
              <button type="button" class="m-row" role="radio" :aria-checked="!form.categoryId" @click="selectCategory(null)">
                <span class="category-dot" :style="{ background: categoryColor(null) }" aria-hidden="true" />
                <span class="title">{{ t('promptManagement.noCategory') }}</span>
                <span class="end"><ion-icon v-if="!form.categoryId" :icon="checkmark" class="check" aria-hidden="true" /></span>
              </button>
              <button v-for="category in categories" :key="category.id" type="button" class="m-row" role="radio"
                :aria-checked="form.categoryId === category.id" @click="selectCategory(category.id ?? null)">
                <span class="category-dot" :style="{ background: categoryColor(category) }" aria-hidden="true" />
                <span class="title">{{ category.name }}</span>
                <span class="end"><ion-icon v-if="form.categoryId === category.id" :icon="checkmark" class="check" aria-hidden="true" /></span>
              </button>
            </div>
          </div>
        </ion-content>
      </div>
    </ion-modal>

    <!-- 标签：搜索、新增与快速勾选热门标签 -->
    <ion-modal class="m-sheet-modal" :is-open="showTagsModal" :breakpoints="[0, 0.85, 1]" :initial-breakpoint="0.85"
      :handle="false" @didDismiss="closeTagsSheet">
      <div class="m-sheet picker-sheet">
        <div class="m-grab" aria-hidden="true" />
        <header class="picker-sheet__head">
          <span class="picker-sheet__side" aria-hidden="true" />
          <h2 class="picker-sheet__title">{{ t('promptManagement.selectTags') }}</h2>
          <button type="button" class="m-btn picker-sheet__done" @click="showTagsModal = false">{{ t('mobilePrompt.done') }}</button>
        </header>
        <ion-content class="picker-sheet__content">
          <div class="m-body picker-sheet__body">
            <label class="m-input picker-sheet__search">
              <ion-icon :icon="searchOutline" aria-hidden="true" />
              <input v-model="tagSearchText" :placeholder="t('promptManagement.searchOrAddTag')"
                :aria-label="t('promptManagement.searchOrAddTag')" enterkeyhint="done"
                @keydown.enter.prevent="addTag(tagSearchText.trim())" />
            </label>

            <!-- 已选标签 -->
            <div v-if="form.tags.length > 0" class="selected-tags">
              <button v-for="tag in form.tags" :key="tag" type="button" class="m-chip on"
                :aria-label="t('promptPage.removeTag', { tag })" @click="removeTag(tag)">
                {{ tag }}
                <ion-icon :icon="closeCircle" aria-hidden="true" />
              </button>
            </div>

            <!-- 添加新标签 -->
            <div v-if="tagSearchText.trim() && !form.tags.includes(tagSearchText.trim())" class="m-group picker-sheet__group">
              <button type="button" class="m-row" @click="addTag(tagSearchText.trim())">
                <ion-icon :icon="addCircleOutline" class="add-icon" aria-hidden="true" />
                <span class="title">{{ t('promptManagement.addTag', { tag: tagSearchText.trim() }) }}</span>
              </button>
            </div>

            <!-- 热门标签 -->
            <section v-if="filteredPopularTags.length" class="m-section">
              <span class="m-gt">{{ t('promptManagement.popularTags') }}</span>
              <div class="m-group picker-sheet__group">
                <button v-for="tag in filteredPopularTags" :key="tag" type="button" class="m-row" role="checkbox"
                  :aria-checked="form.tags.includes(tag)" @click="toggleTag(tag)">
                  <span class="title">{{ tag }}</span>
                  <span class="end"><ion-icon v-if="form.tags.includes(tag)" :icon="checkmark" class="check" aria-hidden="true" /></span>
                </button>
              </div>
            </section>
          </div>
        </ion-content>
      </div>
    </ion-modal>

    <!-- 图片 -->
    <ion-modal class="m-sheet-modal" :is-open="showImagesSheet" :breakpoints="[0, 0.7, 1]" :initial-breakpoint="0.7"
      :handle="false" @didDismiss="showImagesSheet = false">
      <div class="m-sheet picker-sheet">
        <div class="m-grab" aria-hidden="true" />
        <header class="picker-sheet__head">
          <span class="picker-sheet__side" aria-hidden="true" />
          <h2 class="picker-sheet__title">{{ t('promptManagement.images') }}</h2>
          <button type="button" class="m-btn picker-sheet__done" @click="showImagesSheet = false">{{ t('mobilePrompt.done') }}</button>
        </header>
        <ion-content class="picker-sheet__content">
          <div class="m-body picker-sheet__body">
            <div class="image-grid">
              <div v-for="(url, index) in imagePreviewUrls" :key="url" class="image-item">
                <img :src="url" class="image-thumb" :alt="t('promptPage.imageAlt', { index: index + 1 })" />
                <button type="button" class="image-remove" :aria-label="t('promptPage.removeImage', { index: index + 1 })"
                  @click="removeImage(index)">
                  <ion-icon :icon="closeCircle" />
                </button>
              </div>
              <button type="button" class="image-add" :aria-label="t('promptManagement.addImage')" @click="triggerImagePicker">
                <ion-icon :icon="add" />
              </button>
            </div>
            <p class="m-note">
              <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
              <span>{{ t('mobilePrompt.imageHint') }}</span>
            </p>
          </div>
        </ion-content>
      </div>
    </ion-modal>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden-file-input"
      @change="handleImageFilesSelected"
    />

    <MobileVariableSettings
      :open="showVariableSettings"
      :variables="activeVariables"
      :unused="unusedVariables"
      :occurrences="occurrences"
      :jinja="form.isJinjaTemplate"
      @update="updateVariable"
      @remove="removeVariable"
      @close="showVariableSettings = false"
    />

    <MobileQuickOptimizeSheet
      :open="Boolean(optimizeConfig)"
      :config="optimizeConfig"
      :content="optimizeSource"
      :model="models.selected.value"
      @adopt="adoptOptimization"
      @close="optimizeConfig = null"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonModal,
  IonSpinner,
  IonToggle,
  actionSheetController,
  alertController,
  useBackButton
} from '@ionic/vue'
import {
  add,
  addCircleOutline,
  checkmark,
  chevronDown,
  chevronForward,
  closeCircle,
  codeSlashOutline,
  folderOutline,
  imageOutline,
  informationCircleOutline,
  optionsOutline,
  pricetagOutline,
  readerOutline,
  searchOutline,
  sparkles,
  star
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { collectPromptTags } from '~/lib/utils/prompt-library'
import { parsePromptTemplate, validateVariableName } from '~/lib/utils/prompt-template'
import type { Category } from '@shared/types'
import type { QuickOptimizationConfig } from '@shared/types/ai'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileVariableSettings from '~/components/mobile/prompt/MobileVariableSettings.vue'
import MobileQuickOptimizeSheet from '~/components/mobile/prompt/MobileQuickOptimizeSheet.vue'
import { categoryColor } from '~/components/mobile/prompt/prompt-meta'
import { useMobilePromptForm } from '~/components/mobile/prompt/useMobilePromptForm'
import { useMobileModels } from '~/components/mobile/prompt/useMobileModels'
import { reportDraftSaved, takePromptDraft } from '~/components/mobile/prompt/prompt-draft-handoff'
import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()

const isEdit = computed(() => !!route.params.id)
const promptId = computed(() => {
  const id = route.params.id as string
  return id ? parseInt(id, 10) : null
})

const {
  form,
  dirty,
  activeVariables,
  unusedVariables,
  occurrences,
  load,
  addVariable,
  updateVariable,
  removeVariable,
  save,
} = useMobilePromptForm()

const loading = ref(isEdit.value)
const saving = ref(false)
const categories = ref<Category[]>([])
const popularTags = ref<string[]>([])
const showDescriptionSheet = ref(false)
const showCategorySheet = ref(false)
const showTagsModal = ref(false)
const showImagesSheet = ref(false)
const showVariableSettings = ref(false)
const tagSearchText = ref('')
const bodyRef = ref<HTMLTextAreaElement | null>(null)
const descriptionRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
// 从 AI 生成页「编辑后保存」带过来的草稿：保存后通知生成页
let fromGeneratedDraft = false
// 采纳 AI 修改后，下一次保存写进版本历史的说明
let pendingChangeDescription = ''
// 正文光标位置：插入变量时插到这里
let lastSelection: { start: number; end: number } | null = null

const contentLength = computed(() => form.value.content.length)

// 标签摘要的分隔符：中日文用顿号，其他语言用逗号
const listSeparator = computed(() => (/^(zh|ja)/.test(locale.value) ? '、' : ', '))

const bodySegments = computed(() => parsePromptTemplate(form.value.content).segments)

const selectedCategoryName = computed(() => (
  categories.value.find(category => category.id === form.value.categoryId)?.name || t('promptManagement.noCategory')
))

// ---------- 正文 ----------
const autoGrowBody = () => {
  const element = bodyRef.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

// 采纳优化结果、插入变量等程序改动之后同样按内容撑开
watch(() => form.value.content, () => nextTick(autoGrowBody))

const rememberSelection = () => {
  const element = bodyRef.value
  if (!element) return
  lastSelection = { start: element.selectionStart, end: element.selectionEnd }
}

const focusBody = () => {
  bodyRef.value?.focus()
}

const insertAtCursor = async (text: string) => {
  const content = form.value.content
  const start = Math.min(lastSelection?.start ?? content.length, content.length)
  const end = Math.min(lastSelection?.end ?? start, content.length)
  form.value.content = content.slice(0, start) + text + content.slice(end)
  const caret = start + text.length
  lastSelection = { start: caret, end: caret }
  await nextTick()
  autoGrowBody()
  bodyRef.value?.focus()
  bodyRef.value?.setSelectionRange(caret, caret)
}

const placeholderFor = (name: string) => (form.value.isJinjaTemplate ? `{{ ${name} }}` : `{{${name}}}`)

const nextVariableName = () => {
  const names = new Set(form.value.variables.map(variable => variable.name))
  let index = 1
  while (names.has(t('promptEditor.defaultVariableName', { index }))) index += 1
  return t('promptEditor.defaultVariableName', { index })
}

// 新建变量：输入名字后插到光标处；名字已存在就直接插入那个变量
const createVariableAtCursor = async () => {
  const alert = await alertController.create({
    header: t('promptPage.newVariable'),
    inputs: [{
      name: 'name',
      type: 'text',
      value: nextVariableName(),
      placeholder: t('promptPage.variableName'),
      attributes: { autocapitalize: 'off', autocomplete: 'off' },
    }],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('promptEditor.insert'),
        handler: (data: { name?: string }) => {
          const name = (data?.name || '').trim()
          const error = validateVariableName(name, [])
          if (error) {
            void showToast(t(error === 'required' ? 'promptEditor.variableNameRequired' : 'promptEditor.variableNameInvalid'), 'warning')
            return false
          }
          addVariable(name)
          void insertAtCursor(placeholderFor(name))
          return true
        },
      },
    ],
  })
  await alert.present()
}

const insertVariable = async () => {
  const names = [...activeVariables.value, ...unusedVariables.value].map(variable => variable.name)
  if (!names.length) {
    await createVariableAtCursor()
    return
  }
  const sheet = await actionSheetController.create({
    header: t('promptEditor.insertVariable'),
    buttons: [
      ...names.map(name => ({
        text: name,
        handler: () => { void insertAtCursor(placeholderFor(name)) },
      })),
      { text: t('promptPage.newVariable'), handler: () => { void createVariableAtCursor() } },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}

// ---------- 快速优化 ----------
const models = useMobileModels()
const optimizeConfig = ref<QuickOptimizationConfig | null>(null)
const optimizeSource = ref('')

const openQuickOptimize = async () => {
  if (!form.value.content.trim()) {
    await showToast(t('promptManagement.enterPromptContentFirst'), 'warning')
    return
  }
  let configs: QuickOptimizationConfig[] = []
  try {
    // getEnabled 在这台设备第一次读取时会写入按界面语言生成的默认动作（与桌面端共用），
    // 只用手机、从没打开过桌面端设置的用户也能直接用
    const [enabled] = await Promise.all([api.quickOptimizationConfigs.getEnabled.query(), models.load()])
    configs = enabled
  } catch (error) {
    console.error('加载快速优化配置失败:', error)
    await showToast(t('promptManagement.loadFailed'), 'danger')
    return
  }
  if (!models.selected.value) {
    await showToast(t('promptAI.noModelDescription'), 'warning')
    return
  }
  if (!configs.length) {
    await showToast(t('mobilePrompt.quickOptimizeEmpty'), 'warning')
    return
  }
  const sheet = await actionSheetController.create({
    header: t('mobilePrompt.quickOptimizeHeader', { model: models.selected.value.model }),
    buttons: [
      ...configs.map(config => ({
        text: config.name,
        handler: () => {
          optimizeSource.value = form.value.content
          optimizeConfig.value = config
        },
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}

const adoptOptimization = (proposed: string, label: string) => {
  form.value.content = proposed
  pendingChangeDescription = t('promptHistory.adoptedAI', { label })
  optimizeConfig.value = null
  void showToast(isEdit.value ? t('promptAI.adoptedSaveHint') : t('promptAI.adopted'))
}

// ---------- 描述、分类、标签 ----------
// 描述和分类、标签一样边改边生效，关掉面板时去掉首尾空白；离开页面前的未保存提醒照常起作用
const autoGrowDescription = () => {
  const element = descriptionRef.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

const focusDescription = () => {
  autoGrowDescription()
  const element = descriptionRef.value
  if (!element) return
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
}

const closeDescriptionSheet = () => {
  showDescriptionSheet.value = false
  form.value.description = form.value.description.trim()
}

const selectCategory = (categoryId: number | null) => {
  form.value.categoryId = categoryId
  showCategorySheet.value = false
}

// 过滤后的热门标签
const filteredPopularTags = computed(() => {
  const query = tagSearchText.value.trim().toLowerCase()
  if (!query) return popularTags.value
  return popularTags.value.filter(tag => tag.toLowerCase().includes(query))
})

const openTagsSheet = () => {
  showTagsModal.value = true
}

const closeTagsSheet = () => {
  showTagsModal.value = false
  tagSearchText.value = ''
}

const toggleTag = (tag: string) => {
  form.value.tags = form.value.tags.includes(tag)
    ? form.value.tags.filter(item => item !== tag)
    : [...form.value.tags, tag]
}

const addTag = (tag: string) => {
  if (!tag) return
  if (!form.value.tags.includes(tag)) form.value.tags = [...form.value.tags, tag]
  tagSearchText.value = ''
}

const removeTag = (tag: string) => {
  form.value.tags = form.value.tags.filter(item => item !== tag)
}

// ---------- 图片 ----------
const imagePreviewUrls = ref<string[]>([])

watch(() => form.value.imageBlobs, blobs => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  imagePreviewUrls.value = blobs.map(blob => URL.createObjectURL(blob))
}, { immediate: true })

const addImageBlob = (blob: Blob) => {
  if (blob.size > MAX_IMAGE_SIZE) {
    void showToast(t('promptManagement.imageTooLarge'), 'warning')
    return
  }
  form.value.imageBlobs = [...form.value.imageBlobs, blob]
}

const triggerImagePicker = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Camera.pickImages({
        quality: 90,
        limit: 10
      })
      for (const photo of result.photos) {
        if (!photo.webPath) continue
        const response = await fetch(photo.webPath)
        addImageBlob(await response.blob())
      }
    } catch (err: any) {
      // 用户取消选择时不提示错误
      if (!String(err).includes('cancel') && !String(err).includes('Cancel')) {
        showToast(t('promptManagement.imageUploadFailed'), 'danger')
      }
    }
  } else {
    fileInputRef.value?.click()
  }
}

const handleImageFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (!file.type.startsWith('image/')) continue
    addImageBlob(file)
  }
  input.value = ''
}

const removeImage = (index: number) => {
  form.value.imageBlobs = form.value.imageBlobs.filter((_, itemIndex) => itemIndex !== index)
}

// ---------- 加载与保存 ----------
const loadData = async () => {
  try {
    const [categoryList, allPrompts] = await Promise.all([
      api.categories.getAll.query(),
      api.prompts.getAllForTags.query()
    ])
    categories.value = categoryList
    popularTags.value = collectPromptTags(allPrompts).slice(0, 20).map(tag => tag.name)

    // 如果是编辑模式，加载提示词数据
    if (isEdit.value && promptId.value) {
      const prompt = await api.prompts.getById.query(promptId.value)
      if (!prompt) {
        console.error('提示词不存在，ID:', promptId.value)
        showToast(t('promptManagement.loadFailed'), 'danger')
        router.back()
        return
      }
      load(prompt)
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    showToast(t('promptManagement.loadFailed'), 'danger')
    // 如果是编辑模式且加载失败，返回上一页
    if (isEdit.value) {
      router.back()
    }
  } finally {
    loading.value = false
    await nextTick()
    autoGrowBody()
  }
}

// 保存：成功后写版本历史（新建记 v1），和桌面端一致
const handleSave = async () => {
  if (!form.value.content.trim()) {
    showToast(t('promptManagement.contentRequired'), 'warning')
    return
  }
  if (saving.value) return

  saving.value = true
  try {
    const saved = await save({
      changeDescription: pendingChangeDescription || t('promptManagement.editUpdate'),
      fallbackTitle: `${t('promptManagement.prompt')} ${new Date().toLocaleString()}`,
      createdDescription: t('promptHistory.createdVersion'),
      beforeEditDescription: t('promptHistory.beforeEdit'),
    })
    pendingChangeDescription = ''
    if (fromGeneratedDraft && saved.id) reportDraftSaved(saved.id)
    showToast(isEdit.value ? t('promptManagement.updateSuccess') : t('promptManagement.createSuccess'))
    router.back()
  } catch (error) {
    console.error('保存失败:', error)
    showToast(t('promptManagement.saveFailed'), 'danger')
  } finally {
    saving.value = false
  }
}

// 取消
const handleCancel = async () => {
  if (dirty.value) {
    const alert = await alertController.create({
      header: t('common.confirm'),
      message: t('promptManagement.unsavedChanges'),
      buttons: [
        {
          text: t('common.cancel'),
          role: 'cancel'
        },
        {
          text: t('promptManagement.discardChanges'),
          role: 'destructive',
          handler: () => {
            router.back()
          }
        }
      ]
    })
    await alert.present()
  } else {
    router.back()
  }
}

// 处理 Android 物理返回键（与屏幕取消按钮逻辑一致；打开的面板会先自行关闭）
useBackButton(10, () => {
  handleCancel()
})

// iOS 边缘右滑返回：有未保存的修改时关闭，只能走上面带确认的取消流程
useSwipeBackGuard(dirty)

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

onMounted(() => {
  // 新建时立即就绪（AI 生成页带来的草稿也在这里填入），分类和热门标签随后加载
  if (!isEdit.value) {
    const draft = takePromptDraft()
    fromGeneratedDraft = Boolean(draft)
    load(null, draft)
  }
  loadData()
})

onUnmounted(() => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
})
</script>

<style scoped>
.cancel-button {
  color: var(--content-secondary);
}

.editor {
  gap: 16px;
}

.editor-card {
  gap: 12px;
  padding: 16px 18px;
}

.editor-title {
  width: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-block);
  font-weight: 600;
}

.editor-title::placeholder {
  color: var(--content-muted);
}

/*
 * 正文编辑区：文本框背景透明，背后一层排版完全相同的文字只负责画变量色块，
 * 文字本身仍由文本框绘制，即使两层有一两像素的偏差也不影响阅读和光标。
 */
.editor-text {
  position: relative;
  min-height: 176px;
}

.editor-text__backdrop,
.editor-text__input {
  margin: 0;
  padding: 0;
  border: 0;
  font: inherit;
  font-size: var(--m-font-body);
  line-height: 1.9;
  letter-spacing: normal;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.editor-text__backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: transparent;
  pointer-events: none;
}

.editor-text__var {
  border-radius: 5px;
  background: var(--variable-bg);
  box-shadow: inset 0 0 0 1px var(--variable-border);
  color: transparent;
}

.editor-text__input {
  position: relative;
  display: block;
  width: 100%;
  min-height: 176px;
  overflow: hidden;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  resize: none;
  -webkit-appearance: none;
  appearance: none;
}

.editor-text__input::placeholder {
  color: var(--content-muted);
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.editor-chip {
  min-width: 0;
  max-width: 100%;
  height: 36px;
  padding: 0 12px;
}

.editor-chip ion-icon {
  flex: none;
  font-size: 16px;
}

.editor-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-chip--ai {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent-soft-border);
  color: var(--accent-soft-text);
}

.editor-chip .editor-chip__caret {
  margin-left: -2px;
  font-size: 12px;
}

.editor-toolbar__meta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.char-count {
  flex: none;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  white-space: nowrap;
}

.row-value {
  max-width: 150px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.picker-sheet {
  height: 100%;
}

.picker-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.picker-sheet__side {
  width: 64px;
}

.picker-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.picker-sheet__done {
  min-width: 64px;
  color: var(--accent-primary);
  font-weight: 600;
}

.picker-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.picker-sheet__body {
  gap: 16px;
  padding-top: 12px;
}

/* 描述输入框：最少五行，随内容撑高，超出面板时由面板滚动 */
.description-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 140px;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--m-radius-card);
  outline: none;
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-body);
  line-height: 1.6;
  resize: none;
  overflow: hidden;
}

.description-input:focus {
  border-color: var(--accent-primary);
}

.description-input::placeholder {
  color: var(--content-muted);
}

/* 面板本身就是白底，分组和搜索框改用细描边区分 */
.picker-sheet__group,
.picker-sheet__search {
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.check {
  color: var(--accent-primary);
  font-size: 20px;
}

.add-icon {
  color: var(--accent-primary);
  font-size: 22px;
}

.category-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 3px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.selected-tags ion-icon {
  font-size: 16px;
}

.hidden-file-input {
  display: none;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.image-item {
  position: relative;
}

.image-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  background: var(--surface-secondary);
}

.image-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 15px;
  background: var(--surface-primary);
  color: var(--accent-error);
  font-size: 24px;
  cursor: pointer;
}

.image-add {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  background: var(--surface-secondary);
  color: var(--content-tertiary);
  font-size: 28px;
  cursor: pointer;
}
</style>
