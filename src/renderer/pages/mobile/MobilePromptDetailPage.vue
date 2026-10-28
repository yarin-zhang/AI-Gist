<template>
  <ion-page class="use-page">
    <MobileNavBar fallback="/tabs/prompts">
      <template #end>
        <span v-if="prompt" class="use-nav-actions">
          <button type="button" class="m-btn-c" :class="{ 'is-favorite': prompt.isFavorite }"
            :aria-label="prompt.isFavorite ? t('promptPage.unfavorite') : t('promptPage.favorite')"
            :aria-pressed="Boolean(prompt.isFavorite)" @click="toggleFavorite">
            <ion-icon :icon="prompt.isFavorite ? star : starOutline" />
          </button>
          <button type="button" class="m-btn-c" :aria-label="t('common.edit')" @click="handleEdit">
            <ion-icon :icon="createOutline" />
          </button>
          <button type="button" class="m-btn-c" :aria-label="t('promptPage.moreActions')" @click="showActionMenu">
            <ion-icon :icon="ellipsisHorizontal" />
          </button>
        </span>
        <span v-else class="use-nav-spacer" aria-hidden="true" />
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content m-on-white use-content">
      <!-- 只有第一次加载显示转圈；从编辑页返回时原地刷新，填写进度不受影响 -->
      <div v-if="loading && !prompt" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <div v-else-if="!prompt" class="empty-container">
        <ion-icon :icon="documentTextOutline" class="empty-icon"></ion-icon>
        <p class="empty-text">{{ t('promptManagement.promptNotFound') }}</p>
      </div>

      <div v-else class="m-body use-body">
        <!-- 标题区：分类、使用次数、标签，然后是大标题和描述 -->
        <header class="use-head">
          <span class="use-pills">
            <span class="m-pill">
              <span class="use-dot" :style="{ background: categoryColor(category) }" aria-hidden="true" />
              {{ category?.name || t('promptLibrary.uncategorized') }}
            </span>
            <span class="m-pill">{{ t('promptPage.usedTimes', { count: prompt.useCount || 0 }) }}</span>
            <span v-if="prompt.isJinjaTemplate" class="m-pill m-pill-blue">Jinja</span>
            <span v-for="tag in promptTags" :key="tag" class="m-pill">#{{ tag }}</span>
          </span>
          <h1 class="m-title use-title">{{ promptDisplayTitle(prompt, t('promptLibrary.untitled'), 64) }}</h1>
          <p v-if="prompt.description" class="use-description">{{ prompt.description }}</p>
        </header>

        <!--
          提示词内容：有 {{变量名}} 挖空变量时，变量显示为可点的值标记，底部面板逐个填写
          （对应 Gitea issue #87）；普通纯文本提示词原样展示 content。
        -->
        <div v-if="variables.length" class="m-card use-card">
          <MobilePromptBody v-if="!prompt.isJinjaTemplate" :content="prompt.content" :variables="variables"
            :values="draft" mode="value" :active-name="activeVariableName" @select="selectVariable" />
          <!-- Jinja 模板由模板引擎整体渲染，显示按当前填写值生成的结果 -->
          <MobilePromptBody v-else plain :content="rendered.content" />
        </div>
        <div v-else class="m-card use-card">
          <MobilePromptBody plain :content="prompt.content" />
        </div>
        <p v-if="rendered.error" class="render-error">
          {{ t('promptWorkspace.renderFailedWithError', { error: rendered.error }) }}
        </p>

        <!-- 图片 -->
        <section v-if="imageUrls.length > 0" class="m-section">
          <span class="m-gt">{{ t('promptManagement.images') }}</span>
          <div class="images-grid">
            <button v-for="(url, index) in imageUrls" :key="index" type="button" class="image-button"
              :aria-label="t('promptPage.imageAlt', { index: index + 1 })" @click="openImagePreview(url)">
              <img :src="url" class="prompt-image" alt="" />
            </button>
          </div>
        </section>

        <p v-if="updatedLabel" class="use-updated">{{ updatedLabel }}</p>
      </div>
    </ion-content>

    <!--
      底部面板放在 ion-footer 里：始终贴在窗口底部，键盘弹出时随之上移，
      正文区域相应缩短，不需要滚到最后才能看到复制按钮（Gitea issue #63）。
    -->
    <ion-footer v-if="prompt" class="ion-no-border use-footer">
      <PromptVariableFillForm
        v-if="variables.length"
        ref="fillFormRef"
        :variables="variables"
        :content="prompt?.isJinjaTemplate ? '' : prompt?.content"
        v-model="draft"
        v-model:active="activeIndex"
        :render-error="rendered.error"
        :can-run="hasAIConfig"
        :copying="copying"
        @copy="copyContent"
        @run="openTryRun"
      />
      <div v-else class="m-sheet plain-panel">
        <button type="button" class="m-cta" :disabled="copying" @click="copyContent">
          <ion-icon :icon="copyOutline" aria-hidden="true" />
          {{ t('promptWorkspace.copyPrompt') }}
        </button>
        <button v-if="hasAIConfig" type="button" class="plain-panel__run" @click="openTryRun">
          <ion-icon :icon="playCircleOutline" aria-hidden="true" />
          {{ t('promptAI.run') }}
        </button>
      </div>
    </ion-footer>

    <MobileTryRunSheet :open="showTryRun" :prompt="tryRunText" :topic="prompt?.title || ''"
      @close="showTryRun = false" @connect="connectModel" />

    <!--
      图片全屏预览：图片在安全区内居中，右上角有关闭按钮；点任意处或向下滑动也能关闭。
      不用 ion-content：它的内部滚动区不吃外层的 flex 居中，图片会贴在顶端。
    -->
    <ion-modal :is-open="!!previewUrl" class="image-preview-modal" @didDismiss="resetImagePreview">
      <div class="preview-shell" @click="closeImagePreview" @touchstart="onPreviewTouchStart"
        @touchmove="onPreviewTouchMove" @touchend="onPreviewTouchEnd" @touchcancel="onPreviewTouchEnd">
        <div class="preview-backdrop" :style="{ opacity: previewBackdropOpacity }" aria-hidden="true" />
        <img v-if="previewUrl" :src="previewUrl" class="preview-image" :class="{ 'is-dragging': previewDragging }"
          :style="{ transform: `translateY(${previewDrag}px)` }" :alt="previewAlt" />
        <button type="button" class="preview-close" :aria-label="t('common.close')" @click.stop="closeImagePreview">
          <ion-icon :icon="close" aria-hidden="true" />
        </button>
      </div>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonFooter,
  IonIcon,
  IonSpinner,
  IonModal,
  alertController,
  actionSheetController,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  close,
  copyOutline,
  createOutline,
  documentTextOutline,
  ellipsisHorizontal,
  playCircleOutline,
  refreshOutline,
  star,
  starOutline,
  trashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { formatFriendlyDate } from '~/lib/utils/date'
