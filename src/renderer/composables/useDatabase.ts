import { ref, onMounted, readonly } from 'vue'
import { databaseService } from '../lib/db'

// 全局数据库状态
const isDatabaseReady = ref(false)
const databaseError = ref<string | null>(null)

/**
 * 数据库状态管理 composable
 */
export function useDatabase() {
  const isLoading = ref(false)

  /**
   * 等待数据库就绪
   */
  const waitForDatabase = async (): Promise<boolean> => {
    if (isDatabaseReady.value) {
      return true
    }

    isLoading.value = true
    databaseError.value = null

    try {
      await databaseService.waitForInitialization()
      isDatabaseReady.value = true
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '数据库初始化失败'
      databaseError.value = errorMessage
      console.error('数据库初始化失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 安全执行数据库操作
   */
  const safeDbOperation = async <T>(
    operation: () => Promise<T>,
    fallback?: T
  ): Promise<T | undefined> => {
    try {
      const ready = await waitForDatabase()
      if (!ready) {
        console.warn('数据库未就绪，跳过操作')
        return fallback
      }
      return await operation()
    } catch (error) {
      console.error('数据库操作失败:', error)
      databaseError.value = error instanceof Error ? error.message : '操作失败'
      return fallback
    }
  }

  /**
   * 重置错误状态
   */
  const clearError = () => {
    databaseError.value = null
  }

  return {
    isDatabaseReady: readonly(isDatabaseReady),
    databaseError: readonly(databaseError),
    isLoading: readonly(isLoading),
    waitForDatabase,
    safeDbOperation,
    clearError
  }
}

/**
 * 初始化数据库状态（仅在应用启动时调用一次）
 */
export async function initDatabaseState() {
  try {
    await databaseService.waitForInitialization()
    isDatabaseReady.value = true
    console.log('数据库状态初始化成功')
  } catch (error) {
    databaseError.value = error instanceof Error ? error.message : '数据库初始化失败'
    console.error('数据库状态初始化失败:', error)
  }
}
