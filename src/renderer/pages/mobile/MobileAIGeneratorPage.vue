<template>
  <ion-page>
    <MobileNavBar :title="t('promptManagement.aiGenerate')" leading="close" @leading="handleCancel">
      <template #end>
        <button type="button" class="m-btn-c" :aria-label="t('promptGenerate.history')" @click="openHistory">
          <ion-icon :icon="timeOutline" />
        </button>
      </template>
    </MobileNavBar>

    <ion-content ref="contentRef" class="m-page-content">
      <!-- 只有第一次加载显示转圈；从别的页面返回时静默刷新，不打断对话 -->
      <div v-if="models.loading.value && !models.configs.value.length" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 没有AI配置时显示的空状态 -->
      <div v-else-if="models.configs.value.length === 0" class="empty-container">
        <EmptyAIConfigIllustration />
        <p class="empty-text">{{ t('aiGenerator.noConfigAvailable') }}</p>
        <p class="empty-description">{{ t('aiGenerator.addConfigFirst') }}</p>
        <button type="button" class="m-cta empty-action" @click="navigateToAIConfig">
          {{ t('aiGenerator.addAIConfig') }}
        </button>
      </div>

      <!-- 还没开始：说明、示例和自动保存开关 -->
      <div v-else-if="turns.length === 0" class="m-body gen-body">
        <div class="m-card gen-intro">
          <span class="m-tile m-tile-lg m-tile--soft" aria-hidden="true"><ion-icon :icon="sparkles" /></span>
          <p class="gen-intro__text">{{ t('promptGenerate.intro') }}</p>
        </div>

        <section class="m-section">
          <span class="m-gt">{{ t('promptGenerate.tryLabel') }}</span>
          <div class="m-group">
            <button v-for="example in examples" :key="example.label" type="button" class="m-row" @click="useExample(example.text)">
              <span class="two">
                <span>{{ example.label }}</span>
                <span class="sub gen-example__text">{{ example.text }}</span>
              </span>
              <span class="end"><ion-icon :icon="arrowUpCircleOutline" class="gen-example__icon" aria-hidden="true" /></span>
            </button>
          </div>
        </section>

        <section class="m-section">
          <div class="m-group ic">
            <div class="m-row m-row--static">
              <span class="m-tile m-tile--green" aria-hidden="true"><ion-icon :icon="saveOutline" /></span>
              <span class="title">{{ t('promptGenerate.autoSave') }}</span>
              <span class="end">
                <ion-toggle :checked="autoSaveEnabled" :aria-label="t('promptGenerate.autoSave')"
                  @ionChange="setAutoSave($event.detail.checked)" />
              </span>
            </div>
          </div>
          <p class="m-note gen-note">{{ t('aiGenerator.autoSaveHint') }}</p>
        </section>
      </div>

      <!-- 对话：每一轮是一条需求气泡 + 生成的提示词卡片 -->
      <div v-else class="m-body gen-body" aria-live="polite">
        <template v-for="turn in turns" :key="turn.id">
          <div class="gen-bubble">{{ turn.request }}</div>

          <!-- 每轮结果上方一行灰色小字：进行中、失败、停止，或识别到几个变量 -->
          <span class="gen-status" :class="{ 'gen-status--error': turn.status === 'error' }">
            <ion-spinner v-if="turn.status === 'streaming'" name="dots" aria-hidden="true" />
            <template v-if="turn.status === 'streaming'">{{ t('aiGenerator.generating') }}</template>
            <template v-else-if="turn.status === 'error'">{{ t('aiGenerator.generateFailed') }}</template>
            <template v-else-if="turn.status === 'stopped'">{{ t('aiGenerator.stopped') }}</template>
            <template v-else-if="variableCountOf(turn)">
              {{ t('mobilePrompt.variablesDetected', { count: variableCountOf(turn) }) }}
            </template>
            <template v-else>{{ t('promptGenerate.succeeded') }}</template>
          </span>

          <!-- 失败或还没出内容就停下的一轮：说明原因，最后一轮可以直接重试 -->
          <div v-if="turn.status === 'error' || (turn.status === 'stopped' && !turn.content)" class="m-card gen-card">
            <MobileAIErrorNote v-if="turn.status === 'error' && turn.error" :error="turn.error" />
            <div v-if="turn === lastTurn && !busy" class="gen-card__actions">
              <button type="button" class="m-cta m-cta-2 gen-card__button" @click="retryTurn(turn)">
                <ion-icon :icon="refreshOutline" aria-hidden="true" />
                {{ t('common.retry') }}
              </button>
            </div>
          </div>
          <div v-else-if="turn.content" class="m-card gen-card" :class="{ 'gen-card--old': turn !== latestResult && turn.status !== 'streaming' }">
            <span class="gen-card__title">
              <template v-if="titleFor(turn)">{{ titleFor(turn) }}</template>
              <span v-else class="gen-card__title-pending">{{ t('promptWorkspace.aiSummarizing') }}</span>
            </span>
            <MobilePromptBody :content="turn.content" mode="name" />

            <div v-if="turn === latestResult" class="gen-card__actions">
              <template v-if="isSaved(turn)">
                <button type="button" class="m-cta m-cta-2 gen-card__button" @click="editSaved">
                  <ion-icon :icon="createOutline" aria-hidden="true" />
                  {{ t('common.edit') }}
                </button>
                <button type="button" class="m-cta gen-card__button" @click="finishAndReturnToPrompts">
                  <ion-icon :icon="checkmark" aria-hidden="true" />
                  {{ t('mobilePrompt.done') }}
                </button>
              </template>
              <template v-else>
                <button type="button" class="m-cta m-cta-2 gen-card__button" :disabled="saving" @click="editBeforeSave(turn)">
                  {{ t('mobilePrompt.editThenSave') }}
                </button>
                <button type="button" class="m-cta gen-card__button" :disabled="saving" @click="savePrompt(turn)">
                  {{ t('mobilePrompt.saveToLibrary') }}
                </button>
              </template>
            </div>
          </div>
        </template>
      </div>
    </ion-content>

    <!-- 输入框：第一次描述需求，之后用来继续调整当前结果 -->
    <ion-footer v-if="models.configs.value.length" class="ion-no-border gen-footer">
      <div class="composer">
        <textarea ref="composerRef" v-model="composer" class="composer__input" rows="1"
          :placeholder="latestResult ? t('mobilePrompt.refineLabel') : t('aiGenerator.requirementPlaceholder')"
          :aria-label="latestResult ? t('mobilePrompt.refineLabel') : t('aiGenerator.requirement')"
          @input="autoGrowComposer"></textarea>
        <div class="composer__bar">
          <button type="button" class="m-chip composer__model" :disabled="busy" @click="showModelPicker = true">
            <ion-icon :icon="sparklesOutline" aria-hidden="true" />
            <span class="composer__model-name">{{ models.selectedLabel.value || t('aiGenerator.selectModel') }}</span>
            <ion-icon :icon="chevronDown" aria-hidden="true" />
          </button>
          <button v-if="busy" type="button" class="composer__send" :aria-label="t('aiGenerator.stop')" @click="stopGeneration">
            <ion-icon :icon="stop" />
          </button>
          <button v-else type="button" class="composer__send" :disabled="!composer.trim() || !models.selected.value"
            :aria-label="latestResult ? t('promptAI.send') : t('aiGenerator.generate')" @click="send">
            <ion-icon :icon="arrowUp" />
          </button>
        </div>
      </div>
    </ion-footer>

    <MobileModelSheet :open="showModelPicker" :configs="models.configs.value" :selected-key="models.selectedKey.value"
      @select="selectModel" @close="showModelPicker = false" />

    <!-- 生成记录 -->
    <ion-modal class="m-sheet-modal" :is-open="showHistory" :breakpoints="[0, 0.75, 1]" :initial-breakpoint="0.75"
      :handle="false" :expand-to-scroll="false" @didDismiss="showHistory = false">
      <div class="m-sheet history-sheet">
        <div class="m-grab" aria-hidden="true" />
        <header class="history-sheet__head">
          <span class="history-sheet__side" aria-hidden="true" />
          <h2 class="history-sheet__title">{{ t('promptGenerate.history') }}</h2>
          <button type="button" class="m-btn history-sheet__close" @click="showHistory = false">{{ t('common.close') }}</button>
        </header>
        <ion-content class="history-sheet__content">
          <div class="m-body history-sheet__body">
            <div class="m-group history-sheet__group">
              <button type="button" class="m-row" :disabled="busy" @click="startNewConversation">
                <ion-icon :icon="addCircleOutline" class="history-sheet__new" aria-hidden="true" />
                <span class="title">{{ t('mobilePrompt.newConversation') }}</span>
              </button>
            </div>

            <div v-if="historyLoading" class="loading-container">
              <ion-spinner></ion-spinner>
            </div>
            <p v-else-if="!history.length" class="m-note">{{ t('aiGenerator.noHistory') }}</p>
            <div v-else class="m-group history-sheet__group">
              <button v-for="item in history" :key="item.id ?? item.historyId" type="button" class="m-row" :disabled="busy"
                @click="useHistory(item)">
                <span class="two">
                  <span class="history-sheet__topic">{{ item.topic }}</span>
                  <span class="sub">{{ historyMeta(item) }}</span>
                </span>
                <span v-if="item.status !== 'success'" class="end"><span class="m-pill m-pill-err">{{ t('aiGenerator.error') }}</span></span>
              </button>
            </div>
          </div>
        </ion-content>
      </div>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonFooter,
  IonIcon,
  IonModal,
  IonSpinner,
  IonToggle,
  alertController,
  onIonViewWillEnter,
  useBackButton
} from '@ionic/vue'
import {
  addCircleOutline,
  arrowUp,
  arrowUpCircleOutline,
  checkmark,
  chevronDown,
  createOutline,
  refreshOutline,
  saveOutline,
  sparkles,
  sparklesOutline,
  stop,
  timeOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { Category } from '@shared/types'
import type { AIGenerationHistory } from '@shared/types/ai'
import { AIGeneratorService } from '~/lib/services/mobile-ai-generator.service'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { formatFriendlyDate } from '~/lib/utils/date'
import { buildAISummaryPrompt, parseAISummaryResponse, type AISummaryResult } from '~/lib/utils/ai-summary'
import { parsePromptTemplate } from '~/lib/utils/prompt-template'
import EmptyAIConfigIllustration from '~/components/mobile/illustrations/EmptyAIConfigIllustration.vue'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobilePromptBody from '~/components/mobile/prompt/MobilePromptBody.vue'
import MobileModelSheet from '~/components/mobile/prompt/MobileModelSheet.vue'
import MobileAIErrorNote from '~/components/mobile/prompt/MobileAIErrorNote.vue'
import { useMobileModels } from '~/components/mobile/prompt/useMobileModels'
import { describeMobileAIError, isAbortError, runMobileChat, type MobileAIErrorView } from '~/components/mobile/prompt/mobile-ai'
import { offerPromptDraft, takeSavedDraftId } from '~/components/mobile/prompt/prompt-draft-handoff'
import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'

interface GenerationTurn {
  id: number
  /** generate：按需求生成；refine：在上一版基础上继续调整 */
  kind: 'generate' | 'refine'
  request: string
  content: string
  status: 'streaming' | 'done' | 'error' | 'stopped'
  error?: MobileAIErrorView
}

const AUTO_SAVE_KEY = 'prompt_generation_auto_save'

const { t, locale } = useI18n()
const router = useRouter()
const models = useMobileModels()

const contentRef = ref<any>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const turns = ref<GenerationTurn[]>([])
const composer = ref('')
const busy = ref(false)
const saving = ref(false)
const categories = ref<Category[]>([])
// 整段对话共用的标题和描述：第一次生成后由 AI 总结
const summary = ref<AISummaryResult | null>(null)
const summarizing = ref(false)
// 这段对话已经存进提示词库的那条提示词，以及存进去时的正文
const savedPromptId = ref<number | null>(null)
const savedContent = ref('')
const showModelPicker = ref(false)
const showHistory = ref(false)
const history = ref<AIGenerationHistory[]>([])
const historyLoading = ref(false)
let nextTurnId = 1
// 生成服务不支持中断：停止时换一个令牌，丢弃之后到达的内容
let requestToken = 0
let controller: AbortController | null = null

const readAutoSave = () => {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== 'false'
  } catch {
    return true
  }
}
const autoSaveEnabled = ref(readAutoSave())

