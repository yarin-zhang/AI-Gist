import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * 跟踪元素的 clientWidth。目标元素可以按条件渲染，切换后会自动重新挂上观察。
 * 用于按容器（而不是窗口）宽度切换布局：同一窗口宽度下，侧栏展开与否会让内容区宽度差很多。
 */
export function useElementWidth(target: Ref<HTMLElement | null | undefined>) {
  const width = ref(0)
  let observer: ResizeObserver | null = null

  const stop = () => {
    observer?.disconnect()
    observer = null
  }

  watch(target, (element) => {
    stop()
    if (!element) return
    width.value = element.clientWidth
    observer = new ResizeObserver(() => {
      width.value = element.clientWidth
    })
    observer.observe(element)
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(stop)

  return width
}
