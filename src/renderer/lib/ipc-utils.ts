/**
 * IPC 通信工具函数
 */

declare global {
    interface Window {
        electronAPI: {
            preferences: {
                get: () => Promise<any>;
                set: (prefs: any) => Promise<any>;
                reset: () => Promise<any>;
            };
            theme: {
                setSource: (source: string) => Promise<void>;
            };
            webdav: {
                testConnection: (config: any) => Promise<any>;
                syncNow: () => Promise<any>;
                getSyncStatus: () => Promise<any>;
                setConfig: (config: any) => Promise<void>;
                getConfig: () => Promise<any>;
            };
            data: {
                createBackup: (description?: string) => Promise<any>;
                getBackupList: () => Promise<any>;
                restoreBackup: (backupId: string) => Promise<void>;
                deleteBackup: (backupId: string) => Promise<void>;            export: (options: any, exportPath?: string) => Promise<any>;
            import: (filePath: string, options: any) => Promise<any>;
                selectImportFile: (format: string) => Promise<string | null>;
                selectExportPath: (defaultName: string) => Promise<string | null>;
                getStats: () => Promise<any>;
            };
        };
    }
}

/**
 * 通用的 IPC 调用函数
 * @param channel IPC 通道名称
 * @param data 要发送的数据
 * @returns Promise<T> 返回结果
 */
export async function ipcInvoke<T = any>(channel: string, data?: any): Promise<T> {
    if (typeof window !== 'undefined' && window.electronAPI) {
        // 根据通道名称调用对应的 API
        const [namespace, method] = channel.split(':');
        
        switch (namespace) {
            case 'webdav':
                switch (method) {
                    case 'test-connection':
                        return window.electronAPI.webdav.testConnection(data);
                    case 'sync-now':
                        return window.electronAPI.webdav.syncNow();
                    case 'get-sync-status':
                        return window.electronAPI.webdav.getSyncStatus();
                    case 'set-config':
                        return window.electronAPI.webdav.setConfig(data);
                    case 'get-config':
                        return window.electronAPI.webdav.getConfig();
                }
                break;
            case 'data':
                switch (method) {
                    case 'create-backup':
                        return window.electronAPI.data.createBackup(data?.description);
                    case 'get-backup-list':
                        return window.electronAPI.data.getBackupList();
                    case 'restore-backup':
                        return window.electronAPI.data.restoreBackup(data?.backupId);
                    case 'delete-backup':
                        return window.electronAPI.data.deleteBackup(data?.backupId);
                    case 'export':
                        return window.electronAPI.data.export(data.options, data.exportPath);
                    case 'import':
                        return window.electronAPI.data.import(data?.filePath, data?.options);
                    case 'select-import-file':
                        return window.electronAPI.data.selectImportFile(data?.format);
                    case 'select-export-path':
                        return window.electronAPI.data.selectExportPath(data?.defaultName);
                    case 'get-stats':
                        return window.electronAPI.data.getStats();
                }
                break;
        }
    }
    
    throw new Error(`Unknown IPC channel: ${channel}`);
}