const setAutoSave = (value: boolean) => {
  autoSaveEnabled.value = value
  try {
    localStorage.setItem(AUTO_SAVE_KEY, String(value))
  } catch {
    // 本机存储不可用时只影响下次打开的默认值
  }
}

const examples = computed(() => [
  { label: t('promptGenerate.exampleReviewLabel'), text: t('promptGenerate.exampleReviewText') },
  { label: t('promptGenerate.exampleInterviewLabel'), text: t('promptGenerate.exampleInterviewText') },
  { label: t('promptGenerate.exampleRequirementLabel'), text: t('promptGenerate.exampleRequirementText') },
])

/** 最新一条生成成功的结果：继续调整和保存都针对它 */
const latestResult = computed(() => {
  for (let index = turns.value.length - 1; index >= 0; index -= 1) {
    const turn = turns.value[index]
    if (turn.status === 'done' && turn.content.trim()) return turn
  }
  return null
})

const firstRequest = computed(() => turns.value.find(turn => turn.kind === 'generate')?.request || '')

const lastTurn = computed(() => turns.value[turns.value.length - 1])

const variableCountOf = (turn: GenerationTurn) => parsePromptTemplate(turn.content).variableNames.length

const titleFor = (turn: GenerationTurn) => {
  if (summary.value?.title) return summary.value.title
  if (summarizing.value || turn.status === 'streaming') return ''
  return t('aiGenerator.generatedPromptTitle', { topic: firstRequest.value || t('aiGenerator.generatedPromptFallbackTopic') })
}

