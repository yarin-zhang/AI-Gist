import { PlatformDetector } from '@shared/platform';
import { preferencesClient } from './preferences';
import { webAIService } from '../services/web-ai.service';
import { webCloudBackupService } from '../services/web-cloud-backup.service';

export function installWebRuntimeBridge(): void {
  if (!PlatformDetector.isWeb() || typeof window === 'undefined') {
    return;
  }

  const existing = (window as any).electronAPI || {};

  (window as any).electronAPI = {
    ...existing,
    sendMessage: (message: string) => console.debug('[WebRuntimeBridge]', message),
    preferences: {
      get: () => preferencesClient.get(),
      set: (prefs: any) => preferencesClient.set(prefs),
      reset: () => preferencesClient.reset()
    },
    app: {
      getVersion: async () => __APP_VERSION__,
      getPath: async () => '',
      checkUpdates: async () => ({ success: false, error: 'Web 端不支持 Electron 更新检查' }),
      openDownloadPage: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return { success: true };
      },
      onUpdateAvailable: () => () => undefined
    },
    shell: {
      openPath: async () => ({ success: false, error: 'Web 端没有可打开的系统路径' }),
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return { success: true };
      }
    },
    ai: {
      getConfigs: async () => [],
      getEnabledConfigs: async () => [],
      addConfig: async (config: any) => config,
      updateConfig: async (_id: string, config: any) => config,
      removeConfig: async () => false,
      testConfig: (config: any) => webAIService.testConfig(config),
      testModel: (config: any, model: string) => webAIService.testModel(config, model),
      getModels: (config: any) => webAIService.getModels(config),
      generatePrompt: (request: any, config: any) => webAIService.generatePrompt(request, config),
      generatePromptStream: (request: any, config: any, onProgress: any) =>
        webAIService.generatePromptStream(request, config, onProgress),
      intelligentTest: (config: any) => webAIService.intelligentTest(config),
      stopGeneration: () => webAIService.stopGeneration(),
      debugPrompt: (prompt: string, config: any) => webAIService.debugPrompt(prompt, config)
    },
    cloud: {
      checkICloudAvailability: () => webCloudBackupService.isICloudAvailable(),
      getStorageConfigs: () => webCloudBackupService.getStorageConfigs(),
      addStorageConfig: (config: any) => webCloudBackupService.addStorageConfig(config),
      updateStorageConfig: (id: string, config: any) => webCloudBackupService.updateStorageConfig(id, config),
      deleteStorageConfig: (id: string) => webCloudBackupService.deleteStorageConfig(id),
      testStorageConnection: (config: any) => webCloudBackupService.testStorageConnection(config),
      getBackupList: (storageId: string) => webCloudBackupService.getCloudBackupList(storageId),
      createBackup: (storageId: string, options?: any) =>
        webCloudBackupService.createCloudBackup(storageId, typeof options === 'string' ? { description: options } : options),
      restoreBackup: (storageId: string, backupId: string) =>
        webCloudBackupService.restoreCloudBackup(storageId, backupId),
      deleteBackup: (storageId: string, backupId: string) =>
        webCloudBackupService.deleteCloudBackup(storageId, backupId),
      getSyncManifest: (storageId: string) => webCloudBackupService.getCloudSyncManifest(storageId),
      saveSyncManifest: (storageId: string, manifest: any, options?: any) =>
        webCloudBackupService.saveCloudSyncManifest(storageId, manifest, options),
      listSyncSnapshots: (storageId: string) => webCloudBackupService.listCloudSyncSnapshots(storageId)
        .then(snapshots => ({ success: true, snapshots }))
        .catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) })),
      readSyncSnapshot: (storageId: string, snapshot: any) => webCloudBackupService.readCloudSyncSnapshot(storageId, snapshot)
        .then(snapshotData => ({ success: true, snapshot: snapshotData }))
        .catch(error => ({ success: false, error: error instanceof Error ? error.message : String(error) })),
      saveSyncSnapshot: (storageId: string, snapshot: any) =>
        webCloudBackupService.saveCloudSyncSnapshot(storageId, snapshot),
      deleteSyncSnapshot: (storageId: string, snapshot: any) =>
        webCloudBackupService.deleteCloudSyncSnapshot(storageId, snapshot)
    }
  };
}
