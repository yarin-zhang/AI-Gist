import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
  
  // 用户偏好设置
  preferences: {
    get: () => ipcRenderer.invoke('get-user-preferences'),
    set: (prefs: any) => ipcRenderer.invoke('set-user-preferences', prefs),
    reset: () => ipcRenderer.invoke('reset-user-preferences'),
  },

  // 窗口管理
  window: {
    show: () => ipcRenderer.invoke('show-window'),
    hideToTray: () => ipcRenderer.invoke('hide-to-tray'),
  },

  // 主题管理
  theme: {
    getCurrent: () => ipcRenderer.invoke('theme:get-current'),
    getInfo: () => ipcRenderer.invoke('theme:get-info'),
    setSource: (source: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set-source', source),
    isDark: () => ipcRenderer.invoke('theme:is-dark'),
    onThemeChanged: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('theme-changed', listener);
      // 返回移除监听器的函数
      return () => ipcRenderer.removeListener('theme-changed', listener);
    }
  }
});