const isSaved = (turn: GenerationTurn) => Boolean(savedPromptId.value) && savedContent.value === turn.content

const historyMeta = (item: AIGenerationHistory) => {
  const date = item.createdAt ? formatFriendlyDate(item.createdAt, locale.value, { withTime: true }) : ''
  return [date, item.model].filter(Boolean).join(' · ')
}

/** 不是服务商报错、只有一句说明的失败（没有生成内容等） */
const plainError = (summary: string): MobileAIErrorView => ({ kind: 'generic', summary, detail: '' })

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const scrollToBottom = async () => {
  await nextTick()
  await contentRef.value?.$el?.scrollToBottom?.(300)
}

const autoGrowComposer = () => {
  const element = composerRef.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 140)}px`
}

const resetComposer = async () => {
  composer.value = ''
  await nextTick()
  autoGrowComposer()
}

// 请求失败时把需求放回输入框（用户还没开始输入别的内容时），改一改就能再发
const restoreComposer = async (text: string) => {
  if (composer.value.trim()) return
  composer.value = text
  await nextTick()
  autoGrowComposer()
}

const useExample = async (text: string) => {
  composer.value = text
  await nextTick()
  autoGrowComposer()
  composerRef.value?.focus()
}

const pushTurn = (turn: Omit<GenerationTurn, 'id'>) => {
  turns.value = [...turns.value, { ...turn, id: nextTurnId++ }]
  return turns.value[turns.value.length - 1]
}

const patchTurn = (id: number, changes: Partial<GenerationTurn>) => {
  turns.value = turns.value.map(turn => (turn.id === id ? { ...turn, ...changes } : turn))
}

const turnById = (id: number) => turns.value.find(turn => turn.id === id)

// 让模型给生成结果起标题、写描述，并从现有分类里挑一个；失败时用「AI生成: 需求」兜底
const summarize = async (content: string) => {
  const selected = models.selected.value
  if (!selected) return
  summarizing.value = true
  try {
    const raw = await runMobileChat({
      config: selected.config,
      model: selected.model,
      messages: [{ role: 'user', content: buildAISummaryPrompt(content, categories.value.map(category => category.name)) }],
    })
    summary.value = parseAISummaryResponse(raw)
  } catch (error) {
    console.warn('生成标题和描述失败:', error)
  } finally {
    summarizing.value = false
  }
}

// 按需求生成提示词：沿用移动端一直使用的 AIGeneratorService（会套用配置里的系统提示词）
const generate = async (topic: string) => {
  const selected = models.selected.value
  if (!selected) return
  const token = ++requestToken
  const turn = pushTurn({ kind: 'generate', request: topic, content: '', status: 'streaming' })
  summary.value = null
  savedPromptId.value = null
  savedContent.value = ''
  busy.value = true
  void scrollToBottom()

  try {
    const result = await AIGeneratorService.generatePrompt(
      { configId: selected.config.configId, model: selected.model, topic },
      selected.config,
      (content: string) => {
        // 流式更新生成结果
        if (token === requestToken) patchTurn(turn.id, { content })
      }
    )
    if (token !== requestToken) return
    patchTurn(turn.id, { content: result.generatedPrompt, status: result.generatedPrompt.trim() ? 'done' : 'error', error: result.generatedPrompt.trim() ? undefined : plainError(t('aiGenerator.noContentToSave')) })

    // 保存到历史记录
    await api.aiGenerationHistory.create.mutate({
      historyId: result.id,
      configId: result.configId,
      topic: result.topic,
      generatedPrompt: result.generatedPrompt,
      model: result.model,
      status: 'success',
      uuid: `history_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    }).catch(error => console.error('保存生成记录失败:', error))

    if (!result.generatedPrompt.trim()) return
    await summarize(result.generatedPrompt)
    await afterResult(turn.id)
  } catch (error) {
    if (token !== requestToken) return
    console.error('生成失败:', error)
    patchTurn(turn.id, { status: 'error', error: describeMobileAIError(error, t) })
    void restoreComposer(topic)
    showToast(t('aiGenerator.generateFailed'), 'danger')
  } finally {
    if (token === requestToken) busy.value = false
    void scrollToBottom()
  }
}