import { getLastUsedValues, recordPromptUsage } from '~/lib/utils/prompt-usage'
import { getTagsArray } from '~/lib/utils/tag-colors'
import {
  getActivePromptVariables,
  createPromptDraft,
  getMissingPromptVariables,
  isEmptyPromptValue,
  normalizeVariableType,
  renderPrompt,
  type EditablePromptVariable,
} from '~/lib/utils/prompt-template'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import PromptVariableFillForm from '~/components/mobile/PromptVariableFillForm.vue'
import MobilePromptBody from '~/components/mobile/prompt/MobilePromptBody.vue'
import MobileTryRunSheet from '~/components/mobile/prompt/MobileTryRunSheet.vue'
import { categoryColor, promptDisplayTitle } from '~/components/mobile/prompt/prompt-meta'
import type { Category } from '@shared/types'
import type { PromptWithRelations } from '@shared/types/database'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const { hasAIConfig, refreshAIConfigStatus } = useAIConfigStatus()

// 状态
const prompt = ref<PromptWithRelations | null>(null)
const categories = ref<Category[]>([])
const loading = ref(true)
const copying = ref(false)
const imageUrls = ref<string[]>([])
const previewUrl = ref<string | null>(null)
const showTryRun = ref(false)
const tryRunText = ref('')
let initialLoadPromise: Promise<void> | null = null
// 上一次加载成功的提示词身份（id/uuid），用来判断 loadPrompt() 这次拿到的是否
// 还是同一个提示词——见下方 loadPrompt() 内的用法和注释。
let loadedPromptKey: string | null = null

// 挖空变量：解析规则、默认值兜底、必填校验全部直接复用桌面端同一份
// ~/lib/utils/prompt-template（desktop 端通过 @ 别名引用的也是这个文件，
// 两个别名在 vite 配置里都指向 src/renderer），保证两端解析结果一致。
const fillFormRef = ref<InstanceType<typeof PromptVariableFillForm>>()
const draft = ref<Record<string, any>>({})
const activeIndex = ref(0)
const variables = computed(() => (prompt.value ? getActivePromptVariables(prompt.value) : []))
const rendered = computed(() => (prompt.value ? renderPrompt(prompt.value, draft.value, variables.value) : { content: '' }))
const activeVariableName = computed(() => variables.value[activeIndex.value]?.name || '')

