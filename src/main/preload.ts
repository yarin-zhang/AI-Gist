import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
  
  // tRPC 调用
  trpc: {
    query: (path: string, input?: any) => 
      ipcRenderer.invoke('trpc', { path, input, type: 'query' }),
    mutate: (path: string, input?: any) => 
      ipcRenderer.invoke('trpc', { path, input, type: 'mutation' }),
  },

  // 用户偏好设置
  preferences: {
    get: () => ipcRenderer.invoke('get-user-preferences'),
    set: (prefs: any) => ipcRenderer.invoke('set-user-preferences', prefs),
  },

  // 窗口管理
  window: {
    show: () => ipcRenderer.invoke('show-window'),
    hideToTray: () => ipcRenderer.invoke('hide-to-tray'),
  }
})