// 继续调整：把当前结果和这次的要求一起发给模型，返回改进后的完整提示词
const refine = async (instruction: string, base: string) => {
  const selected = models.selected.value
  if (!selected) return
  const token = ++requestToken
  const turn = pushTurn({ kind: 'refine', request: instruction, content: '', status: 'streaming' })
  controller = new AbortController()
  busy.value = true
  void scrollToBottom()

  try {
    const prompt = [
      t('promptManagement.adjustPromptInstruction'),
      '',
      t('promptManagement.originalPrompt'),
      base,
      '',
      t('promptManagement.adjustmentInstruction'),
      instruction,
      '',
      t('promptManagement.outputImprovedPrompt'),
    ].join('\n')
    const result = await runMobileChat({
      config: selected.config,
      model: selected.model,
      messages: [{ role: 'user', content: prompt }],
      onPartial: content => { if (token === requestToken) patchTurn(turn.id, { content }) },
      signal: controller.signal,
    })
    if (token !== requestToken) return
    const content = (result || turnById(turn.id)?.content || '').trim()
    if (!content) {
      patchTurn(turn.id, { status: 'error', error: plainError(t('promptAI.emptySuggestion')) })
      return
    }
    patchTurn(turn.id, { content, status: 'done' })
    await afterResult(turn.id)
  } catch (error) {
    if (token !== requestToken) return
    if (isAbortError(error)) {
      patchTurn(turn.id, { status: 'stopped' })
    } else {
      patchTurn(turn.id, { status: 'error', error: describeMobileAIError(error, t) })
      void restoreComposer(instruction)
    }
  } finally {
    if (token === requestToken) busy.value = false
    controller = null
    void scrollToBottom()
  }
}

