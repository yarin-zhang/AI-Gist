<template>
  <ion-page>
    <MobileNavBar :title="t('aiConfig.systemPrompt')" leading="none" solid>
      <template #start>
        <button type="button" class="m-btn-c" :aria-label="t('common.back')" @click="handleBack">
          <ion-icon :icon="chevronBack" />
        </button>
      </template>
      <template #end>
        <button type="button" class="m-save" :disabled="saving || !originalConfig" @click="handleSave">
          {{ t('common.save') }}
        </button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <div class="m-body prompt-body">
        <!-- 说明 -->
        <div class="prompt-tip" role="note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t('models.systemPromptTip') }}</span>
        </div>

        <!-- 编辑器：占满剩余高度 -->
        <div class="m-card prompt-editor">
          <textarea v-model="systemPrompt" class="prompt-editor__input" :aria-label="t('aiConfig.systemPrompt')"
            :placeholder="t('aiConfig.systemPromptPlaceholder')" />
          <div class="prompt-editor__meta">
            <span>{{ isDefaultPrompt ? t('aiConfig.systemPromptDefault') : t('aiConfig.systemPromptCustomized') }}</span>
            <span>{{ t('mobileModels.charCount', { count: systemPrompt.length }) }}</span>
          </div>
        </div>

        <button type="button" class="m-cta m-cta-2 prompt-reset" :disabled="isDefaultPrompt" @click="handleReset">
          <ion-icon :icon="refreshOutline" aria-hidden="true" />
          {{ t('aiConfig.resetToDefault') }}
        </button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonIcon,
  useBackButton
} from '@ionic/vue'
import { chevronBack, informationCircleOutline, refreshOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig } from '@shared/types'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import { DEFAULT_SYSTEM_PROMPT_KEY } from '~/lib/services/mobile-ai-generator.service'
import { confirmAlert } from '~/components/mobile/models/useConfigActions'
import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 状态
const systemPrompt = ref('')
const snapshot = ref('')
const originalConfig = ref<AIConfig | null>(null)
const saving = ref(false)

// 默认系统提示词：和 AI 生成实际使用的是同一段多语言文案（同一个 key）
const defaultPrompt = computed(() => t(DEFAULT_SYSTEM_PROMPT_KEY))
const isDefaultPrompt = computed(() => systemPrompt.value.trim() === defaultPrompt.value.trim())
const isDirty = computed(() => originalConfig.value !== null && systemPrompt.value !== snapshot.value)

// 加载配置
const loadConfig = async () => {
  try {
    const configs = await api.aiConfigs.getAll.query()
    const config = configs.find(c => c.id === Number(route.params.id))

    if (config) {
      originalConfig.value = config
      systemPrompt.value = config.systemPrompt || defaultPrompt.value
      snapshot.value = systemPrompt.value
    } else {
      showToast(t('aiConfig.configNotFound'), 'danger')
      router.back()
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  }
}

// 重置为默认（只改编辑器内容，保存后生效）
const handleReset = async () => {
  const confirmed = await confirmAlert({
    header: t('common.confirm'),
    message: t('aiConfig.resetToDefault'),
    confirmText: t('common.confirm'),
    cancelText: t('common.cancel')
  })
  if (confirmed) {
    systemPrompt.value = defaultPrompt.value
  }
}

const leavePage = () => {
  if (window.history.length > 1) router.back()
  else router.replace(`/ai-config/${route.params.id}`)
}

// 返回：有未保存的修改先确认
const handleBack = async () => {
  if (saving.value) return
  if (isDirty.value) {
    const discard = await confirmAlert({
      header: t('aiConfig.workspace.unsavedChanges'),
      message: t('aiConfig.workspace.unsavedPromptMessage'),
      confirmText: t('aiConfig.workspace.discardChanges'),
      cancelText: t('aiConfig.workspace.continueEditing'),
      destructive: true
    })
    if (!discard) return
  }
  leavePage()
}

useBackButton(10, () => {
  handleBack()
})

// iOS 边缘右滑返回：有未保存的修改时关闭，只能点返回按钮走确认
useSwipeBackGuard(isDirty)

// 保存：内容为空或与默认一致时存空值，生成时自动使用内置默认提示词
const handleSave = async () => {
  if (!originalConfig.value) return

  saving.value = true

  try {
    const content = systemPrompt.value.trim()
    const value = !content || content === defaultPrompt.value.trim() ? '' : systemPrompt.value
    await api.aiConfigs.update.mutate({
      id: originalConfig.value.id!,
      data: {
        ...originalConfig.value,
        systemPrompt: value
      }
    })

    snapshot.value = systemPrompt.value
    showToast(t('aiConfig.systemPromptUpdateSuccess'))
    leavePage()
  } catch (error) {
    console.error('保存失败:', error)
    showToast(t('aiConfig.updateFailed'), 'danger')
  } finally {
    saving.value = false
  }
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 初始化
onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
/* 页面撑满一屏，编辑卡片吃掉剩余高度 */
.prompt-body {
  box-sizing: border-box;
  min-height: 100%;
  gap: 14px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
}

.prompt-tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--m-radius-card);
  background: var(--accent-soft);
  color: var(--accent-soft-text);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

.prompt-tip ion-icon {
  flex: none;
  margin-top: 2px;
  font-size: 18px;
}

.prompt-editor {
  flex: 1;
  gap: 10px;
  min-height: 320px;
  padding: 16px 18px;
}

.prompt-editor__input {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-body);
  line-height: 1.75;
  resize: none;
}

.prompt-editor__input::placeholder {
  color: var(--content-muted);
}

.prompt-editor__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

.prompt-reset ion-icon {
  font-size: 18px;
}
</style>
