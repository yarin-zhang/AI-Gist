/**
 * Should match main/preload.ts for typescript support in renderer
 */
export default interface ElectronApi {
  sendMessage: (message: string) => void
  
  // 用户偏好设置
  preferences: {
    get: () => Promise<any>
    set: (prefs: any) => Promise<any>
  }
  
  // 窗口管理
  window: {
    show: () => Promise<void>
    hideToTray: () => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
}