const category = computed(() => (
  prompt.value?.categoryId ? categories.value.find(item => item.id === prompt.value?.categoryId) : undefined
))
const promptTags = computed(() => getTagsArray(prompt.value?.tags))
const updatedLabel = computed(() => (
  prompt.value?.updatedAt
    ? t('promptPage.updatedAt', { date: formatFriendlyDate(prompt.value.updatedAt, locale.value, { withTime: true, capitalize: false }) })
    : ''
))

// ---------- 图片预览 ----------
// 下滑关闭：图片跟手下移、背景渐淡，松手时超过阈值就关闭，否则弹回原位
const PREVIEW_DISMISS_DISTANCE = 120
const previewDrag = ref(0)
const previewDragging = ref(false)
let previewTouchStartY: number | null = null
const previewBackdropOpacity = computed(() => 1 - Math.min(previewDrag.value / 400, 0.6))

const previewAlt = computed(() => {
  const index = previewUrl.value ? imageUrls.value.indexOf(previewUrl.value) : -1
  return index >= 0 ? t('promptPage.imageAlt', { index: index + 1 }) : ''
})

const openImagePreview = (url: string) => {
  previewDrag.value = 0
  previewUrl.value = url
}

const closeImagePreview = () => {
  previewUrl.value = null
}

const resetImagePreview = () => {
  previewUrl.value = null
  previewDrag.value = 0
  previewDragging.value = false
}

const onPreviewTouchStart = (event: TouchEvent) => {
  previewTouchStartY = event.touches.length === 1 ? event.touches[0].clientY : null
  previewDragging.value = previewTouchStartY !== null
}

const onPreviewTouchMove = (event: TouchEvent) => {
  if (previewTouchStartY === null || event.touches.length !== 1) return
  previewDrag.value = Math.max(0, event.touches[0].clientY - previewTouchStartY)
}

const onPreviewTouchEnd = () => {
  if (previewTouchStartY === null) return
  previewTouchStartY = null
  previewDragging.value = false
  if (previewDrag.value > PREVIEW_DISMISS_DISTANCE) closeImagePreview()
  else previewDrag.value = 0
}

const updateImageUrls = () => {
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageUrls.value = []
  if (prompt.value?.imageBlobs?.length) {
    imageUrls.value = prompt.value.imageBlobs
      .filter((blob: Blob) => blob instanceof Blob && blob.size > 0)
      .map((blob: Blob) => URL.createObjectURL(blob))
  }
}

/**
 * 打开提示词时预填上一次复制时的值；类型对不上（比如选项已被删掉）的值丢弃，
 * 交给 createPromptDraft 用默认值兜底。
 */
const pickLastUsedValues = (promptId: number | undefined, list: EditablePromptVariable[]) => {
  if (!promptId) return {}
  const last = getLastUsedValues(promptId)
  const picked: Record<string, any> = {}
  list.forEach(variable => {
    const value = last[variable.name]
    if (isEmptyPromptValue(value)) return
    const kind = normalizeVariableType(String(variable.type))
    if (kind === 'boolean' && typeof value !== 'boolean') return
    if (kind === 'select' && variable.options?.length && !variable.options.includes(value)) return
    picked[variable.name] = value
  })
  return picked
}

/** 从第一个还没填的必填变量开始；都填好了就停在第一个 */
const firstOpenIndex = () => {
  const missing = getMissingPromptVariables(variables.value, draft.value)
  const index = missing.length ? variables.value.findIndex(variable => variable.name === missing[0]) : 0
  return Math.max(index, 0)
}

