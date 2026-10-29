import { ref, readonly } from 'vue'
import { databaseService } from '../lib/db'
import { classifyDatabaseError, type DatabaseErrorState } from '../lib/utils/database-error'

// 全局数据库状态：只有数据库本身打不开时才有值，界面据此显示「数据没能加载」
const isDatabaseReady = ref(false)
const databaseError = ref<DatabaseErrorState | null>(null)

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
      databaseError.value = classifyDatabaseError(error)
      console.error('数据库初始化失败:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 安全执行数据库操作：数据库没打开时跳过，操作失败时返回 fallback。
   *
   * 单次操作失败（读写某条数据出错）不代表数据库坏了，不能把它升级成全局的「数据没能加载」；
   * 失败只写日志，由调用方根据返回值处理。
   */
  const safeDbOperation = async <T>(
    operation: () => Promise<T>,
    fallback?: T
  ): Promise<T | undefined> => {
    const ready = await waitForDatabase()
    if (!ready) {
      console.warn('数据库未就绪，跳过操作')
      return fallback
    }
    try {
      return await operation()
    } catch (error) {
      console.error('数据库操作失败:', error)
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
    databaseError.value = classifyDatabaseError(error)
    console.error('数据库状态初始化失败:', error)
  }
}
