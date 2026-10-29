import { fsService } from './fs-service';
import { dialog } from 'electron';
import { getMainStrings } from '../electron/main-locale';
import { formatMainString } from '../electron/main-strings';

/** 文件选择框里的「CSV 文件」「JSON 文件」「所有文件」过滤项 */
function fileFilter(format: string): Electron.FileFilter {
  const strings = getMainStrings().fileDialog;
  return { name: formatMainString(strings.formatFiles, { format: format.toUpperCase() }), extensions: [format] };
}

function allFilesFilter(): Electron.FileFilter {
  return { name: getMainStrings().fileDialog.allFiles, extensions: ['*'] };
}

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
      title: getMainStrings().fileDialog.importTitle,
      filters: [fileFilter(format), allFilesFilter()],
      properties: ['openFile'],
    });

    return result.canceled ? null : result.filePaths[0];
  }

  /**
   * 选择导出路径
   */
  async selectExportPath(defaultName: string): Promise<string | null> {
    const fileExtension = defaultName.split('.').pop()?.toLowerCase();
    const filters = fileExtension === 'csv' || fileExtension === 'json'
      ? [fileFilter(fileExtension), allFilesFilter()]
      : [fileFilter('csv'), fileFilter('json'), allFilesFilter()];

    const result = await dialog.showSaveDialog({
      title: getMainStrings().fileDialog.exportTitle,
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