// 打开了自动保存时，每一版结果都直接写进提示词库（同一段对话只占一条提示词）
const afterResult = async (turnId: number) => {
  const turn = turnById(turnId)
  if (!turn || !autoSaveEnabled.value) {
    showToast(t('aiGenerator.generateSuccess'))
    return
  }
  try {
    await persist(turn)
    showToast(t('aiGenerator.generateAndSaveSuccess'))
  } catch (error) {
    console.error('保存提示词失败:', error)
    showToast(`${t('aiGenerator.saveFailed')}: ${errorText(error)}`, 'danger')
  }
}

const send = async () => {
  const text = composer.value.trim()
  if (!text || busy.value) return
  if (!models.selected.value) {
    showToast(t('promptWorkspace.selectModelFirst'), 'warning')
    return
  }
  const base = latestResult.value?.content
  await resetComposer()
  composerRef.value?.blur()
  if (base) await refine(text, base)
  else await generate(text)
}

// 重试失败或停下的最后一轮：换成新的一轮重新请求，对话里不留两条同样的需求
const retryTurn = async (turn: GenerationTurn) => {
  if (busy.value) return
  if (!models.selected.value) {
    showToast(t('promptWorkspace.selectModelFirst'), 'warning')
    return
  }
  turns.value = turns.value.filter(item => item.id !== turn.id)
  if (composer.value.trim() === turn.request.trim()) await resetComposer()
  const base = turn.kind === 'refine' ? latestResult.value?.content : undefined
  if (base) await refine(turn.request, base)
  else await generate(turn.request)
}

const stopGeneration = () => {
  requestToken += 1
  controller?.abort()
  const streaming = turns.value.find(turn => turn.status === 'streaming')
  if (streaming) patchTurn(streaming.id, { status: streaming.content.trim() ? 'done' : 'stopped' })
  busy.value = false
}

const selectModel = (key: string) => {
  models.select(key)
  showModelPicker.value = false
}

