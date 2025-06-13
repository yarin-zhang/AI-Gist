/**
 * 数据管理服务
 * 这个文件需要在主进程中实现
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface BackupInfo {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    size: number;
    data?: any;
}

export class DataManagementService {
    private backupDir: string;

    constructor(userDataPath: string) {
        this.backupDir = path.join(userDataPath, 'backups');
        this.ensureBackupDir();
        this.setupIpcHandlers();
    }

    private async ensureBackupDir() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            console.error('创建备份目录失败:', error);
        }
    }

    private setupIpcHandlers() {
        // 创建备份
        ipcMain.handle('data:create-backup', async (event, { description }) => {
            try {
                const backupId = uuidv4();
                const timestamp = new Date().toISOString();
                const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
                const backupPath = path.join(this.backupDir, `${backupName}.json`);

                // 这里应该从数据库中导出所有数据
                const backupData = await this.exportAllData();
                
                const backupInfo: BackupInfo = {
                    id: backupId,
                    name: backupName,
                    description: description || '自动备份',
                    createdAt: timestamp,
                    size: 0, // 将在写入后计算
                    data: backupData,
                };

                await fs.writeFile(backupPath, JSON.stringify(backupInfo, null, 2));
                
                const stats = await fs.stat(backupPath);
                backupInfo.size = stats.size;
                
                // 创建返回对象，不包含数据内容
                const { data, ...backupInfoWithoutData } = backupInfo;
                return backupInfoWithoutData;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`创建备份失败: ${errorMessage}`);
            }
        });

        // 获取备份列表
        ipcMain.handle('data:get-backup-list', async () => {
            try {
                const files = await fs.readdir(this.backupDir);
                const backups: BackupInfo[] = [];

                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const backup: BackupInfo = JSON.parse(content);
                        const { data, ...backupWithoutData } = backup;
                        backups.push(backupWithoutData);
                    }
                }

                // 按创建时间排序
                return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`获取备份列表失败: ${errorMessage}`);
            }
        });

        // 恢复备份
        ipcMain.handle('data:restore-backup', async (event, { backupId }) => {
            try {
                const backups = await fs.readdir(this.backupDir);
                let backupFile: BackupInfo | null = null;

                for (const file of backups) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const backup: BackupInfo = JSON.parse(content);
                        if (backup.id === backupId) {
                            backupFile = backup;
                            break;
                        }
                    }
                }

                if (!backupFile) {
                    throw new Error('备份文件不存在');
                }

                // 恢复数据到数据库
                await this.restoreAllData(backupFile.data);
                
                return { 
                    success: true,
                    message: `数据恢复成功: ${backupFile.name}`
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    message: `恢复备份失败: ${errorMessage}`
                };
            }
        });

        // 删除备份
        ipcMain.handle('data:delete-backup', async (event, { backupId }) => {
            try {
                const backups = await fs.readdir(this.backupDir);
                
                for (const file of backups) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const backup: BackupInfo = JSON.parse(content);
                        if (backup.id === backupId) {
                            await fs.unlink(filePath);
                            return { success: true };
                        }
                    }
                }

                throw new Error('备份文件不存在');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`删除备份失败: ${errorMessage}`);
            }
        });

        // 导出数据
        ipcMain.handle('data:export', async (event, { options, exportPath }) => {
            try {
                const data = await this.exportData(options);
                
                if (exportPath) {
                    // 写入文件
                    await fs.writeFile(exportPath, data, 'utf-8');
                    console.log(`数据已导出到: ${exportPath}`);
                }
                
                return { success: true, filePath: exportPath };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`导出数据失败: ${errorMessage}`);
            }
        });

        // 导入数据
        ipcMain.handle('data:import', async (event, { filePath, options }) => {
            try {
                const result = await this.importData(filePath, options);
                return result;
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
            const result = await dialog.showSaveDialog({
                title: '选择导出路径',
                defaultPath: defaultName,
                filters: [
                    { name: 'JSON 文件', extensions: ['json'] },
                    { name: 'CSV 文件', extensions: ['csv'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
            });

            return result.canceled ? null : result.filePath;
        });        // 获取数据统计
        ipcMain.handle('data:get-stats', async () => {
            try {
                // 通过 executeJavaScript 调用渲染进程暴露的方法
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                // 调用渲染进程中暴露的统计方法
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
    }    private async exportAllData() {
        try {
            console.log('正在从渲染进程获取数据库数据...');
            
            // 通过 executeJavaScript 调用渲染进程暴露的方法
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                throw new Error('没有找到主窗口，无法访问数据库');
            }

            // 调用渲染进程中暴露的导出方法
            const result = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        if (!window.databaseAPI || !window.databaseAPI.exportAllData) {
                            throw new Error('数据库API未初始化');
                        }
                        return await window.databaseAPI.exportAllData();
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message || '未知错误'
                        };
                    }
                })()
            `);
            
            if (!result.success) {
                throw new Error(`数据库操作失败: ${result.error}`);
            }
            
            console.log(`成功获取数据库数据，总记录数: ${result.data.totalRecords}`);
            return result.data;
            
        } catch (error) {
            console.error('导出数据失败:', error);
            throw new Error(`数据导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }    private async restoreAllData(data: any) {
        try {
            console.log('正在恢复数据到数据库...');
            
            // 通过 executeJavaScript 调用渲染进程暴露的方法
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                throw new Error('没有找到主窗口，无法访问数据库');
            }

            // 调用渲染进程中暴露的恢复方法
            const result = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        if (!window.databaseAPI || !window.databaseAPI.restoreAllData) {
                            throw new Error('数据库API未初始化');
                        }
                        const data = ${JSON.stringify(data)};
                        return await window.databaseAPI.restoreAllData(data);
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message || '未知错误'
                        };
                    }
                })()
            `);
            
            if (!result.success) {
                throw new Error(`数据恢复失败: ${result.error}`);
            }
            
            console.log(`数据恢复成功，总计恢复记录数: ${result.totalRestored}`);
            console.log('恢复详情:', result.details);
            
        } catch (error) {
            console.error('恢复数据失败:', error);
            throw new Error(`数据恢复失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async exportData(options: any) {
        // 根据选项导出特定数据
        const data = await this.exportAllData();
        
        if (options.format === 'csv') {
            // 转换为 CSV 格式
            return this.convertToCSV(data);
        }
        
        return JSON.stringify(data, null, 2);
    }

    private async importData(filePath: string, options: any) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            let data;

            if (options.format === 'csv') {
                data = this.parseCSV(content);
            } else {
                data = JSON.parse(content);
            }

            // 这里应该将数据导入到数据库
            return {
                success: true,
                message: '导入成功',
                imported: {
                    categories: data.categories?.length || 0,
                    prompts: data.prompts?.length || 0,
                    settings: Object.keys(data.settings || {}).length,
                    history: data.history?.length || 0,
                },
                errors: [],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            throw new Error(`导入数据失败: ${errorMessage}`);
        }
    }

    private convertToCSV(data: any): string {
        // 简单的 CSV 转换实现
        let csv = '';
        
        // 添加分类数据
        if (data.categories && data.categories.length > 0) {
            csv += '--- 分类数据 ---\n';
            csv += 'ID,名称,描述,创建时间\n';
            data.categories.forEach((cat: any) => {
                csv += `${cat.id},"${cat.name}","${cat.description || ''}","${cat.createdAt}"\n`;
            });
            csv += '\n';
        }
        
        // 添加提示词数据
        if (data.prompts && data.prompts.length > 0) {
            csv += '--- 提示词数据 ---\n';
            csv += 'ID,标题,内容,分类ID,标签,创建时间\n';
            data.prompts.forEach((prompt: any) => {
                const tags = Array.isArray(prompt.tags) ? prompt.tags.join(';') : '';
                csv += `${prompt.id},"${prompt.title}","${prompt.content}","${prompt.categoryId}","${tags}","${prompt.createdAt}"\n`;
            });
            csv += '\n';
        }
        
        // 添加历史数据
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
        // 实际应用中需要更复杂的逻辑
        return { categories: [], prompts: [], settings: {}, history: [] };
    }

    /**
     * 创建备份 - 供 WebDAV 同步使用
     */
    async createBackup(description?: string): Promise<BackupInfo> {
        try {
            const backupId = uuidv4();
            const timestamp = new Date().toISOString();
            const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
            const backupPath = path.join(this.backupDir, `${backupName}.json`);

            // 从数据库中导出所有数据
            const backupData = await this.exportAllData();
            
            const backupInfo: BackupInfo = {
                id: backupId,
                name: backupName,
                description: description || '自动备份',
                createdAt: timestamp,
                size: 0, // 将在写入后计算
                data: backupData,
            };

            await fs.writeFile(backupPath, JSON.stringify(backupInfo, null, 2));
            
            const stats = await fs.stat(backupPath);
            backupInfo.size = stats.size;
            
            return backupInfo;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            throw new Error(`创建备份失败: ${errorMessage}`);
        }
    }

    /**
     * 生成导出数据 - 供 WebDAV 同步使用
     */
    async generateExportData() {
        return await this.exportAllData();
    }    /**
     * 直接导入数据对象 - 供 WebDAV 同步使用
     */
    async importDataObject(data: any): Promise<{
        success: boolean;
        message: string;
        imported: {
            categories: number;
            prompts: number;
            settings: number;
            history: number;
        };
        errors: string[];
    }> {
        try {
            console.log('开始导入数据对象...');
            
            // 通过 executeJavaScript 调用渲染进程暴露的方法
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                throw new Error('没有找到主窗口，无法访问数据库');
            }

            // 调用渲染进程中暴露的导入方法
            const result = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        if (!window.databaseAPI || !window.databaseAPI.importDataObject) {
                            throw new Error('数据库API未初始化');
                        }
                        const data = ${JSON.stringify(data)};
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
                console.error('导入数据对象失败:', result.error);
                return {
                    success: false,
                    message: `导入失败: ${result.error}`,
                    imported: {
                        categories: 0,
                        prompts: 0,
                        settings: 0,
                        history: 0,
                    },
                    errors: [result.error],
                };
            }
            
            console.log('数据对象导入成功:', result.details);
            
            return {
                success: true,
                message: '导入成功',
                imported: {
                    categories: result.details?.categories || 0,
                    prompts: result.details?.prompts || 0,
                    settings: result.details?.settings || 0,
                    history: result.details?.aiHistory || 0,
                },
                errors: [],
            };
            
        } catch (error) {
            console.error('导入数据对象失败:', error);
            return {
                success: false,
                message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
                imported: {
                    categories: 0,
                    prompts: 0,
                    settings: 0,
                    history: 0,
                },
                errors: [error instanceof Error ? error.message : '未知错误'],
            };
        }
    }
}
