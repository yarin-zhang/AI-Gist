import { ref, computed, readonly, onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue'

interface WindowSize {
  width: number
  height: number
}

// 模态框布局配置接口
interface ModalLayoutOptions {
  minHeaderHeight?: number
  minFooterHeight?: number
  contentPadding?: number
  show?: Ref<boolean>
  hasFooter?: Ref<boolean>
}

// 模态框布局返回值接口
interface ModalLayoutReturn {
  headerHeight: Ref<number>
  footerHeight: Ref<number>
  contentHeight: Readonly<Ref<number>>
  modalHeight: Readonly<Ref<number>>
  modalWidth: Readonly<Ref<number>>
  updateActualHeights: (headerRef?: any, footerRef?: any, hasFooter?: boolean) => Promise<void>
  resetHeights: () => void
  setupLayoutWatchers: (headerRef: Ref<any>, footerRef: Ref<any>) => void
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

/**
 * 用于模态框布局计算的 composable
 * @param options 布局配置选项
 */
export function useModalLayout(
  options: ModalLayoutOptions = {}
): ModalLayoutReturn {
  const {
    minHeaderHeight = 60,
    minFooterHeight = 60,
    contentPadding = 16,
    show,
    hasFooter
  } = options

  // 获取窗口尺寸
  const { modalMaxHeight, modalWidth } = useWindowSize()

  // 实际高度状态
  const headerHeight = ref(minHeaderHeight)
  const footerHeight = ref(minFooterHeight)

  // 模态框总高度
  const modalHeight = computed(() => {
    return modalMaxHeight.value
  })

  // 中间内容区域高度（动态计算）
  const contentHeight = computed(() => {
    const topValue = Math.max(headerHeight.value, minHeaderHeight)
    const bottomValue = hasFooter?.value ? Math.max(footerHeight.value, minFooterHeight) : 0
    return modalMaxHeight.value - topValue - bottomValue
  })

  // 更新实际高度的函数
  const updateActualHeights = async (
    headerRef?: any,
    footerRef?: any,
    hasFooterValue: boolean = false
  ) => {
    await nextTick()

    // 更新 header 高度
    if (headerRef?.value?.$el) {
      const headerEl = headerRef.value.$el as HTMLElement
      const actualHeaderHeight = headerEl.getBoundingClientRect().height
      if (actualHeaderHeight > 0) {
        headerHeight.value = Math.max(actualHeaderHeight, minHeaderHeight)
      }
    }

    // 更新 footer 高度
    if (footerRef?.value?.$el && hasFooterValue) {
      const footerEl = footerRef.value.$el as HTMLElement
      const actualFooterHeight = footerEl.getBoundingClientRect().height
      if (actualFooterHeight > 0) {
        footerHeight.value = Math.max(actualFooterHeight, minFooterHeight)
      }
    }
  }

  // 重置高度为默认值
  const resetHeights = () => {
    headerHeight.value = minHeaderHeight
    footerHeight.value = minFooterHeight
  }

  // 设置布局监听器的函数
  const setupLayoutWatchers = (headerRef: Ref<any>, footerRef: Ref<any>) => {
    // 监听显示状态变化，更新高度
    if (show) {
      watch(show, (newShow) => {
        if (newShow) {
          // 延迟一点确保DOM完全渲染
          setTimeout(() => {
            updateActualHeights(headerRef, footerRef, hasFooter?.value || false)
          }, 100)
        } else {
          // 关闭时重置高度
          resetHeights()
        }
      })
    }

    // 监听是否有footer变化
    if (hasFooter) {
      watch(hasFooter, () => {
        if (show?.value) {
          setTimeout(() => {
            updateActualHeights(headerRef, footerRef, hasFooter.value)
          }, 100)
        }
      })
    }

    // 初始化时如果已经显示，则更新高度
    if (show?.value) {
      setTimeout(() => {
        updateActualHeights(headerRef, footerRef, hasFooter?.value || false)
      }, 100)
    }
  }

  return {
    headerHeight,
    footerHeight,
    contentHeight: readonly(contentHeight),
    modalHeight: readonly(modalHeight),
    modalWidth: readonly(modalWidth),
    updateActualHeights,
    resetHeights,
    setupLayoutWatchers
  }
}
