/**
 * 数据管理服务 - 极简版
 * 只负责基础的文件操作
 */

import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';

export class DataManagementService {
    constructor() {
        console.log('DataManagementService: 正在初始化...');
        this.setupIpcHandlers();
        console.log('DataManagementService: 初始化完成');
    }

    private setupIpcHandlers() {
        console.log('DataManagementService: 开始注册IPC处理程序...');

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

        // 写入文件
        ipcMain.handle('data:write-file', async (event, { filePath, content }) => {
            try {
                await fs.writeFile(filePath, content, 'utf-8');
                return { success: true };
            } catch (error) {
                console.error('写入文件失败:', error);
                return { 
                    success: false, 
                    error: error instanceof Error ? error.message : '写入文件失败' 
                };
            }
        });

        // 读取文件
        ipcMain.handle('data:read-file', async (event, { filePath }) => {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                return { success: true, content };
            } catch (error) {
                console.error('读取文件失败:', error);
                return { 
                    success: false, 
                    error: error instanceof Error ? error.message : '读取文件失败' 
                };
            }
        });

        console.log('DataManagementService: 所有IPC处理程序注册完成');
    }
}
