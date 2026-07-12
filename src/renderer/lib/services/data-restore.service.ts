import { isBackupPayload, parseBackupPayload, unwrapBackupData } from '@shared/backup-integrity'
import type { ImportResult } from '@shared/types/data-management'
import { DatabaseServiceManager } from './database-manager.service'
import { cloudSyncService, type CloudSyncRestoreSuspension } from './cloud-sync.service'

export interface RestorePreview {
  categories: number
  prompts: number
  promptVariables: number
  promptHistories: number
  aiConfigs: number
  quickOptimizationConfigs: number
  aiHistory: number
  settings: number
  total: number
}

export interface CoordinatedRestoreResult extends ImportResult {
  preview?: RestorePreview
  suspensions?: CloudSyncRestoreSuspension[]
}

export class DataRestoreService {
  private static instance: DataRestoreService
  private readonly database = DatabaseServiceManager.getInstance()

  static getInstance(): DataRestoreService {
    if (!DataRestoreService.instance) DataRestoreService.instance = new DataRestoreService()
    return DataRestoreService.instance
  }

  prepare(input: unknown): { data: any; preview: RestorePreview } {
    const data = unwrapBackupData(input)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('恢复数据格式无效')
    }
    const knownFields = [
      'categories', 'prompts', 'promptVariables', 'promptHistories',
      'aiConfigs', 'quickOptimizationConfigs', 'aiHistory', 'settings', 'syncTombstones'
    ]
    if (!knownFields.some(field => field in data)) {
      throw new Error('恢复数据不包含可恢复的数据表')
    }
    const count = (field: string) => Array.isArray((data as any)[field]) ? (data as any)[field].length : 0
    const preview: RestorePreview = {
      categories: count('categories'),
      prompts: count('prompts'),
      promptVariables: count('promptVariables'),
      promptHistories: count('promptHistories'),
      aiConfigs: count('aiConfigs'),
      quickOptimizationConfigs: count('quickOptimizationConfigs'),
      aiHistory: count('aiHistory'),
      settings: count('settings'),
      total: 0
    }
    preview.total = Object.entries(preview)
      .filter(([key]) => key !== 'total')
      .reduce((sum, [, value]) => sum + value, 0)
    return { data, preview }
  }

  parseFileContent(content: string): { payload: unknown; data: any; preview: RestorePreview } {
    const parsed = JSON.parse(content)
    const payload = isBackupPayload(parsed) ? parseBackupPayload(parsed).payload : parsed
    const prepared = this.prepare(payload)
    return { payload, ...prepared }
  }

  async restore(input: unknown, options: {
    source: 'local-file' | 'cloud-backup'
    backupId?: string
  }): Promise<CoordinatedRestoreResult> {
    let preview: RestorePreview
    let data: any
    try {
      ({ data, preview } = this.prepare(input))
    } catch (error) {
      return {
        success: false,
        atomic: true,
        phase: 'validate',
        retryable: false,
        errorCode: 'INVALID_DATA',
        error: error instanceof Error ? error.message : String(error),
        message: '恢复数据校验失败'
      }
    }

    const result = await this.database.replaceAllData(data)
    if (!result.success) return { ...result, preview }
    const suspensions = await cloudSyncService.suspendEnabledStoragesAfterRestore(options)
    return { ...result, preview, suspensions }
  }
}

export const dataRestoreService = DataRestoreService.getInstance()