// 加载提示词详情
//
// onIonViewWillEnter（见下方）会在这个页面每次重新变为激活状态时都调用一次
// loadPrompt()，最典型的场景是：用户从这个使用页点进"编辑"看一眼，再返回。
// 这不是一次身份变化的导航——仍然是同一个提示词——如果每次都无条件重置
// draft.value，会静默清空用户尚未提交的填写进度（对应 Gitea #87 复查发现的数据丢失 bug）。
//
// 这里手动记录上一次加载成功的身份 key，本次加载完成后比较：身份不同才重置 draft 和校验
// 状态；身份相同（同一个提示词）就保留 draft.value 原样，不覆盖。
const loadPrompt = async () => {
  loading.value = true
  try {
    const promptId = parseInt(route.params.id as string, 10)
    if (isNaN(promptId)) {
      throw new Error('Invalid prompt ID')
    }
    prompt.value = await api.prompts.getById.query(promptId)
    const promptKey = prompt.value ? `${prompt.value.id ?? ''}:${prompt.value.uuid ?? ''}` : null
    if (promptKey !== loadedPromptKey) {
      draft.value = createPromptDraft(variables.value, pickLastUsedValues(prompt.value?.id, variables.value))
      fillFormRef.value?.resetValidation()
      loadedPromptKey = promptKey
      activeIndex.value = firstOpenIndex()
    } else {
      // 同一个提示词在编辑页增减了变量：保留已填的值，只给新变量补默认值
      draft.value = createPromptDraft(variables.value, draft.value)
      activeIndex.value = Math.min(activeIndex.value, Math.max(variables.value.length - 1, 0))
    }
    updateImageUrls()
  } catch (error) {
    console.error('加载提示词失败:', error)
    showToast(t('promptManagement.loadFailed'), 'danger')
  } finally {
    loading.value = false
  }
}

// 加载分类
const loadCategories = async () => {
  try {
    categories.value = await api.categories.getAll.query()
  } catch (error) {
    console.error('加载分类失败:', error)
  }
}

const selectVariable = (name: string) => {
  fillFormRef.value?.focusVariable(name)
}

// 切换收藏：只写收藏字段，不动变量和正文
const toggleFavorite = async () => {
  if (!prompt.value?.id) return
  const next = !prompt.value.isFavorite

  try {
    await api.prompts.update.mutate({
      id: prompt.value.id,
      data: { isFavorite: next }
    })
    prompt.value.isFavorite = next
    showToast(
      next
        ? t('promptManagement.detailModal.favoriteSuccess')
        : t('promptManagement.detailModal.cancelFavoriteSuccess')
    )
  } catch (error) {
    console.error('切换收藏失败:', error)
    showToast(t('promptManagement.saveFailed'), 'danger')
  }
}

// 复制内容
//
// 有挖空变量时，复制的是替换过变量的最终文本（rendered.content），而不是原始
// 模板；必填变量没填完（或 Jinja 模板渲染失败）时中止复制——这与桌面端
// 复制前先校验、校验不通过只定位到第一个问题字段的约定一致。
// 没有变量的普通提示词完全保持原有行为（原样复制 content）。
const copyContent = async () => {
  if (!prompt.value?.content || copying.value) return

  const hasVariables = variables.value.length > 0
  if (hasVariables) {
    const valid = await fillFormRef.value?.validateAndFocus()
    if (!valid || rendered.value.error) {
      showToast(t(rendered.value.error ? 'promptWorkspace.renderFailed' : 'promptWorkspace.completeRequired'), 'warning')
      return
    }
  }

  const finalContent = hasVariables ? rendered.value.content : prompt.value.content

  copying.value = true
  try {
    await navigator.clipboard.writeText(finalContent)
    let recorded = false
    try {
      // 记录这次使用：填写值会在下次打开时预填，使用次数加一
      const updated = await recordPromptUsage({
        promptId: prompt.value.id!,
        content: finalContent,
        variables: hasVariables ? { ...draft.value } : undefined,
        incrementUseCount: id => api.prompts.incrementUseCount.mutate(id),
      })
      prompt.value.useCount = updated.useCount
      recorded = true
    } catch (usageError) {
      console.warn('更新提示词使用次数失败:', usageError)
    }
    showToast(recorded ? t('promptPage.copiedAndRecorded') : t('promptManagement.detailModal.copySuccess'))
  } catch (error) {
    console.error('复制失败:', error)
    showToast(t('promptManagement.detailModal.copyFailed'), 'danger')
  } finally {
    copying.value = false
  }
}

// 试运行：与复制一样先确认必填变量都已填写
const openTryRun = async () => {
  if (!prompt.value) return
  if (variables.value.length) {
    const valid = await fillFormRef.value?.validateAndFocus()
    if (!valid || rendered.value.error) {
      showToast(t(rendered.value.error ? 'promptWorkspace.renderFailed' : 'promptWorkspace.completeRequired'), 'warning')
      return
    }
  }
  tryRunText.value = variables.value.length ? rendered.value.content : prompt.value.content
  showTryRun.value = true
}

const connectModel = () => {
  showTryRun.value = false
  router.push('/ai-config/create')
}

const copyRawTemplate = async () => {
  if (!prompt.value) return
  try {
    await navigator.clipboard.writeText(prompt.value.content)
    showToast(t('mobilePrompt.rawTemplateCopied'))
  } catch {
    showToast(t('promptManagement.detailModal.copyFailed'), 'danger')
  }
}

