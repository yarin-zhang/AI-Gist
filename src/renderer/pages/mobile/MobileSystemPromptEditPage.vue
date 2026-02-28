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
        <ion-card>
          <ion-card-content>
            <p class="info-text">{{ t('aiConfig.systemPromptTip') }}</p>
          </ion-card-content>
        </ion-card>

        <!-- 编辑器 -->
        <ion-card>
          <ion-card-content>
            <ion-textarea
              v-model="systemPrompt"
              :placeholder="t('aiConfig.systemPromptPlaceholder')"
              :auto-grow="true"
              :rows="15"
              class="system-prompt-textarea"
            ></ion-textarea>
          </ion-card-content>
        </ion-card>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button expand="block" fill="outline" @click="handleReset">
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
  IonCard,
  IonCardContent,
  IonTextarea,
  IonIcon,
  alertController,
  toastController
} from '@ionic/vue'
import { refreshOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
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
  const toast = await toastController.create({
    message,
    duration: 2000,
    color
  })
  await toast.present()
}

// 初始化
onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.editor-container {
  padding: 16px;
}

ion-card {
  margin-bottom: 16px;
}

.info-text {
  color: var(--ion-color-medium);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.system-prompt-textarea {
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  min-height: 400px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
