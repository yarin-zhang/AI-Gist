/**
 * 数据管理服务 - 简化版
 * 只负责基本的文件读写操作，复杂逻辑移到 Vue composables 中
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  BackupInfo, 
  ExportOptions, 
  ImportOptions, 
  ImportResult,
  ExportResult,
  DataStats 
} from '@shared/types/data-management';

export class DataManagementService {
    private backupDir: string;

    constructor(userDataPath: string) {
        console.log('DataManagementService: 正在初始化...');
        this.backupDir = path.join(userDataPath, 'backups');
        this.ensureBackupDir();
        this.setupIpcHandlers();
        console.log('DataManagementService: 初始化完成');
    }

    private async ensureBackupDir() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            console.error('创建备份目录失败:', error);
        }
    }

    private setupIpcHandlers() {
        console.log('DataManagementService: 开始注册IPC处理程序...');

        // 获取备份列表 - 只读取文件列表
        ipcMain.handle('data:get-backup-list', async () => {
            try {
                await this.ensureBackupDir();
                
                const files = await fs.readdir(this.backupDir);
                const backups: BackupInfo[] = [];
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf-8');
                            const backup: BackupInfo = JSON.parse(content);
                            
                            if (!backup.id || !backup.name || !backup.createdAt) {
                                console.warn(`备份文件 ${file} 缺少必要字段, 跳过`);
                                continue;
                            }
                            
                            const { data, ...backupWithoutData } = backup;
                            backups.push(backupWithoutData);
                        } catch (fileError) {
                            console.error(`读取备份文件 ${file} 失败:`, fileError);
                        }
                    }
                }

                const sortedBackups = backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                console.log(`返回 ${sortedBackups.length} 个有效备份`);
                return sortedBackups;
            } catch (error) {
                console.error('获取备份列表失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`获取备份列表失败: ${errorMessage}`);
            }
        });

        // 创建备份 - 只负责文件写入
        ipcMain.handle('data:create-backup', async (event, { description, data }) => {
            try {
                const backupId = uuidv4();
                const timestamp = new Date().toISOString();
                const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
                const backupPath = path.join(this.backupDir, `${backupName}.json`);

                const backupInfo: BackupInfo = {
                    id: backupId,
                    name: backupName,
                    description: description || '自动备份',
                    createdAt: timestamp,
                    size: 0,
                    data: data,
                };

                await fs.writeFile(backupPath, JSON.stringify(backupInfo, null, 2));
                
                const stats = await fs.stat(backupPath);
                backupInfo.size = stats.size;
                
                const { data: _, ...backupInfoWithoutData } = backupInfo;
                return backupInfoWithoutData;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`创建备份失败: ${errorMessage}`);
            }
        });

        // 读取备份文件 - 只负责文件读取
        ipcMain.handle('data:read-backup', async (event, { backupId }) => {
            try {
                const files = await fs.readdir(this.backupDir);
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf-8');
                            const backup: BackupInfo = JSON.parse(content);
                            
                            if (backup.id === backupId) {
                                return backup;
                            }
                        } catch (fileError) {
                            console.error(`读取备份文件失败 ${file}:`, fileError);
                        }
                    }
                }

                throw new Error(`备份文件不存在 (ID: ${backupId})`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`读取备份失败: ${errorMessage}`);
            }
        });

        // 删除备份文件 - 只负责文件删除
        ipcMain.handle('data:delete-backup', async (event, { backupId }) => {
            try {
                const files = await fs.readdir(this.backupDir);
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf-8');
                            const backup: BackupInfo = JSON.parse(content);
                            
                            if (backup.id === backupId) {
                                await fs.unlink(filePath);
                                return { success: true };
                            }
                        } catch (fileError) {
                            console.error(`读取备份文件失败 ${file}:`, fileError);
                        }
                    }
                }

                throw new Error(`备份文件不存在 (ID: ${backupId})`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`删除备份失败: ${errorMessage}`);
            }
        });

        // 获取数据统计 - 通过渲染进程获取
        ipcMain.handle('data:get-stats', async () => {
            try {
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                const result = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (!window.databaseAPI || !window.databaseAPI.getStats) {
                                throw new Error('数据库API未初始化');
                            }
                            return await window.databaseAPI.getStats();
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message || '未知错误'
                            };
                        }
                    })()
                `);
                
                if (!result.success) {
                    throw new Error(`获取数据统计失败: ${result.error}`);
                }
                
                return result.stats;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`获取数据统计失败: ${errorMessage}`);
            }
        });

        // 导出数据 - 通过渲染进程获取数据后写入文件
        ipcMain.handle('data:export-data', async (event, { options, exportPath }) => {
            try {
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                // 从渲染进程获取数据
                const exportResult = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (!window.databaseAPI || !window.databaseAPI.databaseServiceManager) {
                                throw new Error('数据库API未初始化');
                            }
                            
                            const databaseServiceManager = window.databaseAPI.databaseServiceManager;
                            return await databaseServiceManager.exportAllData();
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message || '未知错误'
                            };
                        }
                    })()
                `);

                if (!exportResult.success) {
                    throw new Error(`获取数据失败: ${exportResult.error}`);
                }

                // 根据选项过滤数据
                const filteredData: any = {};
                if (options.includeCategories && exportResult.data.categories) {
                    filteredData.categories = exportResult.data.categories;
                }
                if (options.includePrompts && exportResult.data.prompts) {
                    filteredData.prompts = exportResult.data.prompts;
                }
                if (options.includeAIConfigs && exportResult.data.aiConfigs) {
                    filteredData.aiConfigs = exportResult.data.aiConfigs;
                }

                // 生成文件名
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const selectedTypes: string[] = [];
                if (options.includeCategories) selectedTypes.push('分类');
                if (options.includePrompts) selectedTypes.push('提示词');
                if (options.includeAIConfigs) selectedTypes.push('AI配置');
                
                const fileName = `AI-Gist-选择性导出-${selectedTypes.join('_')}-${timestamp}.${options.format}`;
                
                // 如果没有提供导出路径，则显示保存对话框
                let finalExportPath = exportPath;
                if (!finalExportPath) {
                    const result = await dialog.showSaveDialog({
                        title: '选择导出位置',
                        defaultPath: fileName,
                        filters: [
                            { name: options.format.toUpperCase() + ' 文件', extensions: [options.format] },
                            { name: '所有文件', extensions: ['*'] }
                        ]
                    });
                    
                    if (result.canceled) {
                        return { success: false, message: '用户取消了导出操作' };
                    }
                    
                    finalExportPath = result.filePath;
                }

                // 根据格式导出数据
                let exportContent: string;
                if (options.format === 'json') {
                    exportContent = JSON.stringify(filteredData, null, 2);
                } else if (options.format === 'csv') {
                    exportContent = this.convertToCSV(filteredData);
                } else {
                    throw new Error(`不支持的导出格式: ${options.format}`);
                }

                // 写入文件
                await fs.writeFile(finalExportPath!, exportContent, 'utf-8');
                
                return {
                    success: true,
                    filePath: finalExportPath,
                    message: `数据已成功导出到 ${finalExportPath}`
                };
                
            } catch (error) {
                console.error('数据导出失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    error: errorMessage,
                    message: `数据导出失败: ${errorMessage}`
                };
            }
        });

        // 导入数据 - 读取文件后传递给渲染进程，或直接传递数据
        ipcMain.handle('data:import-data', async (event, { filePath, data, options }) => {
            try {
                let importData;

                if (data) {
                    // 直接传递数据
                    importData = data;
                } else if (filePath) {
                    // 从文件读取数据
                    const content = await fs.readFile(filePath, 'utf-8');
                    if (options.format === 'csv') {
                        importData = this.parseCSV(content);
                    } else {
                        importData = JSON.parse(content);
                    }
                } else {
                    throw new Error('必须提供 filePath 或 data 参数');
                }

                // 传递给渲染进程处理
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                const result = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (!window.databaseAPI || !window.databaseAPI.importDataObject) {
                                throw new Error('数据库API未初始化');
                            }
                            const data = ${JSON.stringify(importData)};
                            return await window.databaseAPI.importDataObject(data);
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message || '未知错误'
                            };
                        }
                    })()
                `);

                if (!result.success) {
                    throw new Error(`导入数据失败: ${result.error}`);
                }

                return {
                    success: true,
                    message: '导入成功',
                    imported: result.details
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`导入数据失败: ${errorMessage}`);
            }
        });

        // 选择导入文件
        ipcMain.handle('data:select-import-file', async (event, { format }) => {
            const result = await dialog.showOpenDialog({
                title: '选择导入文件',
                filters: [
                    { name: `${format.toUpperCase()} 文件`, extensions: [format] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });

            return result.canceled ? null : result.filePaths[0];
        });

        // 选择导出路径
        ipcMain.handle('data:select-export-path', async (event, { defaultName }) => {
            const fileExtension = defaultName.split('.').pop()?.toLowerCase();
            let filters;
            
            if (fileExtension === 'csv') {
                filters = [
                    { name: 'CSV 文件', extensions: ['csv'] },
                    { name: '所有文件', extensions: ['*'] },
                ];
            } else if (fileExtension === 'json') {
                filters = [
                    { name: 'JSON 文件', extensions: ['json'] },
                    { name: '所有文件', extensions: ['*'] },
                ];
            } else {
                filters = [
                    { name: 'CSV 文件', extensions: ['csv'] },
                    { name: 'JSON 文件', extensions: ['json'] },
                    { name: '所有文件', extensions: ['*'] },
                ];
            }
            
            const result = await dialog.showSaveDialog({
                title: '选择导出路径',
                defaultPath: defaultName,
                filters: filters,
            });

            return result.canceled ? null : result.filePath;
        });

        // 获取备份目录路径
        ipcMain.handle('data:get-backup-directory', async () => {
            try {
                return {
                    success: true,
                    path: this.backupDir
                };
            } catch (error) {
                console.error('获取备份目录路径失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    error: errorMessage,
                    message: `获取备份目录路径失败: ${errorMessage}`
                };
            }
        });

        console.log('DataManagementService: 所有IPC处理程序注册完成');
    }

    /**
     * 统一处理 tags 字段转换
     */
    private normalizeTags(tags: any, separator = ';'): string {
        if (!tags) return '';
        
        if (Array.isArray(tags)) {
            return tags.join(separator);
        } else if (typeof tags === 'string') {
            return tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag).join(separator);
        }
        
        return '';
    }

    private convertToCSV(data: any): string {
        let csv = '';
        
        if (data.categories && data.categories.length > 0) {
            csv += '--- 分类数据 ---\n';
            csv += 'ID,名称,描述,创建时间\n';
            data.categories.forEach((cat: any) => {
                csv += `${cat.id},"${cat.name}","${cat.description || ''}","${cat.createdAt}"\n`;
            });
            csv += '\n';
        }
        
        if (data.prompts && data.prompts.length > 0) {
            csv += '--- 提示词数据 ---\n';
            csv += 'ID,标题,内容,分类ID,标签,创建时间\n';
            data.prompts.forEach((prompt: any) => {
                csv += `${prompt.id},"${prompt.title}","${prompt.content}","${prompt.categoryId}","${this.normalizeTags(prompt.tags)}","${prompt.createdAt}"\n`;
            });
            csv += '\n';
        }
        
        if (data.history && data.history.length > 0) {
            csv += '--- 历史数据 ---\n';
            csv += 'ID,提示词ID,输入,输出,时间戳\n';
            data.history.forEach((hist: any) => {
                csv += `${hist.id},"${hist.promptId}","${hist.input}","${hist.output}","${hist.timestamp}"\n`;
            });
        }
        
        return csv;
    }

    private parseCSV(content: string): any {
        // 简单的 CSV 解析实现
        return { categories: [], prompts: [], settings: {}, history: [] };
    }
}
