import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
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
  // 数据管理
  data: {
    createBackup: (description?: string, data?: any) => ipcRenderer.invoke('data:create-backup', { description, data }),
    getBackupList: () => ipcRenderer.invoke('data:get-backup-list'),
    readBackup: (backupId: string) => ipcRenderer.invoke('data:read-backup', { backupId }),
    deleteBackup: (backupId: string) => ipcRenderer.invoke('data:delete-backup', { backupId }),
    selectImportFile: (format: string) => ipcRenderer.invoke('data:select-import-file', { format }),
    selectExportPath: (defaultName: string) => ipcRenderer.invoke('data:select-export-path', { defaultName }),
    getStats: () => ipcRenderer.invoke('data:get-stats'),
    getBackupDirectory: () => ipcRenderer.invoke('data:get-backup-directory'),
  },
  // 文件操作
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', { filePath }),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', { filePath, content }),
  },
  // 云端备份功能
  cloud: {
    checkICloudAvailability: () => ipcRenderer.invoke('cloud:check-icloud-availability'),
    getStorageConfigs: () => ipcRenderer.invoke('cloud:get-storage-configs'),
    addStorageConfig: (config: any) => ipcRenderer.invoke('cloud:add-storage-config', config),
    updateStorageConfig: (id: string, config: any) => ipcRenderer.invoke('cloud:update-storage-config', id, config),
    deleteStorageConfig: (id: string) => ipcRenderer.invoke('cloud:delete-storage-config', id),
    testStorageConnection: (config: any) => ipcRenderer.invoke('cloud:test-storage-connection', config),
    getBackupList: (storageId: string) => ipcRenderer.invoke('cloud:get-backup-list', storageId),
    createBackup: (storageId: string, description?: string) => ipcRenderer.invoke('cloud:create-backup', storageId, description),
    restoreBackup: (storageId: string, backupId: string) => ipcRenderer.invoke('cloud:restore-backup', storageId, backupId),
    deleteBackup: (storageId: string, backupId: string) => ipcRenderer.invoke('cloud:delete-backup', storageId, backupId),
  },
  // 应用信息和更新
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
    openDownloadPage: (url: string) => ipcRenderer.invoke('app:open-download-page', url),
    onUpdateAvailable: (callback: (updateInfo: any) => void) => {
      const listener = (_: any, updateInfo: any) => callback(updateInfo);
      ipcRenderer.on('update-available', listener);
      // 返回移除监听器的函数
      return () => ipcRenderer.removeListener('update-available', listener);
    }
  },
  // Shell 功能
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  }
});
