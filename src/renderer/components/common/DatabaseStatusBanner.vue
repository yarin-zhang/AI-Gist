<template>
  <div v-if="databaseError && !isHidden" class="database-status-banner error">
    <div class="content">
      <div class="icon">
        <div class="error-icon">⚠️</div>
      </div>
      <div class="text">
        <div class="error-message">
          <div>{{ t('databaseStatus.connectionError') }}</div>
          <div class="error-detail">{{ databaseError }}</div>
        </div>
      </div>
      <div class="actions">
        <button @click="retry" class="retry-btn" :disabled="isRetrying">
          {{ isRetrying ? t('databaseStatus.retrying') : t('databaseStatus.retry') }}
        </button>
        <button @click="hide" class="close-btn">
          {{ t('databaseStatus.hide') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDatabase } from '~/composables/useDatabase'
import { useI18n } from 'vue-i18n'

const { isDatabaseReady, databaseError, waitForDatabase, clearError } = useDatabase()
const { t } = useI18n()

const isHidden = ref(false)
const isRetrying = ref(false)

const hide = () => {
  isHidden.value = true
}

const retry = async () => {
  isRetrying.value = true
  clearError()

  try {
    await waitForDatabase()
    if (isDatabaseReady.value) {
      isHidden.value = true
    }
  } catch (error) {
    console.error('重试失败:', error)
  } finally {
    isRetrying.value = false
  }
}
</script>

<style scoped>
.database-status-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  padding: 12px 20px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.content {
  display: flex;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  gap: 12px;
}

.icon {
  flex-shrink: 0;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-icon {
  font-size: 20px;
}

.text {
  flex: 1;
  min-width: 0;
}

.message {
  font-size: 14px;
  font-weight: 500;
}

.error-message {
  font-size: 14px;
}

.error-detail {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 2px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.retry-btn,
.close-btn {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.retry-btn:hover:not(:disabled),
.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
