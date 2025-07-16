/**
 * 数据管理 API - 前端实现
 * 所有业务逻辑都在前端，主进程只负责文件操作
 */

export class DataManagementAPI {
  /**
   * 检查 Electron API 是否可用
   */
  private static isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI;
  }

  /**
   * 选择导入文件
   */
  static async selectImportFile(format: string): Promise<string | null> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    
    try {
      return await (window as any).electronAPI.invoke('data:select-import-file', { format });
    } catch (error) {
      console.error('选择导入文件失败:', error);
      return null;
    }
  }

  /**
   * 选择导出路径
   */
  static async selectExportPath(defaultName: string): Promise<string | null> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    
    try {
      return await (window as any).electronAPI.invoke('data:select-export-path', { defaultName });
    } catch (error) {
      console.error('选择导出路径失败:', error);
      return null;
    }
  }

  /**
   * 写入文件
   */
  static async writeFile(filePath: string, content: string): Promise<boolean> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    
    try {
      const result = await (window as any).electronAPI.invoke('data:write-file', { filePath, content });
      return result.success;
    } catch (error) {
      console.error('写入文件失败:', error);
      return false;
    }
  }

  /**
   * 读取文件
   */
  static async readFile(filePath: string): Promise<string | null> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    
    try {
      const result = await (window as any).electronAPI.invoke('data:read-file', { filePath });
      return result.success ? result.content : null;
    } catch (error) {
      console.error('读取文件失败:', error);
      return null;
    }
  }

  /**
   * 导出数据到文件
   */
  static async exportDataToFile(data: any, filePath: string, format: 'json' | 'csv' = 'json'): Promise<boolean> {
    try {
      let content: string;
      
      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
      } else {
        content = this.convertToCSV(data);
      }
      
      return await this.writeFile(filePath, content);
    } catch (error) {
      console.error('导出数据失败:', error);
      return false;
    }
  }

  /**
   * 从文件导入数据
   */
  static async importDataFromFile(filePath: string, format: 'json' | 'csv' = 'json'): Promise<any | null> {
    try {
      const content = await this.readFile(filePath);
      if (!content) return null;
      
      if (format === 'json') {
        return JSON.parse(content);
      } else {
        return this.parseCSV(content);
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      return null;
    }
  }

  /**
   * 将数据转换为 CSV 格式
   */
  private static convertToCSV(data: any): string {
    const lines: string[] = [];
    
    if (data.categories && data.categories.length > 0) {
      lines.push('Categories');
      lines.push('ID,Name,Description,CreatedAt');
      data.categories.forEach((cat: any) => {
        lines.push(`${cat.id},${cat.name},${cat.description},${cat.createdAt}`);
      });
      lines.push('');
    }
    
    if (data.prompts && data.prompts.length > 0) {
      lines.push('Prompts');
      lines.push('ID,Title,Content,CategoryId,CreatedAt');
      data.prompts.forEach((prompt: any) => {
        lines.push(`${prompt.id},${prompt.title},${prompt.content},${prompt.categoryId},${prompt.createdAt}`);
      });
      lines.push('');
    }
    
    if (data.aiConfigs && data.aiConfigs.length > 0) {
      lines.push('AIConfigs');
      lines.push('ID,Name,Provider,ApiKey,DefaultModel,CreatedAt');
      data.aiConfigs.forEach((config: any) => {
        lines.push(`${config.id},${config.name},${config.provider},${config.apiKey},${config.defaultModel},${config.createdAt}`);
      });
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * 解析 CSV 格式数据
   */
  private static parseCSV(content: string): any {
    // 简单的 CSV 解析实现
    const lines = content.split('\n').filter(line => line.trim());
    const result: any = { categories: [], prompts: [], aiConfigs: [] };
    
    let currentSection = '';
    let headers: string[] = [];
    
    for (const line of lines) {
      if (line === 'Categories') {
        currentSection = 'categories';
        headers = [];
      } else if (line === 'Prompts') {
        currentSection = 'prompts';
        headers = [];
      } else if (line === 'AIConfigs') {
        currentSection = 'aiConfigs';
        headers = [];
      } else if (line.includes(',')) {
        if (headers.length === 0) {
          headers = line.split(',');
        } else {
          const values = line.split(',');
          const item: any = {};
          headers.forEach((header, index) => {
            item[header] = values[index] || '';
          });
          result[currentSection].push(item);
        }
      }
    }
    
    return result;
  }

  /**
   * 完整备份导出
   */
  static async exportFullBackup(): Promise<any> {
    try {
      // 1. 从数据库获取所有数据
      const data = await this.getAllDataFromDatabase();
      
      // 2. 选择导出路径
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `ai-gist-backup-${timestamp}.json`;
      const filePath = await this.selectExportPath(defaultName);
      
      if (!filePath) {
        return { success: false, message: '未选择导出路径' };
      }
      
      // 3. 导出数据
      const success = await this.exportDataToFile(data, filePath, 'json');
      
      return {
        success,
        message: success ? '完整备份导出成功' : '完整备份导出失败',
        filePath: success ? filePath : null
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '完整备份导出失败',
        error: error
      };
    }
  }

  /**
   * 完整备份导入
   */
  static async importFullBackup(): Promise<any> {
    try {
      // 1. 选择导入文件
      const filePath = await this.selectImportFile('json');
      if (!filePath) {
        return { success: false, message: '未选择导入文件' };
      }
      
      // 2. 读取并解析数据
      const data = await this.importDataFromFile(filePath, 'json');
      if (!data) {
        return { success: false, message: '文件读取失败' };
      }
      
      // 3. 导入到数据库
      const result = await this.importDataToDatabase(data);
      
      return {
        success: result.success,
        message: result.success ? '完整备份导入成功' : '完整备份导入失败',
        imported: result.imported
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '完整备份导入失败',
        error: error
      };
    }
  }

  /**
   * 选择性数据导出
   */
  static async exportSelectedData(options: any): Promise<any> {
    try {
      // 1. 从数据库获取选定的数据
      const data = await this.getSelectedDataFromDatabase(options);
      
      // 2. 选择导出路径
      const timestamp = new Date().toISOString().split('T')[0];
      const format = options.format || 'json';
      const defaultName = `ai-gist-export-${timestamp}.${format}`;
      const filePath = await this.selectExportPath(defaultName);
      
      if (!filePath) {
        return { success: false, message: '未选择导出路径' };
      }
      
      // 3. 导出数据
      const success = await this.exportDataToFile(data, filePath, format);
      
      return {
        success,
        message: success ? '选择性导出成功' : '选择性导出失败',
        filePath: success ? filePath : null
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '选择性导出失败',
        error: error
      };
    }
  }

  /**
   * 从数据库获取所有数据
   */
  private static async getAllDataFromDatabase(): Promise<any> {
    try {
      // 从 window 对象获取数据库服务
      if (typeof window !== 'undefined' && (window as any).databaseAPI) {
        const result = await (window as any).databaseAPI.exportAllData();
        return result.data || {
          categories: [],
          prompts: [],
          aiConfigs: [],
          aiHistory: [],
          settings: []
        };
      }
      
      // 如果无法访问数据库服务，返回空数据
      return {
        categories: [],
        prompts: [],
        aiConfigs: [],
        aiHistory: [],
        settings: []
      };
    } catch (error) {
      console.error('获取数据库数据失败:', error);
      return {
        categories: [],
        prompts: [],
        aiConfigs: [],
        aiHistory: [],
        settings: []
      };
    }
  }

  /**
   * 从数据库获取选定的数据
   */
  private static async getSelectedDataFromDatabase(options: any): Promise<any> {
    try {
      const allData = await this.getAllDataFromDatabase();
      const data: any = {};
      
      if (options.includeCategories) {
        data.categories = allData.categories || [];
      }
      
      if (options.includePrompts) {
        data.prompts = allData.prompts || [];
      }
      
      if (options.includeAIConfigs) {
        data.aiConfigs = allData.aiConfigs || [];
      }
      
      return data;
    } catch (error) {
      console.error('获取选定数据失败:', error);
      return {};
    }
  }

  /**
   * 将数据导入到数据库
   */
  private static async importDataToDatabase(data: any): Promise<any> {
    try {
      // 从 window 对象获取数据库服务
      if (typeof window !== 'undefined' && (window as any).databaseAPI) {
        const result = await (window as any).databaseAPI.replaceAllData(data);
        return {
          success: result.success,
          imported: {
            categories: data.categories?.length || 0,
            prompts: data.prompts?.length || 0,
            aiConfigs: data.aiConfigs?.length || 0,
            aiHistory: data.aiHistory?.length || 0,
            settings: data.settings?.length || 0
          }
        };
      }
      
      return {
        success: false,
        imported: {
          categories: 0,
          prompts: 0,
          aiConfigs: 0,
          aiHistory: 0,
          settings: 0
        }
      };
    } catch (error) {
      console.error('导入数据到数据库失败:', error);
      return {
        success: false,
        imported: {
          categories: 0,
          prompts: 0,
          aiConfigs: 0,
          aiHistory: 0,
          settings: 0
        }
      };
    }
  }
}
