/**
 * 输入法正在组字时按的回车只是确认候选词（日文变换、中文上屏英文），不能当成「发送」或「提交」。
 * Chrome / Edge 组字中的 keydown 带 isComposing；Safari 确认候选词的那次回车在 compositionend 之后才到，
 * isComposing 已经是 false，只能靠 keyCode 229 认出来。
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

/** 回车提交用：输入法组字中的回车跳过不处理，其余回车阻止默认行为后执行 action */
export function handleEnterKey(event: KeyboardEvent, action: () => void): void {
  if (isImeComposing(event)) return
  event.preventDefault()
  action()
}
