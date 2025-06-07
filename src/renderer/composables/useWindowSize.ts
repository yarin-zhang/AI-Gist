import { ref, computed, readonly, onMounted, onUnmounted } from 'vue'

interface WindowSize {
  width: number
  height: number
}

export function useWindowSize() {
  const windowSize = ref<WindowSize>({ width: 1080, height: 720 })
  const contentSize = ref<WindowSize>({ width: 1080, height: 720 })

  // 更新窗口尺寸
  const updateWindowSize = async () => {
    try {
      if (window.electronAPI) {
        const size = await window.electronAPI.window.getSize()
        const content = await window.electronAPI.window.getContentSize()
        
        if (size) {
          windowSize.value = size
        }
        if (content) {
          contentSize.value = content
        }
      }
    } catch (error) {
      console.warn('无法获取窗口尺寸:', error)
    }
  }

  // 窗口大小变化监听器
  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    // 初始化时获取窗口尺寸
    updateWindowSize()

    // 监听窗口大小变化
    resizeObserver = new ResizeObserver(() => {
      updateWindowSize()
    })

    // 监听文档body的变化
    if (document.body) {
      resizeObserver.observe(document.body)
    }
  })

  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
  })  // 计算模态框最大高度（窗口高度的 100%，充满整个页面）
  const modalMaxHeight = computed(() => {
    // console.log('计算模态框最大高度:', contentSize.value.height)
    return Math.max(contentSize.value.height, 600)
  })

  // 计算模态框宽度（窗口宽度的 100%，充满整个页面）
  const modalWidth = computed(() => {
    // console.log('计算模态框最大宽度:', contentSize.value.width)
    return Math.max(contentSize.value.width, 800)
  })

  return {
    windowSize: readonly(windowSize),
    contentSize: readonly(contentSize),
    modalMaxHeight,
    modalWidth,
    updateWindowSize
  }
}
