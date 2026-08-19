<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('aiConfig.editGenerationPrompt') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleSave" :disabled="saving">
            {{ t('common.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="editor-container">
        <!-- 提示信息 -->
        <div class="section-content info-card">
          <p class="info-text">{{ t('aiConfig.systemPromptTip') }}</p>
        </div>

        <!-- 编辑器 -->
        <div class="section-content editor-card">
          <ion-textarea
            v-model="systemPrompt"
            :placeholder="t('aiConfig.systemPromptPlaceholder')"
            :auto-grow="true"
            :rows="15"
            class="system-prompt-textarea"
          ></ion-textarea>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button expand="block" fill="outline" color="medium" @click="handleReset">
            <ion-icon slot="start" :icon="refreshOutline"></ion-icon>
            {{ t('aiConfig.resetToDefault') }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonTextarea,
  IonIcon,
  alertController
} from '@ionic/vue'
import { refreshOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig } from '@shared/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 状态
const systemPrompt = ref('')
const originalConfig = ref<AIConfig | null>(null)
const saving = ref(false)

// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`

// 加载配置
const loadConfig = async () => {
  try {
    const configs = await api.aiConfigs.getAll.query()
    const config = configs.find(c => c.id === Number(route.params.id))

    if (config) {
      originalConfig.value = config
      systemPrompt.value = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    } else {
      showToast(t('aiConfig.configNotFound'), 'danger')
      router.back()
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  }
}

// 重置为默认
const handleReset = async () => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('aiConfig.resetToDefault'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.confirm'),
        handler: () => {
          systemPrompt.value = DEFAULT_SYSTEM_PROMPT
          showToast(t('common.update'))
        }
      }
    ]
  })

  await alert.present()
}

// 保存
const handleSave = async () => {
  if (!originalConfig.value) return

  saving.value = true

  try {
    await api.aiConfigs.update.mutate({
      id: originalConfig.value.id!,
      data: {
        ...originalConfig.value,
        systemPrompt: systemPrompt.value
      }
    })

    showToast(t('aiConfig.systemPromptUpdateSuccess'))
    router.back()
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
/*
 * 说明卡片 / 编辑器容器复用 MobileAIConfigDetailPage.vue、MobileAIConfigEditPage.vue
 * 里已经在用的“分组内容块”样式（secondary 背景 + 边框 + 大圆角），
 * 而不是裸的 ion-card，以便和同一功能下的其它移动端页面保持一致的卡片语言。
 */
.editor-container {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: var(--content-padding);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
}

.section-content {
  background: var(--surface-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  overflow: hidden;
}

.info-card {
  padding: var(--content-padding);
}

.info-text {
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-normal);
  margin: 0;
}

.editor-card {
  padding: var(--content-padding);
}

/* 去掉 ion-textarea 自身的内边距/背景，让它与 .editor-card 融为一体，
   同时保留清晰可辨的编辑区域边界（由外层卡片的背景+边框提供）。 */
.system-prompt-textarea {
  --background: transparent;
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --placeholder-color: var(--content-tertiary);
  --placeholder-opacity: 1;
  --color: var(--content-primary);
  font-family: monospace;
  font-size: var(--mobile-font-size-body);
  line-height: var(--mobile-line-height-normal);
  min-height: 360px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
