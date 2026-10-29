<template>
  <div class="app-initializer">
    <!-- 数据库初始化加载屏幕 -->
    <div v-if="!isDatabaseReady && !hasInitializationCompleted" class="loading-screen">
      <div class="loading-content" role="status" aria-live="polite">
        <img :src="appIcon" alt="" class="loading-logo" />
        <template v-if="!databaseError">
          <NSpin :size="20" />
          <span class="loading-title">{{ t('appInit.loading') }}</span>
        </template>
        <template v-else>
          <span class="loading-title loading-title--error">{{ t('appInit.failedTitle') }}</span>
          <span class="loading-detail">{{ describeDatabaseError(databaseError, t) }}</span>
          <!-- 原始报错带错误码和 IndexedDB 细节，只在反馈问题时有用：默认折叠 -->
          <details v-if="databaseError.detail" class="loading-tech">
            <summary>{{ t('databaseStatus.detailLabel') }}</summary>
            <span class="loading-tech__raw">{{ databaseError.detail }}</span>
          </details>
          <div class="loading-actions">
            <NButton type="primary" :loading="isRetrying" @click="retry">{{ t('common.retry') }}</NButton>
            <NButton quaternary @click="continueWithoutDb">{{ t('appInit.continue') }}</NButton>
          </div>
        </template>
      </div>
    </div>

    <!-- 应用主体（数据库初始化完成或用户选择继续后显示） -->
    <div v-else class="app-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NSpin } from 'naive-ui'
import appIcon from '~/assets/images/logo.png'
import { useDatabase } from '~/composables/useDatabase'
import { initDatabaseState } from '~/composables/useDatabase'
import { describeDatabaseError } from '~/lib/utils/database-error'

const { t } = useI18n()
const { isDatabaseReady, databaseError, clearError } = useDatabase()

const hasInitializationCompleted = ref(false)
const isRetrying = ref(false)

// 初始化数据库
const initializeDatabase = async () => {
  try {
    console.log('正在初始化数据库状态...')
    await initDatabaseState()
    console.log('数据库状态初始化成功')
    hasInitializationCompleted.value = true
  } catch (error) {
    console.error('数据库状态初始化失败:', error)
    hasInitializationCompleted.value = true
  }
}

// 重试初始化
const retry = async () => {
  isRetrying.value = true
  clearError()
  hasInitializationCompleted.value = false

  try {
    await initializeDatabase()
  } finally {
    isRetrying.value = false
  }
}

// 继续使用应用（即使数据库未初始化）
const continueWithoutDb = () => {
  hasInitializationCompleted.value = true
  console.log('用户选择继续使用应用（数据库功能可能受限）')
}

// 组件挂载时初始化数据库
onMounted(() => {
  initializeDatabase()
})
</script>

<style scoped>
.app-initializer {
  width: 100%;
  height: 100vh;
}

.loading-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-body);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 420px;
  padding: 24px;
  text-align: center;
}

.loading-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
  border-radius: 13px;
}

.loading-title {
  color: var(--content-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.loading-title--error {
  color: var(--accent-error);
}

.loading-detail {
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.loading-tech {
  max-width: 100%;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  text-align: left;
}

.loading-tech summary {
  width: fit-content;
  margin: 0 auto;
  cursor: pointer;
}

.loading-tech summary:focus-visible {
  border-radius: var(--radius-control);
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.loading-tech__raw {
  display: block;
  max-height: 160px;
  margin-top: 6px;
  overflow: auto;
  font-family: var(--font-family-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.loading-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.app-content {
  width: 100%;
  height: 100%;
}
</style>
