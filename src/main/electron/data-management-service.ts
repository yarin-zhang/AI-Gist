/**
 * 数据管理服务
 * 这个文件需要在主进程中实现
 */

import { ipcMain, dialog } from 'electron';
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

                // 这里应该将备份数据恢复到数据库
                await this.restoreAllData(backupFile.data);
                
                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`恢复备份失败: ${errorMessage}`);
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
        });

        // 获取数据统计
        ipcMain.handle('data:get-stats', async () => {
            try {
                // 这里应该从数据库中获取统计信息
                return {
                    categories: 10,
                    prompts: 50,
                    history: 100,
                    totalSize: 1024 * 1024, // 1MB
                    lastBackupTime: new Date().toISOString(),
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                throw new Error(`获取数据统计失败: ${errorMessage}`);
            }
        });
    }

    private async exportAllData() {
        // 这里应该从数据库中导出所有数据
        // 现在返回一些示例数据以便测试
        return {
            categories: [
                { id: 1, name: '示例分类1', description: '这是一个示例分类', createdAt: new Date().toISOString() },
                { id: 2, name: '示例分类2', description: '这是另一个示例分类', createdAt: new Date().toISOString() }
            ],
            prompts: [
                { 
                    id: 1, 
                    title: '示例提示词1', 
                    content: '这是一个示例提示词内容', 
                    categoryId: 1,
                    tags: ['示例', '测试'],
                    createdAt: new Date().toISOString() 
                },
                { 
                    id: 2, 
                    title: '示例提示词2', 
                    content: '这是另一个示例提示词内容', 
                    categoryId: 2,
                    tags: ['示例', '演示'],
                    createdAt: new Date().toISOString() 
                }
            ],
            settings: {
                themeSource: 'system',
                closeBehaviorMode: 'ask',
                autoLaunch: false,
                startMinimized: false
            },
            history: [
                {
                    id: 1,
                    promptId: 1,
                    input: '示例输入',
                    output: '示例输出',
                    timestamp: new Date().toISOString()
                }
            ],
            exportTime: new Date().toISOString(),
            version: '1.0.0',
            totalRecords: 6
        };
    }

    private async restoreAllData(data: any) {
        // 这里应该将数据恢复到数据库
        console.log('恢复数据:', data);
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
}
