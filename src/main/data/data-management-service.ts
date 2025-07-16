import { fsService } from './fs-service';
import { dialog } from 'electron';

/**
 * 数据管理服务
 * 负责数据导入导出等管理功能
 */
export class DataManagementService {
  constructor() {
    console.log('DataManagementService: 正在初始化...');
  }

  /**
   * 选择导入文件
   */
  async selectImportFile(format: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择导入文件',
      filters: [
        { name: `${format.toUpperCase()} 文件`, extensions: [format] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    return result.canceled ? null : result.filePaths[0];
  }

  /**
   * 选择导出路径
   */
  async selectExportPath(defaultName: string): Promise<string | null> {
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
  }

  /**
   * 写入文件
   */
  async writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      await fsService.writeFile(filePath, content);
      return { success: true };
    } catch (error) {
      console.error('写入文件失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '写入文件失败' 
      };
    }
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const content = await fsService.readFile(filePath);
      return { success: true, content };
    } catch (error) {
      console.error('读取文件失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '读取文件失败' 
      };
    }
  }
}

// 单例模式
export const dataManagementService = new DataManagementService();
