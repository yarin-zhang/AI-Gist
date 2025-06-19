/**
 * 数据管理服务
 * 这个文件需要在主进程中实现
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as archiver from 'archiver';
import * as unzipper from 'unzipper';

interface BackupInfo {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    size: number;
    data?: any;
}

interface ExportOptions {
    includePrompts?: boolean;
    includeCategories?: boolean;
    includeAIConfigs?: boolean;
    includeHistory?: boolean;
    includeSettings?: boolean;
}

interface DataStats {
    categories: number;
    prompts: number;
    history: number;
    aiConfigs: number;
    settings: number;
    posts: number;
    users: number;
    totalRecords: number;
}

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
                // 确保备份目录存在
                await this.ensureBackupDir();
                
                const files = await fs.readdir(this.backupDir);
                const backups: BackupInfo[] = [];
                
                console.log(`备份目录中有 ${files.length} 个文件:`, files);

                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf-8');
                            const backup: BackupInfo = JSON.parse(content);
                            
                            // 验证备份文件的必要字段
                            if (!backup.id || !backup.name || !backup.createdAt) {
                                console.warn(`备份文件 ${file} 缺少必要字段, 跳过`);
                                continue;
                            }
                            
                            const { data, ...backupWithoutData } = backup;
                            backups.push(backupWithoutData);
                            console.log(`成功加载备份: ${backup.name} (ID: ${backup.id})`);
                        } catch (fileError) {
                            console.error(`读取备份文件 ${file} 失败:`, fileError);
                            // 继续处理其他文件
                        }
                    }
                }

                // 按创建时间排序
                const sortedBackups = backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                console.log(`返回 ${sortedBackups.length} 个有效备份`);
                return sortedBackups;
            } catch (error) {
                console.error('获取备份列表失败:', error);
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

        // 恢复备份（完全替换现有数据）
        ipcMain.handle('data:restore-backup-replace', async (event, { backupId }) => {
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

                // 使用替换模式恢复数据到数据库
                await this.restoreAllDataWithReplace(backupFile.data);
                
                return { 
                    success: true,
                    message: `数据完全恢复成功: ${backupFile.name}`
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
                console.log(`尝试删除备份: ${backupId}`);
                console.log(`备份目录: ${this.backupDir}`);
                
                // 检查备份目录是否存在
                try {
                    await fs.access(this.backupDir);
                } catch (error) {
                    console.error('备份目录不存在:', this.backupDir);
                    throw new Error('备份目录不存在');
                }
                
                const backups = await fs.readdir(this.backupDir);
                console.log(`找到 ${backups.length} 个文件:`, backups);
                
                let foundBackup = false;
                
                for (const file of backups) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.backupDir, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf-8');
                            const backup: BackupInfo = JSON.parse(content);
                            console.log(`检查备份文件 ${file}, ID: ${backup.id}`);
                            
                            if (backup.id === backupId) {
                                foundBackup = true;
                                console.log(`找到匹配的备份文件: ${file}, 开始删除`);
                                await fs.unlink(filePath);
                                console.log(`成功删除备份文件: ${file}`);
                                return { success: true };
                            }
                        } catch (fileError) {
                            console.error(`读取或解析备份文件失败 ${file}:`, fileError);
                            // 继续处理其他文件，不抛出错误
                        }
                    }
                }

                if (!foundBackup) {
                    console.error(`未找到 ID 为 ${backupId} 的备份文件`);
                    throw new Error(`备份文件不存在 (ID: ${backupId})`);
                }
                
                return { success: true };
            } catch (error) {
                console.error('删除备份时发生错误:', error);
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

            return result.canceled ? null : result.filePath;        });        // 获取数据统计
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
                
                console.log('数据统计结果:', result);
                
                if (!result.success) {
                    throw new Error(`获取数据统计失败: ${result.error}`);
                }
                
                // 返回统计数据，确保包含所有必需字段
                const stats = result.stats || {};
                return {
                    categories: stats.categories || 0,
                    prompts: stats.prompts || 0,
                    history: stats.history || 0,
                    aiConfigs: stats.aiConfigs || 0,
                    settings: stats.settings || 0,
                    posts: 0, // 暂时没有这个数据
                    users: 0, // 暂时没有这个数据
                    totalRecords: stats.totalRecords || 0
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`获取数据统计失败: ${errorMessage}`);
            }
        });

        // 选择性数据导出
        console.log('DataManagementService: 注册 data:export-selected 处理程序');
        ipcMain.handle('data:export-selected', async (event, { options, exportPath }) => {
            try {
                console.log('开始选择性数据导出:', options);
                
                // 通过 executeJavaScript 调用渲染进程暴露的方法获取数据
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                // 调用渲染进程导出数据
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
                    const { dialog } = await import('electron');
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
                    // 简单的CSV导出（仅支持提示词数据）
                    if (options.includePrompts && filteredData.prompts) {
                        const prompts = filteredData.prompts;
                        const csvHeaders = ['ID', '标题', '内容', '标签', '创建时间'];
                        const csvRows = [csvHeaders.join(',')];
                        
                        prompts.forEach((prompt: any) => {
                            const row = [
                                prompt.id || '',
                                `"${(prompt.title || '').replace(/"/g, '""')}"`,
                                `"${(prompt.content || '').replace(/"/g, '""')}"`,
                                `"${(prompt.tags || []).join(';')}"`,
                                prompt.createdAt || ''
                            ];
                            csvRows.push(row.join(','));
                        });
                        
                        exportContent = csvRows.join('\n');
                    } else {
                        throw new Error('CSV 格式目前仅支持导出提示词数据');
                    }
                } else {
                    throw new Error(`不支持的导出格式: ${options.format}`);
                }

                // 写入文件
                const fs = await import('fs').then(m => m.promises);
                await fs.writeFile(finalExportPath!, exportContent, 'utf-8');
                
                console.log(`选择性数据已导出到: ${finalExportPath}`);
                
                return {
                    success: true,
                    filePath: finalExportPath,
                    message: `数据已成功导出到 ${finalExportPath}`
                };
                
            } catch (error) {
                console.error('选择性数据导出失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    error: errorMessage,
                    message: `选择性数据导出失败: ${errorMessage}`
                };
            }
        });

        // 导出完整备份
        ipcMain.handle('data:export-full-backup', async () => {
            try {
                console.log('开始导出完整备份...');
                
                // 通过 executeJavaScript 调用渲染进程暴露的方法
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                // 调用渲染进程导出数据
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

                // 添加备份元数据
                const backupData = {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    appName: 'AI-Gist',
                    ...exportResult.data
                };

                // 生成文件名
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const fileName = `AI-Gist-完整备份-${timestamp}.json`;
                
                // 显示保存对话框
                const { dialog } = await import('electron');
                const result = await dialog.showSaveDialog({
                    title: '选择完整备份导出位置',
                    defaultPath: fileName,
                    filters: [
                        { name: 'JSON 文件', extensions: ['json'] },
                        { name: '所有文件', extensions: ['*'] }
                    ]
                });
                
                if (result.canceled) {
                    return { success: false, message: '用户取消了导出操作' };
                }

                // 写入文件
                const fs = await import('fs').then(m => m.promises);
                await fs.writeFile(result.filePath!, JSON.stringify(backupData, null, 2), 'utf-8');
                
                console.log(`完整备份已导出到: ${result.filePath}`);
                
                return {
                    success: true,
                    filePath: result.filePath,
                    message: `完整备份已成功导出到 ${result.filePath}`
                };
                
            } catch (error) {
                console.error('完整备份导出失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    error: errorMessage,
                    message: `完整备份导出失败: ${errorMessage}`
                };
            }
        });

        // 导入完整备份
        ipcMain.handle('data:import-full-backup', async () => {
            try {
                console.log('开始导入完整备份...');
                
                // 显示文件选择对话框
                const { dialog } = await import('electron');
                const result = await dialog.showOpenDialog({
                    title: '选择要导入的完整备份文件',
                    filters: [
                        { name: 'JSON 文件', extensions: ['json'] },
                        { name: '所有文件', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });
                
                if (result.canceled || !result.filePaths.length) {
                    return { success: false, message: '用户取消了导入操作' };
                }

                const filePath = result.filePaths[0];
                
                // 读取文件
                const fs = await import('fs').then(m => m.promises);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                
                let backupData;
                try {
                    backupData = JSON.parse(fileContent);
                } catch (error) {
                    throw new Error('备份文件格式无效，请确保是有效的 JSON 文件');
                }

                // 验证备份数据结构
                if (!backupData || typeof backupData !== 'object') {
                    throw new Error('备份文件数据结构无效');
                }

                // 通过 executeJavaScript 调用渲染进程暴露的方法
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (!mainWindow) {
                    throw new Error('没有找到主窗口，无法访问数据库');
                }

                // 调用渲染进程导入数据
                const importResult = await mainWindow.webContents.executeJavaScript(`
                    (async () => {
                        try {
                            if (!window.databaseAPI || !window.databaseAPI.databaseServiceManager) {
                                throw new Error('数据库API未初始化');
                            }
                            
                            const databaseServiceManager = window.databaseAPI.databaseServiceManager;
                            return await databaseServiceManager.replaceAllData(${JSON.stringify(backupData)});
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message || '未知错误'
                            };
                        }
                    })()
                `);

                if (!importResult.success) {
                    throw new Error(`导入数据失败: ${importResult.error}`);
                }
                
                console.log('完整备份导入成功');
                
                return {
                    success: true,
                    message: '完整备份导入成功，数据已完全替换'
                };
                
            } catch (error) {
                console.error('完整备份导入失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    error: errorMessage,
                    message: `完整备份导入失败: ${errorMessage}`
                };
            }
        });
        console.log('DataManagementService: 所有IPC处理程序注册完成');
    }    private async exportAllData() {
        try {
            console.log('正在从渲染进程获取数据库数据...');
            
            // 通过 executeJavaScript 调用渲染进程暴露的方法
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                throw new Error('没有找到主窗口，无法访问数据库');
            }

            // 首先检查数据库健康状态并尝试修复
            console.log('正在检查数据库健康状态...');
            const healthCheckResult = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        if (!window.databaseAPI || !window.databaseAPI.databaseServiceManager) {
                            throw new Error('数据库API未初始化');
                        }
                        
                        const databaseServiceManager = window.databaseAPI.databaseServiceManager;
                        return await databaseServiceManager.checkAndRepairDatabase();
                    } catch (error) {
                        return {
                            healthy: false,
                            repaired: false,
                            message: error.message || '未知错误'
                        };
                    }
                })()
            `);

            if (!healthCheckResult.healthy) {
                console.error('数据库健康检查失败:', healthCheckResult.message);
                throw new Error(`数据库异常: ${healthCheckResult.message}`);
            }

            if (healthCheckResult.repaired) {
                console.log('数据库已修复:', healthCheckResult.message);
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
                        if (!window.databaseAPI || !window.databaseAPI.restoreData) {
                            throw new Error('数据库API未初始化');
                        }
                        const data = ${JSON.stringify(data)};
                        return await window.databaseAPI.restoreData(data);
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

    private async restoreAllDataWithReplace(data: any) {
        try {
            console.log('正在完全替换数据库数据...');
            
            // 通过 executeJavaScript 调用渲染进程暴露的方法
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                throw new Error('没有找到主窗口，无法访问数据库');
            }

            // 调用渲染进程中暴露的替换恢复方法
            const result = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        if (!window.databaseAPI || !window.databaseAPI.replaceAllData) {
                            throw new Error('数据库API未初始化或不支持完全替换');
                        }
                        const data = ${JSON.stringify(data)};
                        return await window.databaseAPI.replaceAllData(data);
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message || '未知错误'
                        };
                    }
                })()
            `);
            
            if (!result.success) {
                throw new Error(`数据替换失败: ${result.error}`);
            }
            
            console.log(`数据完全替换成功，总计恢复记录数: ${result.totalRestored}`);
            console.log('替换详情:', result.details);
            
        } catch (error) {
            console.error('替换数据失败:', error);
            throw new Error(`数据完全替换失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
        const exportData = await this.exportAllData();
        
        // 检查并补全 UUID
        if (exportData && exportData.data) {
            exportData.data = this.ensureUUIDsInExportData(exportData.data);
        }
        
        return exportData;
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

    /**
     * 确保导出数据中所有需要同步的条目都有 UUID
     */
    private ensureUUIDsInExportData(data: any): any {
        const crypto = require('crypto');
        
        // 生成简单的 UUID（类似 v4 格式）
        const generateUUID = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        // 需要同步的数据类型
        const syncableTypes = ['categories', 'prompts', 'promptVariables', 'promptHistories', 'aiConfigs', 'aiGenerationHistory'];
        
        for (const type of syncableTypes) {
            if (data[type] && Array.isArray(data[type])) {
                data[type] = data[type].map((item: any) => {
                    if (!item.uuid) {
                        console.log(`为 ${type} 中的条目补全 UUID: ${item.id || item.name || '未知'}`);
                        item.uuid = generateUUID();
                    }
                    return item;
                });
            }
        }
        
        return data;
    }
}
