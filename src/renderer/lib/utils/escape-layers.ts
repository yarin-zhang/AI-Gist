/**
 * Esc 分层：一次只收起最上面的一层（下拉 / 气泡 → 面板 → 弹窗）。
 *
 * Naive 的下拉、选择框、气泡都挂在 `.v-binder-follower-content` 里，它们自己处理 Esc（或点外面收起）；
 * 这些浮层打开时，外层的面板和弹窗不响应这一次 Esc。悬停提示不算一层，它不拦 Esc。
 */

import { isImeComposing } from './ime'

const LEAVING_CLASS = /-leave-(?:active|to)$/

const isHidden = (element: Element) => Boolean(element.closest('[style*="display: none"]'))

/** 页面上有没有正在显示的下拉、选择框、气泡或图片预览 */
export function hasOpenFloatingLayer(root: ParentNode = document): boolean {
  const layers = Array.from(root.querySelectorAll('.v-binder-follower-content > *'))
  const popupOpen = layers.some(layer => (
    !layer.classList.contains('n-tooltip')
    // 正在淡出的浮层已经收起了，不再拦下一次 Esc
    && !Array.from(layer.classList).some(name => LEAVING_CLASS.test(name))
    && !isHidden(layer)
  ))
  return popupOpen || Boolean(root.querySelector('.n-image-preview-container'))
}

/** 这次 Esc 是否已经被里面的控件用掉：输入法正在组字，或行内输入框已经用它取消了编辑 */
export function isEscapeConsumed(event: KeyboardEvent): boolean {
  return event.defaultPrevented || isImeComposing(event)
}

/**
 * 行内输入框（标签、选项、新分类）的 Esc：取消这次输入。
 * 输入法组字时的 Esc 留给输入法撤销组字；其余情况阻止默认行为，外层的面板和弹窗就不再响应这一次 Esc。
 */
export function handleEscapeKey(event: KeyboardEvent, cancel: () => void): void {
  if (isImeComposing(event)) return
  event.preventDefault()
  cancel()
}
