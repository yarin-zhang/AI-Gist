import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { GlobalTheme } from 'naive-ui'
import { darkTheme } from 'naive-ui'

// 主题类型
export type SystemTheme = 'light' | 'dark' | 'system'

// 主题状态
const isDarkMode = ref(false)
const currentTheme = ref<SystemTheme>('system')
const themeSource = ref<'system' | 'light' | 'dark'>('system')

// 主题变化监听器清理函数
let removeThemeListener: (() => void) | null = null

/**
 * 主题管理 Composable
 * 提供系统主题检测、NaiveUI 主题切换和主题状态管理
 */
export function useTheme() {
  
  // NaiveUI 主题配置
  const naiveTheme = computed<GlobalTheme | null>(() => {
    return isDarkMode.value ? darkTheme : null
  })

  // 主题类名（用于根元素）
  const themeClass = computed(() => {
    return isDarkMode.value ? 'dark' : 'light'
  })

  /**
   * 初始化主题
   */
  const initTheme = async () => {
    try {
      // 获取系统当前主题信息
      const themeInfo = await window.electronAPI.theme.getInfo()
      isDarkMode.value = themeInfo.isDarkTheme
      currentTheme.value = themeInfo.currentTheme
      themeSource.value = themeInfo.themeSource as 'system' | 'light' | 'dark'
      
      console.log('主题初始化完成:', {
        isDarkMode: isDarkMode.value,
        currentTheme: currentTheme.value,
        themeSource: themeSource.value
      })

      // 设置页面根元素的主题类名
      updateBodyTheme()
      
      // 监听主题变化
      setupThemeListener()
    } catch (error) {
      console.error('初始化主题失败:', error)
      // 降级处理：使用系统默认主题
      isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches
      updateBodyTheme()
    }
  }

  /**
   * 设置主题来源
   * @param source 主题来源：'system' | 'light' | 'dark'
   */
  const setThemeSource = async (source: 'system' | 'light' | 'dark') => {
    try {
      const newTheme = await window.electronAPI.theme.setSource(source)
      themeSource.value = source
      currentTheme.value = newTheme
      
      // 立即获取更新后的主题信息
      const themeInfo = await window.electronAPI.theme.getInfo()
      isDarkMode.value = themeInfo.isDarkTheme
      
      updateBodyTheme()
      
      console.log('主题来源已更新:', {
        source,
        newTheme,
        isDarkMode: isDarkMode.value
      })
    } catch (error) {
      console.error('设置主题来源失败:', error)
    }
  }

  /**
   * 切换明暗主题
   */
  const toggleTheme = async () => {
    const newSource = isDarkMode.value ? 'light' : 'dark'
    await setThemeSource(newSource)
  }

  /**
   * 设置系统主题监听器
   */
  const setupThemeListener = () => {
    // 清理之前的监听器
    if (removeThemeListener) {
      removeThemeListener()
    }

    // 设置新的监听器
    removeThemeListener = window.electronAPI.theme.onThemeChanged((data) => {
      console.log('接收到主题变化:', data)
      isDarkMode.value = data.themeInfo.isDarkTheme
      currentTheme.value = data.theme
      themeSource.value = data.themeInfo.themeSource
      updateBodyTheme()
    })
  }

  /**
   * 更新页面根元素的主题类名
   */
  const updateBodyTheme = () => {
    const body = document.body
    body.classList.remove('light', 'dark')
    body.classList.add(themeClass.value)
    
    // 设置CSS自定义属性
    body.style.setProperty('--theme-mode', themeClass.value)
  }

  /**
   * 获取当前主题信息
   */
  const getThemeInfo = () => {
    return {
      isDarkMode: isDarkMode.value,
      currentTheme: currentTheme.value,
      themeSource: themeSource.value,
      themeClass: themeClass.value
    }
  }

  /**
   * 清理主题监听器
   */
  const cleanup = () => {
    if (removeThemeListener) {
      removeThemeListener()
      removeThemeListener = null
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup()
  })

  return {
    // 响应式状态
    isDarkMode: computed(() => isDarkMode.value),
    currentTheme: computed(() => currentTheme.value),
    themeSource: computed(() => themeSource.value),
    naiveTheme,
    themeClass,
    
    // 方法
    initTheme,
    setThemeSource,
    toggleTheme,
    getThemeInfo,
    cleanup
  }
}

// 全局主题状态（可选，用于跨组件共享）
export const globalTheme = {
  isDarkMode,
  currentTheme,
  themeSource
}
