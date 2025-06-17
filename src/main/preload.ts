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
    getSize: () => ipcRenderer.invoke('get-window-size'),
    getContentSize: () => ipcRenderer.invoke('get-content-size'),
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
  },
  // AI 服务管理
  ai: {
    getConfigs: () => ipcRenderer.invoke('ai:get-configs'),
    getEnabledConfigs: () => ipcRenderer.invoke('ai:get-enabled-configs'),
    addConfig: (config: any) => ipcRenderer.invoke('ai:add-config', config),
    updateConfig: (id: string, config: any) => ipcRenderer.invoke('ai:update-config', id, config),
    removeConfig: (id: string) => ipcRenderer.invoke('ai:remove-config', id),
    testConfig: (config: any) => ipcRenderer.invoke('ai:test-config', config),
    getModels: (config: any) => ipcRenderer.invoke('ai:get-models', config),
    generatePrompt: (request: any, config: any) => ipcRenderer.invoke('ai:generate-prompt', request, config),    generatePromptStream: (request: any, config: any, onProgress: (charCount: number, partialContent?: string) => boolean) => {
      // 监听流式进度，接收字符数和部分内容
      const progressListener = (_: any, charCount: number, partialContent?: string) => {
        const shouldContinue = onProgress(charCount, partialContent);
        // 如果前端返回false，表示要停止生成
        if (shouldContinue === false) {
          console.log('前端请求停止生成，调用停止API');
          ipcRenderer.invoke('ai:stop-generation').catch(console.error);
        }
      };
      ipcRenderer.on('ai:stream-progress', progressListener);
      
      // 调用流式生成
      const promise = ipcRenderer.invoke('ai:generate-prompt-stream', request, config);
      
      // 清理监听器
      promise.finally(() => {
        ipcRenderer.removeListener('ai:stream-progress', progressListener);
      });
      
      return promise;
    },
    intelligentTest: (config: any) => ipcRenderer.invoke('ai:intelligent-test', config),
    stopGeneration: () => ipcRenderer.invoke('ai:stop-generation'),
  },
  // WebDAV 同步管理
  webdav: {
    testConnection: (config: any) => ipcRenderer.invoke('webdav:test-connection', config),
    syncNow: () => ipcRenderer.invoke('webdav:sync-now'),
    getSyncStatus: () => ipcRenderer.invoke('webdav:get-sync-status'),
    setConfig: (config: any) => ipcRenderer.invoke('webdav:set-config', config),
    getConfig: () => ipcRenderer.invoke('webdav:get-config'),
    encryptPassword: (password: string) => ipcRenderer.invoke('webdav:encrypt-password', password),
    decryptPassword: (encryptedPassword: any) => ipcRenderer.invoke('webdav:decrypt-password', encryptedPassword),
  },
  // 数据管理
  data: {
    createBackup: (description?: string) => ipcRenderer.invoke('data:create-backup', { description }),
    getBackupList: () => ipcRenderer.invoke('data:get-backup-list'),
    restoreBackup: (backupId: string) => ipcRenderer.invoke('data:restore-backup', { backupId }),
    restoreBackupWithReplace: (backupId: string) => ipcRenderer.invoke('data:restore-backup-replace', { backupId }),
    deleteBackup: (backupId: string) => ipcRenderer.invoke('data:delete-backup', { backupId }),
    export: (options: any, exportPath?: string) => ipcRenderer.invoke('data:export', { options, exportPath }),
    import: (filePath: string, options: any) => ipcRenderer.invoke('data:import', { filePath, options }),
    exportSelected: (options: any, exportPath?: string) => ipcRenderer.invoke('data:export-selected', { options, exportPath }),
    exportFullBackup: () => ipcRenderer.invoke('data:export-full-backup'),
    importFullBackup: () => ipcRenderer.invoke('data:import-full-backup'),
    selectImportFile: (format: string) => ipcRenderer.invoke('data:select-import-file', { format }),
    selectExportPath: (defaultName: string) => ipcRenderer.invoke('data:select-export-path', { defaultName }),
    getStats: () => ipcRenderer.invoke('data:get-stats'),
  }
});