// ---------- 保存 ----------
const buildPromptData = (turn: GenerationTurn) => {
  const category = summary.value?.category
    ? categories.value.find(item => item.name === summary.value?.category)
    : undefined
  return {
    title: summary.value?.title || t('aiGenerator.generatedPromptTitle', {
      topic: firstRequest.value || t('aiGenerator.generatedPromptFallbackTopic')
    }),
    content: turn.content,
    description: summary.value?.description || '',
    tags: [t('aiGenerator.generatedPromptTag')],
    categoryId: category?.id,
  }
}

const persist = async (turn: GenerationTurn) => {
  if (savedPromptId.value) {
    // 已经存过：只更新正文，不覆盖用户在别处改过的标题和分类
    await api.prompts.update.mutate({ id: savedPromptId.value, data: { content: turn.content } })
  } else {
    const created = await api.prompts.create.mutate({
      ...buildPromptData(turn),
      isFavorite: false,
      useCount: 0,
      uuid: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      isActive: true
    })
    savedPromptId.value = created.id ?? null
  }
  savedContent.value = turn.content
}

// 手动保存提示词：和自动保存一样留在对话里，卡片换成「编辑 / 完成」；
// 之后继续调整再保存，更新的还是同一条提示词
const savePrompt = async (turn: GenerationTurn) => {
  if (!turn.content.trim()) {
    showToast(t('aiGenerator.noContentToSave'), 'warning')
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    await persist(turn)
    showToast(t('aiGenerator.saveSuccess'))
  } catch (error) {
    console.error('保存提示词失败:', error)
    showToast(`${t('aiGenerator.saveFailed')}: ${errorText(error)}`, 'danger')
  } finally {
    saving.value = false
  }
}

// 编辑后保存：把结果交给新建页，在那里补标题、分类、变量设置后再保存
const editBeforeSave = (turn: GenerationTurn) => {
  const data = buildPromptData(turn)
  offerPromptDraft({ ...data, categoryId: data.categoryId ?? null })
  router.push('/prompt/create')
}

const editSaved = () => {
  if (savedPromptId.value) router.push(`/prompt/edit/${savedPromptId.value}`)
}

// 返回提示词列表：生成页总是从列表进入，退一步即可
const finishAndReturnToPrompts = () => {
  if (window.history.length > 1) router.back()
  else router.replace('/tabs/prompts')
}

// 导航到"添加 AI 配置"表单：直接复用 AI 配置 Tab 自身"新增"按钮的跳转方式
// （router.push('/ai-config/create')），不再先跳到 AI 配置 Tab 列表页再让用户多点一次"新增"（Gitea issue #61）。
const navigateToAIConfig = () => {
  router.push('/ai-config/create')
}

// ---------- 生成记录 ----------
const loadHistory = async () => {
  historyLoading.value = true
  try {
    const result = await api.aiGenerationHistory.getPaginated.query({ page: 1, limit: 40 })
    // 试运行也写在生成记录表里，这里只列真正的「生成提示词」
    history.value = result.data.filter(item => !String(item.historyId || '').startsWith('use_'))
  } catch (error) {
    console.error('加载生成记录失败:', error)
    history.value = []
  } finally {
    historyLoading.value = false
  }
}

const openHistory = () => {
  showHistory.value = true
  void loadHistory()
}

const confirmDiscard = async (): Promise<boolean> => {
  if (!hasUnsavedResult()) return true
  return new Promise(resolve => {
    void alertController.create({
      header: t('common.confirm'),
      message: t('promptManagement.unsavedChanges'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel', handler: () => resolve(false) },
        { text: t('promptManagement.discardChanges'), role: 'destructive', handler: () => resolve(true) }
      ]
    }).then(alert => alert.present())
  })
}

const resetConversation = () => {
  requestToken += 1
  controller?.abort()
  turns.value = []
  summary.value = null
  savedPromptId.value = null
  savedContent.value = ''
  busy.value = false
}

const startNewConversation = async () => {
  if (!(await confirmDiscard())) return
  resetConversation()
  showHistory.value = false
}

const useHistory = async (item: AIGenerationHistory) => {
  if (!(await confirmDiscard())) return
  resetConversation()
  const success = item.status === 'success' && Boolean(item.generatedPrompt?.trim())
  pushTurn({
    kind: 'generate',
    request: item.topic,
    content: item.generatedPrompt || '',
    status: success ? 'done' : 'error',
    error: success ? undefined : (item.errorMessage ? describeMobileAIError(item.errorMessage, t) : plainError(t('aiGenerator.generateFailed'))),
  })
  showHistory.value = false
  if (success) void summarize(item.generatedPrompt)
}

