/**
 * 数据管理 API - 前端实现
 * 所有业务逻辑都在前端，主进程只负责文件操作
 */

import { PlatformDetector } from '@shared/platform';
import {
  BACKUP_PAYLOAD_SCHEMA_VERSION,
  createBackupPayload,
  isBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity';
import i18n from '@renderer/i18n';
import { parsePromptTemplate } from '@renderer/lib/utils/prompt-template';

// 导入、导出的结果会直接显示在设置页上，必须跟随界面语言 (#442)
const tr = (key: string, named?: Record<string, unknown>) =>
  (i18n.global.t as (key: string, named?: Record<string, unknown>) => string)(key, named ?? {});

export interface CSVExportOptions {
  /** 只用来把提示词的分类 ID 换成分类名，不会单独导出成一段 */
  categories?: { id?: number | string; name?: string }[];
}

// Excel 靠 BOM 判断 UTF-8，没有它中文会乱码
const CSV_BOM = '﻿';
const CSV_LINE_BREAK = '\r\n';
const CSV_SECTION_TITLES = { categories: 'Categories', prompts: 'Prompts', aiConfigs: 'AIConfigs' } as const;
type CSVSection = keyof typeof CSV_SECTION_TITLES;

/** RFC 4180：每个字段都加引号，字段里的引号写两遍，换行和逗号原样留在引号里 */
const escapeCSVField = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`;

const toCSVDate = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const toCSVList = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).join(', ');
  return typeof value === 'string' ? value.trim() : '';
};

/** 把 CSV 文本拆成记录；引号里的逗号、换行和成对的引号按 RFC 4180 还原 */
const parseCSVRecords = (content: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  const text = content.startsWith(CSV_BOM) ? content.slice(1) : content;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
};

export interface FullBackupImportSummary {
  prompts: number;
  categories: number;
  aiConfigs: number;
}

export interface FullBackupImportOptions {
  approve?: (summary: FullBackupImportSummary) => Promise<boolean>;
  beforeReplace?: () => Promise<unknown>;
}

/**
 * 导入失败的原因：界面据此告诉用户是文件坏了、不是 AI Gist 的备份，还是版本太新。
 * 除 importFailed 外都发生在替换数据之前，本机数据没有被动过。
 */
export type FullBackupImportErrorCode =
  | 'cancelled'
  | 'readFailed'
  | 'invalidJson'
  | 'notBackup'
  | 'unsupportedVersion'
  | 'corrupted'
  | 'backupFailed'
  | 'importFailed';

// 和数据库恢复时认可的数据表保持一致（database-manager.service 的 RESTORABLE_DATA_FIELDS）
const RESTORABLE_BACKUP_FIELDS = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'aiConfigs',
  'quickOptimizationConfigs',
  'aiHistory',
  'settings',
  'syncTombstones'
];

/** 至少有一张可恢复的数据表，并且出现的数据表都是数组：随便一个 JSON 不能当成备份导入 */
const isRestorableBackupData = (data: unknown): boolean => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const present = RESTORABLE_BACKUP_FIELDS.filter(field => field in (data as Record<string, unknown>));
  return present.length > 0 && present.every(field => {
    const value = (data as Record<string, unknown>)[field];
    return value === undefined || Array.isArray(value);
  });
};

const countOf = (value: unknown) => (Array.isArray(value) ? value.length : 0);

const summarizeBackupData = (data: any): FullBackupImportSummary => ({
  prompts: countOf(data?.prompts),
  categories: countOf(data?.categories),
  aiConfigs: countOf(data?.aiConfigs),
});

export class DataManagementAPI {
  private static webImportFiles = new Map<string, File>();

  private static createBackupId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 检查 Electron API 是否可用
   */
  private static isElectronAvailable(): boolean {
    return PlatformDetector.isElectron() && typeof window !== 'undefined' && !!(window as any).electronAPI;
  }

  private static isWebFileToken(path: string): boolean {
    return path.startsWith('web-import:') || path.startsWith('web-download:');
  }

  private static async selectWebImportFile(format: string): Promise<string | null> {
    if (typeof document === 'undefined') {
      return null;
    }

    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = format === 'json' ? '.json,application/json' : '.csv,text/csv';
      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }

        const token = `web-import:${this.createBackupId()}`;
        this.webImportFiles.set(token, file);
        finish(token);
      };
      // 在文件选择框里点了取消：只监听 change 的话这个 Promise 永远不结束，导入按钮会一直转圈 (#441)
      input.addEventListener('cancel', () => finish(null));

      input.click();
    });
  }

  private static downloadWebFile(defaultName: string, content: string): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  /**
   * 选择导入文件
   */
  static async selectImportFile(format: string): Promise<string | null> {
    if (!this.isElectronAvailable()) {
      return this.selectWebImportFile(format);
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
      return `web-download:${defaultName}`;
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
      if (filePath.startsWith('web-download:')) {
        return this.downloadWebFile(filePath.replace('web-download:', ''), content);
      }
      throw new Error('当前平台不支持写入该文件路径');
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
      if (filePath.startsWith('web-import:')) {
        const file = this.webImportFiles.get(filePath);
        this.webImportFiles.delete(filePath);
        return file ? await file.text() : null;
      }
      throw new Error('当前平台不支持读取该文件路径');
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
  static async exportDataToFile(
    data: any,
    filePath: string,
    format: 'json' | 'csv' = 'json',
    options: CSVExportOptions = {}
  ): Promise<boolean> {
    try {
      let content: string;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
      } else {
        content = this.convertToCSV(data, options);
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
   * 将数据转换为 CSV 格式（RFC 4180，带 UTF-8 BOM）。
   * 只有一类数据时就是一张普通表格；同时导出几类时，每段前加一行段名、段之间空一行。
   */
  private static convertToCSV(data: any, options: CSVExportOptions = {}): string {
    const categoryNames = new Map<string, string>();
    for (const category of options.categories || data.categories || []) {
      if (category?.id !== undefined && category?.id !== null) categoryNames.set(String(category.id), category.name || '');
    }

    const tables: Record<CSVSection, { headers: string[]; rows: (item: any) => unknown[] }> = {
      categories: {
        headers: ['ID', 'Name', 'Description', 'CreatedAt', 'UpdatedAt'],
        rows: category => [category.id, category.name, category.description, toCSVDate(category.createdAt), toCSVDate(category.updatedAt)]
      },
      prompts: {
        headers: ['ID', 'Title', 'Description', 'Content', 'Category', 'Tags', 'Variables', 'CreatedAt', 'UpdatedAt'],
        rows: prompt => [
          prompt.id,
          prompt.title,
          prompt.description,
          prompt.content,
          // 未分类留空，找不到对应分类时也不写 undefined
          prompt.category?.name ?? (prompt.categoryId !== undefined && prompt.categoryId !== null
            ? categoryNames.get(String(prompt.categoryId)) ?? ''
            : ''),
          toCSVList(prompt.tags),
          parsePromptTemplate(prompt.content || '').variableNames.join(', '),
          toCSVDate(prompt.createdAt),
          toCSVDate(prompt.updatedAt)
        ]
      },
      aiConfigs: {
        headers: ['ID', 'Name', 'Provider', 'ApiKey', 'DefaultModel', 'CreatedAt'],
        rows: config => [config.id, config.name, config.type ?? config.provider, config.apiKey, config.defaultModel, toCSVDate(config.createdAt)]
      }
    };

    const sections = (Object.keys(tables) as CSVSection[]).filter(section => Array.isArray(data?.[section]));
    const lines: string[] = [];
    sections.forEach((section, index) => {
      if (sections.length > 1) {
        if (index > 0) lines.push('');
        lines.push(escapeCSVField(CSV_SECTION_TITLES[section]));
      }
      const table = tables[section];
      lines.push(table.headers.map(escapeCSVField).join(','));
      for (const item of data[section]) lines.push(table.rows(item).map(escapeCSVField).join(','));
    });

    return CSV_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
  }

  /**
   * 解析 CSV 格式数据：兼容单表和带段名的多段文件
   */
  private static parseCSV(content: string): any {
    const result: any = { categories: [], prompts: [], aiConfigs: [] };
    const sectionByTitle = new Map(
      (Object.entries(CSV_SECTION_TITLES) as [CSVSection, string][]).map(([section, title]) => [title, section])
    );

    let currentSection: CSVSection | '' = '';
    let headers: string[] = [];

    for (const record of parseCSVRecords(content)) {
      if (record.every(field => !field.trim())) continue;
      if (record.length === 1 && sectionByTitle.has(record[0])) {
        currentSection = sectionByTitle.get(record[0])!;
        headers = [];
        continue;
      }
      if (headers.length === 0) {
        headers = record;
        // 单表文件没有段名，按表头认出是哪一类
        if (!currentSection) {
          currentSection = headers.includes('Title') ? 'prompts' : headers.includes('Provider') ? 'aiConfigs' : 'categories';
        }
        continue;
      }
      const item: any = {};
      headers.forEach((header, index) => {
        item[header] = record[index] ?? '';
      });
      result[currentSection || 'prompts'].push(item);
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
        return { success: false, cancelled: true, message: tr('dataBackup.exportCancelled') };
      }
      
      const backupPayload = createBackupPayload({
        id: this.createBackupId(),
        name: defaultName.replace(/\.json$/i, ''),
        description: '完整备份',
        createdAt: new Date().toISOString(),
        data
      });

      // 3. 导出数据
      const success = await this.exportDataToFile(backupPayload, filePath, 'json');
      
      return {
        success,
        message: success ? tr('settingsMessages.fullBackupExportSuccess') : tr('settingsMessages.fullBackupExportFailed'),
        filePath: success ? filePath : null
      };
    } catch (error) {
      // 读本机数据或写文件时的原文只写日志，界面只说导出没有完成
      console.error('导出完整备份失败:', error);
      return {
        success: false,
        message: tr('settingsMessages.fullBackupExportFailed'),
        error: error
      };
    }
  }

  /**
   * 把备份文件的文本读成可以导入的数据：不是 JSON、不是 AI Gist 的完整备份、版本太新、校验不通过分开报。
   * 桌面端导入和移动端「从文件导入」共用，失败时界面按错误码显示 dataBackup.importErrors.* 里的说明。
   */
  static parseFullBackupContent(content: string):
    | { ok: true; data: any }
    | { ok: false; errorCode: FullBackupImportErrorCode; params?: Record<string, unknown>; error?: unknown } {
    let imported: unknown;
    try {
      imported = JSON.parse(content);
    } catch (error) {
      return { ok: false, errorCode: 'invalidJson', error };
    }
    return this.readFullBackupData(imported);
  }

  /**
   * 判断读到的 JSON 能不能当完整备份导入：带校验信息的备份先核对格式版本和校验码，
   * 旧版本导出的裸数据直接检查数据表。返回的错误码决定给用户看哪一句说明。
   */
  private static readFullBackupData(value: unknown):
    | { ok: true; data: any }
    | { ok: false; errorCode: FullBackupImportErrorCode; params?: Record<string, unknown>; error?: unknown } {
    let data: unknown = value;
    if (isBackupPayload(value)) {
      const version = (value as { schemaVersion?: unknown }).schemaVersion;
      if (version !== undefined && version !== BACKUP_PAYLOAD_SCHEMA_VERSION) {
        return { ok: false, errorCode: 'unsupportedVersion', params: { version: String(version) } };
      }
      try {
        data = parseBackupPayload(value).data;
      } catch (error) {
        return { ok: false, errorCode: 'corrupted', error };
      }
    }
    return isRestorableBackupData(data) ? { ok: true, data } : { ok: false, errorCode: 'notBackup' };
  }

  /**
   * 完整备份导入。导入会用文件内容替换本机全部数据：
   * `approve` 拿到文件里的条目数，返回 false 就取消；`beforeReplace` 在替换前执行（用来做导入前备份），抛错则不导入。
   */
  static async importFullBackup(options: FullBackupImportOptions = {}): Promise<any> {
    // 每种失败都说清楚原因，并告诉用户本机数据有没有被动过 (#442)。
    // 底层的错误原文（哪张表写不进去、哪个字段不对）用户处理不了，只写日志，不拼进提示
    const fail = (errorCode: FullBackupImportErrorCode, params: Record<string, unknown> = {}, error?: unknown) => {
      if (error !== undefined) console.warn(`导入完整备份没有完成（${errorCode}）:`, error);
      return {
        success: false,
        errorCode,
        message: tr(`dataBackup.importErrors.${errorCode}`, params),
        error
      };
    };

    try {
      // 1. 选择导入文件
      const filePath = await this.selectImportFile('json');
      if (!filePath) {
        return { success: false, cancelled: true, errorCode: 'cancelled', message: tr('dataBackup.importErrors.cancelled') };
      }

      // 2. 读取并解析数据：读不出来、不是 JSON、不是备份、版本太新、校验不通过分开说
      let content: string | null;
      try {
        content = await this.readFile(filePath);
      } catch (error) {
        return fail('readFailed', {}, error);
      }
      if (!content) return fail('readFailed');

      const parsed = this.parseFullBackupContent(content);
      if (!parsed.ok) return fail(parsed.errorCode, parsed.params, parsed.error);
      const data = parsed.data;

      // 3. 确认后再替换，替换前留一份当前数据；备份做不成就不导入
      if (options.approve && !(await options.approve(summarizeBackupData(data)))) {
        return { success: false, cancelled: true, errorCode: 'cancelled', message: tr('dataBackup.importErrors.cancelled') };
      }
      try {
        await options.beforeReplace?.();
      } catch (error) {
        return fail('backupFailed', {}, error);
      }

      // 4. 导入到数据库（整体替换是原子的，失败时本机数据保持原样）
      const result = await this.importDataToDatabase(data);
      if (!result.success) {
        return {
          ...fail('importFailed', {}, result.error || result.errorCode || 'unknown'),
          imported: result.imported
        };
      }

      return {
        success: true,
        message: tr('settingsMessages.fullBackupImportSuccess'),
        imported: result.imported
      };
    } catch (error) {
      return fail('importFailed', {}, error);
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
        const exportForBackup = (window as any).databaseAPI.exportAllDataForBackup ||
          (window as any).databaseAPI.exportAllData;
        const result = await exportForBackup();
        if (!result?.success || !result.data) {
          throw new Error(result?.error || result?.message || '导出数据库数据失败');
        }
        return result.data;
      }
      
      throw new Error('数据库服务未初始化');
    } catch (error) {
      console.error('获取数据库数据失败:', error);
      throw error;
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
      throw error;
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
          error: result.error,
          operationId: result.operationId,
          errorCode: result.errorCode,
          phase: result.phase,
          failures: result.failures,
          warnings: result.warnings,
          imported: {
            categories: result.imported?.categories || 0,
            prompts: result.imported?.prompts || 0,
            aiConfigs: result.imported?.aiConfigs || 0,
            aiHistory: result.imported?.history || 0,
            settings: result.imported?.settings || 0
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
