/**
 * 系统分享面板是被用户关掉的，而不是分享失败。
 * iOS / Android 的 Capacitor Share 插件这时报「Share canceled」，浏览器的 navigator.share 报 AbortError。
 * 关掉分享面板不是错误，界面不应该提示「导出失败」。
 */
export const isShareDismissed = (error: unknown): boolean => {
  const name = (error as { name?: unknown } | null | undefined)?.name
  const message = error instanceof Error ? error.message : String(error ?? '')
  return name === 'AbortError' || /\bcancel(?:l?ed)?\b/i.test(message)
}
