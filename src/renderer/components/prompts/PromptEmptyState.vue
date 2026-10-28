<template>
  <section class="onboarding">
    <div class="onboarding__inner">
      <div class="onboarding__intro">
        <img :src="appIcon" alt="AI Gist" class="onboarding__logo" />
        <h1 class="ui-title-page">{{ t('promptOnboarding.title') }}</h1>
        <p class="onboarding__lead">{{ t('promptOnboarding.lead') }}</p>
      </div>

      <div class="onboarding__composer">
        <textarea ref="inputRef" v-model="description" rows="3" class="onboarding__input" :aria-label="t('promptOnboarding.describeTask')"
          :placeholder="t('promptOnboarding.placeholder')" @keydown.enter.meta="handleEnterKey($event, generateFromKeyboard)" @keydown.enter.ctrl="handleEnterKey($event, generateFromKeyboard)" />
        <div class="onboarding__composer-foot">
          <span v-if="hasModels" class="onboarding__hint">{{ t('promptOnboarding.aiHint') }}</span>
          <!-- 还没有模型时提示本身就是去连接模型的入口；连好后会回到这里，写的描述还在 -->
          <NButton v-else text type="primary" size="tiny" class="onboarding__hint-link" @click="emit('connect-model')">
            {{ t('promptOnboarding.needModel') }}
          </NButton>
          <div class="onboarding__composer-actions">
            <NButton @click="emit('create-manual', description)">{{ t('promptOnboarding.writeManually') }}</NButton>
            <!-- 不可用时悬停说明原因（还没连模型 / 还没写描述）；禁用的按钮收不到悬停事件，提示挂在外层 -->
            <NTooltip :disabled="!generateBlockedReason" :show-arrow="false">
              <template #trigger>
                <span class="onboarding__generate">
                  <NButton type="primary" :disabled="Boolean(generateBlockedReason)" @click="generate">
                    <template #icon><NIcon :size="16"><Stars /></NIcon></template>
                    {{ t('promptOnboarding.generate') }}
                  </NButton>
                </span>
              </template>
              {{ generateBlockedReason }}
            </NTooltip>
          </div>
        </div>
      </div>

      <div class="onboarding__examples">
        <span class="onboarding__try">{{ t('promptGenerate.tryLabel') }}</span>
        <NButton v-for="example in examples" :key="example.label" size="tiny" round @click="description = example.text">
          {{ example.label }}
        </NButton>
      </div>

      <div class="onboarding__steps">
        <span class="ui-overline">{{ t('promptOnboarding.beforeYouStart') }}</span>
        <button v-for="(step, index) in steps" :key="step.key" type="button" class="onboarding-step" @click="runStep(step.key)">
          <span class="onboarding-step__number">{{ index + 1 }}</span>
          <span class="onboarding-step__text">
            <span class="onboarding-step__title">{{ step.title }}</span>
            <span class="onboarding-step__description">{{ step.description }}</span>
          </span>
          <NIcon :size="16" class="onboarding-step__chevron"><ChevronRight /></NIcon>
        </button>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { ref } from 'vue'

// 引导页写的描述放在组件外：去连接模型、切到别的页面再回来，或手动新建后又放弃时，描述还在
const onboardingDraft = ref('')
</script>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NTooltip, useMessage } from 'naive-ui'
import { ChevronRight, Stars } from '@vicons/tabler'
import { PlatformDetector } from '@shared/platform'
import appIcon from '@/assets/images/logo.png'
import { useAIModels } from '@/composables/prompt/useAIModels'
import { handleEnterKey } from '@/lib/utils/ime'

const emit = defineEmits<{
  'create-manual': [description: string]
  generate: [description: string]
  'connect-model': []
  'import-data': []
  'enable-sync': []
}>()

const { t } = useI18n()
const models = useAIModels()
const hasModels = computed(() => models.hasModels.value)
const description = onboardingDraft
const inputRef = ref<HTMLTextAreaElement>()
const generateBlockedReason = computed(() => {
  if (!hasModels.value) return t('promptOnboarding.needModel')
  return description.value.trim() ? '' : t('promptOnboarding.describeFirst')
})
// Web 版和 Windows 等平台只能用 WebDAV，同步步骤的说明不提 iCloud
const syncStepDescription = PlatformDetector.getCapabilities().icloud
  ? 'promptOnboarding.stepSyncDescription' : 'promptOnboarding.stepSyncDescriptionWebdav'

// 带着之前写的描述回来（比如刚连好模型）：光标放回输入框末尾，可以接着改或直接生成
onMounted(() => {
  const input = inputRef.value
  if (!input || !description.value) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
})

const examples = computed(() => [
  { label: t('promptOnboarding.exampleReview'), text: t('promptGenerate.exampleReviewText') },
  { label: t('promptOnboarding.exampleWeekly'), text: t('promptOnboarding.exampleWeeklyText') },
  { label: t('promptOnboarding.exampleMeeting'), text: t('promptOnboarding.exampleMeetingText') },
  { label: t('promptOnboarding.exampleEmail'), text: t('promptOnboarding.exampleEmailText') },
  { label: t('promptOnboarding.exampleTranslate'), text: t('promptOnboarding.exampleTranslateText') },
])

const steps = computed(() => [
  { key: 'model' as const, title: t('promptOnboarding.stepModel'), description: t('promptOnboarding.stepModelDescription') },
  { key: 'import' as const, title: t('promptOnboarding.stepImport'), description: t('promptOnboarding.stepImportDescription') },
  { key: 'sync' as const, title: t('promptOnboarding.stepSync'), description: t(syncStepDescription) },
])

const runStep = (key: 'model' | 'import' | 'sync') => {
  if (key === 'model') emit('connect-model')
  else if (key === 'import') emit('import-data')
  else emit('enable-sync')
}

const generate = () => {
  if (!hasModels.value || !description.value.trim()) return
  emit('generate', description.value.trim())
}

// 按钮不可用时有悬停说明；⌘↵ 看不到按钮，生成不了时同样说清缺什么（没连模型 / 还没写描述）
const message = useMessage()
const generateFromKeyboard = () => {
  if (generateBlockedReason.value) {
    message.warning(generateBlockedReason.value)
    return
  }
  generate()
}
</script>

<style scoped>
.onboarding {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 40px 24px;
  overflow: auto;
  background: var(--surface-primary);
}

.onboarding__inner {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 640px;
}

.onboarding__intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.onboarding__logo {
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  border-radius: 10px;
}

.onboarding__lead {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--font-size-base);
}

.onboarding__composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
}

.onboarding__composer:focus-within {
  border-color: var(--accent-brand);
  box-shadow: var(--focus-ring);
}

.onboarding__input {
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-base);
  line-height: 1.6;
}

.onboarding__input::placeholder {
  color: var(--content-muted);
}

.onboarding__composer-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.onboarding__hint {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.onboarding__hint-link {
  font-size: var(--font-size-xs);
}

.onboarding__composer-actions {
  display: flex;
  gap: 8px;
}

.onboarding__examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.onboarding__try {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.onboarding__steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.onboarding-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.onboarding-step:hover {
  border-color: var(--border-strong);
  background: var(--surface-secondary);
}

.onboarding-step:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.onboarding-step__number {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: var(--surface-tertiary);
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
}

.onboarding-step__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.onboarding-step__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.onboarding-step__description {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.onboarding-step__chevron {
  color: var(--content-tertiary);
}
</style>
