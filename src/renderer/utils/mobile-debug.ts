/**
 * 移动端调试工具
 * 在移动端环境下捕获并显示错误信息
 */

export function setupMobileDebug() {
  if (typeof window === 'undefined') {
    return;
  }

  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    console.error('全局错误:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    });
  });

  // 捕获未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的 Promise 拒绝:', {
      reason: event.reason,
      promise: event.promise
    });
  });

  // 检测平台
  const isCapacitor = !!(window as any).Capacitor;
  const isElectron = !!(window as any).electronAPI;

  console.log('平台检测:', {
    isCapacitor,
    isElectron,
    platform: isCapacitor ? (window as any).Capacitor.getPlatform?.() : 'unknown',
    userAgent: navigator.userAgent
  });
}