// ---------- 离开 ----------
const hasUnsavedResult = () => {
  const latest = latestResult.value
  return Boolean(latest) && !isSaved(latest!)
}

const handleCancel = async () => {
  if (!(await confirmDiscard())) return
  resetConversation()
  if (window.history.length > 1) router.back()
  else router.replace('/tabs/prompts')
}

// 处理 Android 物理返回键（与屏幕关闭按钮逻辑一致）
useBackButton(10, () => {
  handleCancel()
})

// iOS 边缘右滑返回：最新结果还没保存时关闭，只能点关闭按钮走确认
useSwipeBackGuard(hasUnsavedResult)

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 从新建页（编辑后保存）返回：那边保存成功了就把这一版标记为已保存
onIonViewWillEnter(() => {
  const savedId = takeSavedDraftId()
  const latest = latestResult.value
  if (savedId && latest) {
    savedPromptId.value = savedId
    savedContent.value = latest.content
  }
  void models.load().catch(() => undefined)
})

onMounted(async () => {
  try {
    await models.load()
  } catch {
    showToast(t('aiConfig.loadFailed'), 'danger')
  }
  try {
    categories.value = await api.categories.getAll.query()
  } catch (error) {
    console.error('加载分类失败:', error)
  }
})
</script>

<style scoped>
.gen-body {
  gap: 14px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.empty-container {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-text {
  margin: 0 0 4px;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
}

.empty-action {
  width: auto;
  padding: 0 24px;
}

.gen-intro {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
}

.gen-intro__text {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

.gen-example__text {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.gen-example__icon {
  color: var(--accent-primary);
  font-size: 22px;
}

.gen-note {
  padding-top: 8px;
}

/* 需求气泡：主色实底，白字，靠右 */
.gen-bubble {
  align-self: flex-end;
  max-width: 300px;
  padding: 12px 16px;
  border-radius: 20px 20px 6px 20px;
  background: var(--accent-primary);
  color: var(--content-inverse);
  font-size: var(--m-font-body);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.gen-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
}

.gen-status--error {
  color: var(--accent-error);
}

.gen-status ion-spinner {
  width: 18px;
  height: 18px;
  color: var(--accent-primary);
}

.gen-card {
  gap: 10px;
  padding: 16px 18px;
}

/* 已经被后续调整取代的旧版本，弱化显示 */
.gen-card--old {
  opacity: 0.6;
}

.gen-card__title {
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
}

.gen-card__title-pending {
  color: var(--content-tertiary);
  font-weight: 400;
}

.gen-card__actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

/* 只有一个重试按钮的卡片不需要分隔线 */
.gen-card__actions:first-child {
  padding-top: 0;
  border-top: 0;
}

.gen-card__button {
  height: 44px;
}

.gen-footer {
  padding: 8px var(--m-gutter) calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: transparent;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px 16px;
  border-radius: 24px;
  background: var(--surface-primary);
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.composer__input {
  width: 100%;
  max-height: 140px;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-body);
  line-height: 1.5;
  resize: none;
}

.composer__input::placeholder {
  color: var(--content-muted);
}

.composer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer__model {
  min-width: 0;
  max-width: 75%;
  height: 30px;
  padding: 0 10px;
  background: var(--surface-tertiary);
  box-shadow: none;
  font-size: var(--m-font-caption);
}

/* 胶囊变窄时只省略文字，图标保持原大小 */
.composer__model ion-icon {
  flex: none;
}

.composer__model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer__send {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 18px;
  background: var(--accent-primary);
  color: var(--content-inverse);
  font-size: 18px;
  cursor: pointer;
}

.composer__send:disabled {
  opacity: 0.4;
}

.history-sheet {
  height: 100%;
}

.history-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.history-sheet__side {
  width: 64px;
}

.history-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.history-sheet__close {
  min-width: 64px;
  color: var(--accent-primary);
  font-weight: 600;
}

.history-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.history-sheet__body {
  gap: 16px;
  padding-top: 12px;
}

/* 面板本身就是白底，分组改用细描边区分 */
.history-sheet__group {
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.history-sheet__new {
  color: var(--accent-primary);
  font-size: 22px;
}

.history-sheet__topic {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