// 清空填写值：回到各变量的默认值
const resetValues = () => {
  draft.value = createPromptDraft(variables.value, {})
  fillFormRef.value?.resetValidation()
  activeIndex.value = 0
}

// 显示操作菜单
const showActionMenu = async () => {
  if (!prompt.value) return
  const hasVariables = variables.value.length > 0

  const actionSheet = await actionSheetController.create({
    header: promptDisplayTitle(prompt.value, t('promptLibrary.untitled')),
    buttons: [
      ...(hasVariables
        ? [
          { text: t('promptPage.copyRaw'), icon: copyOutline, handler: () => { void copyRawTemplate() } },
          { text: t('mobilePrompt.resetValues'), icon: refreshOutline, handler: resetValues },
        ]
        : []),
      {
        text: t('common.delete'),
        icon: trashOutline,
        role: 'destructive',
        handler: () => {
          handleDelete()
        }
      },
      {
        text: t('common.cancel'),
        role: 'cancel'
      }
    ]
  })

  await actionSheet.present()
}

// 编辑
const handleEdit = () => {
  if (!prompt.value) return
  router.push(`/prompt/edit/${prompt.value.id}`)
}

// 删除
const handleDelete = async () => {
  if (!prompt.value) return

  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('promptManagement.confirmDeletePrompt', { title: prompt.value.title }),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: async () => {
          try {
            await api.prompts.delete.mutate(prompt.value!.id!)
            showToast(t('promptManagement.deleteSuccess'))
            router.back()
          } catch (error) {
            console.error('删除提示词失败:', error)
            showToast(t('promptManagement.deleteFailed'), 'danger')
          }
        }
      }
    ]
  })

  await alert.present()
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 初始化
onMounted(async () => {
  initialLoadPromise = Promise.all([
    loadCategories(),
    loadPrompt(),
    refreshAIConfigStatus()
  ]).then(() => undefined)
  await initialLoadPromise
  initialLoadPromise = null
})

// 每次页面进入（含从编辑页返回）都重新加载，保证数据实时
onIonViewWillEnter(async () => {
  if (initialLoadPromise) {
    await initialLoadPromise
    return
  }
  await Promise.all([loadPrompt(), loadCategories(), refreshAIConfigStatus()])
})

onUnmounted(() => {
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
})
</script>

<style scoped>
/* 使用页是白底（V5-M-Use），导航栏跟着用同一底色 */
.use-page .m-header {
  background: color-mix(in srgb, var(--surface-primary) 88%, transparent);
}

/* 写成两个类，压过全局 .m-page-content 的灰底 */
.m-page-content.use-content {
  --background: var(--surface-primary);
}

.use-nav-actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.use-nav-spacer {
  width: 40px;
  flex: none;
}

.use-nav-actions .is-favorite {
  color: var(--accent-favorite);
}

.use-body {
  gap: 16px;
  padding-top: 12px;
}

.use-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.use-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.use-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
}

.use-title {
  overflow-wrap: anywhere;
}

.use-description {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

.use-card {
  padding: 16px 18px;
}

.render-error {
  margin: 0;
  color: var(--accent-error);
  font-size: var(--m-font-sub);
  line-height: 1.5;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-button {
  padding: 0;
  border: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface-secondary);
  cursor: pointer;
}

.prompt-image {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.use-updated {
  margin: 0;
  padding: 0 2px;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.use-footer {
  background: transparent;
}

.plain-panel {
  gap: 4px;
  padding: 16px var(--m-gutter) calc(env(safe-area-inset-bottom, 0px) + 12px);
  box-shadow: var(--shadow-floating);
}

.plain-panel__run {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.empty-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  color: var(--content-tertiary);
  font-size: 48px;
}

.empty-text {
  color: var(--content-secondary);
}

/* 平板上模态默认是居中的小窗，预览图始终铺满整屏 */
ion-modal.image-preview-modal {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: transparent;
}

/* 上下留出同样的空间，图片在安全区内垂直居中，也不会压到右上角的关闭按钮 */
.preview-shell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding:
    calc(max(env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + 64px)
    var(--m-gutter, 16px);
  overflow: hidden;
  touch-action: none;
}

.preview-backdrop {
  position: absolute;
  inset: 0;
  background: var(--overlay-preview);
}

.preview-image {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-image, 8px);
  transition: transform 0.2s ease;
}

.preview-image.is-dragging {
  transition: none;
}

.preview-close {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 22px;
  background: color-mix(in srgb, var(--content-inverse) 18%, transparent);
  color: var(--content-inverse);
  font-size: 24px;
  cursor: pointer;
}
</style>
