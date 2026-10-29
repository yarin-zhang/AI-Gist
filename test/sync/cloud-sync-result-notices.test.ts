/**
 * 同步后给用户看的提醒：只说用户看了能自己处理的事，内部整理不出现在界面上
 */

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../../src/renderer/i18n'
import type { CloudSyncResult } from '../../src/renderer/lib/services/cloud-sync.service'
import {
  getCloudSyncRecordChangeMessages,
  getCloudSyncResultNotices
} from '../../src/renderer/lib/utils/cloud-sync-merge-notices'
import { findCloudSyncUncategorizedPrompts } from '../../src/shared/cloud-sync-contract'

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const

function syncResult(overrides: Partial<CloudSyncResult> = {}): CloudSyncResult {
  return {
    success: true,
    action: 'merged',
    appliedLocal: true,
    uploadedRemote: true,
    conflicts: [],
    summary: { added: 0, updated: 0, deleted: 0, kept: 0, conflicts: 0 },
    ...overrides
  }
}

describe('同步后给用户的提醒', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('同一条记录的重复副本归并、基线保存失败这类内部情况不提醒', () => {
    const result = syncResult({
      warnings: ['云端数据已提交，但完整本地同步基线保存失败: QuotaExceededError'],
      businessKeyMerges: [{
        collection: 'aiConfigs',
        businessKeyField: 'configId',
        businessKeyFingerprint: 'fp',
        mergedRecordIdentities: ['uuid:a', 'uuid:b'],
        differingFields: []
      }],
      relationRepairs: [{
        code: 'removed_unresolved_optional_relation',
        collection: 'categories',
        recordIdentity: 'uuid:c',
        relation: 'parentCategory',
        targetCollection: 'categories'
      }]
    })

    expect(getCloudSyncResultNotices(result)).toEqual([])
  })

  it('说出哪些提示词因为分类被删移到了「未分类」', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(getCloudSyncResultNotices(syncResult({
      uncategorizedPrompts: [{ key: 'uuid:p1', label: '周报整理' }]
    }))).toEqual(['「周报整理」所在的分类已被删除，已移到「未分类」'])

    const three = ['周报整理', '会议纪要', '代码评审'].map((label, index) => ({ key: `uuid:p${index}`, label }))
    expect(getCloudSyncResultNotices(syncResult({ uncategorizedPrompts: three })))
      .toEqual(['「周报整理」等 3 个提示词所在的分类已被删除，已移到「未分类」'])

    i18n.global.locale.value = 'en-US'
    expect(getCloudSyncResultNotices(syncResult({ uncategorizedPrompts: three.slice(0, 2) })))
      .toEqual(['“周报整理” and 1 other prompt were moved to “Uncategorized” because their category was deleted'])
  })

  it('覆盖云端前做了备份时告诉用户去哪里找回', () => {
    expect(getCloudSyncResultNotices(syncResult({ safetyBackupCreated: true })))
      .toEqual(['覆盖前的云端数据已存为本机备份，需要时可以在「数据备份」里恢复'])
  })

  it('恢复的记录和移到「未分类」的提示词一起留在同步状态说明里', () => {
    const result = syncResult({
      restoredAfterLocalDelete: [{ collection: 'prompts', key: 'uuid:p1', label: '周报整理' }],
      uncategorizedPrompts: [{ key: 'uuid:p2', label: '会议纪要' }],
      safetyBackupCreated: true
    })

    expect(getCloudSyncRecordChangeMessages(result)).toEqual([
      '「周报整理」在另一台设备上被修改，已恢复',
      '「会议纪要」所在的分类已被删除，已移到「未分类」'
    ])
    expect(getCloudSyncResultNotices(result)).toHaveLength(3)
    expect(getCloudSyncResultNotices({ ...result, success: false })).toEqual([])
  })

  it('每种语言都有新提醒的文案', () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(`src/renderer/i18n/locales/${locale}.json`, 'utf8'))
      for (const key of ['uncategorizedOne', 'uncategorizedMany', 'safetyBackupCreated']) {
        expect(messages.dataSync.syncResult[key], `${locale} ${key}`).toBeTruthy()
      }
      expect(messages.dataBackup.safetyBackupCloudOverwrite, locale).toBeTruthy()
    }
  })

  it('只列出分类被删的提示词，按标题排序', () => {
    const uncategorized = findCloudSyncUncategorizedPrompts([
      { code: 'removed_unresolved_optional_relation', collection: 'prompts', recordIdentity: 'uuid:p2', relation: 'category', targetCollection: 'categories' },
      { code: 'removed_unresolved_optional_relation', collection: 'prompts', recordIdentity: 'uuid:p1', relation: 'category', targetCollection: 'categories' },
      { code: 'removed_unresolved_optional_relation', collection: 'categories', recordIdentity: 'uuid:c1', relation: 'parentCategory', targetCollection: 'categories' },
      { code: 'removed_unresolved_optional_relation', collection: 'promptHistories', recordIdentity: 'uuid:h1', relation: 'category', targetCollection: 'categories' }
    ], {
      prompts: [
        { uuid: 'p1', title: '会议纪要' },
        { uuid: 'p2', title: '代码评审' },
        { uuid: 'p3', title: '没有被修复的' }
      ]
    })

    expect(uncategorized).toEqual([
      { key: 'uuid:p2', label: '代码评审' },
      { key: 'uuid:p1', label: '会议纪要' }
    ])
  })
})

describe('应用自己会恢复的同步失败不当成失败显示', () => {
  it('同步被接替、云端同步文件刚好在变：前几次不报失败，一直不好才说出来', async () => {
    const { getCloudSyncErrorDiagnosis } = await import('../../src/renderer/lib/services/cloud-sync.service')
    const cancelled = '同步任务已被更新的生命周期同步取代'
    const unstable = '云端同步文件状态持续变化，应用会在下个同步周期自动重试'

    expect(getCloudSyncErrorDiagnosis(cancelled, { failureCount: 0 }).quiet).toBe(true)
    expect(getCloudSyncErrorDiagnosis(unstable, { failureCount: 2 }).quiet).toBe(true)
    expect(getCloudSyncErrorDiagnosis(unstable, { failureCount: 3 }).quiet).toBe(false)
    // 账号密码不对、连不上网，用户自己能处理，照常提示
    expect(getCloudSyncErrorDiagnosis('Request failed with status code 401').quiet).toBe(false)
    expect(getCloudSyncErrorDiagnosis('ECONNRESET').quiet).toBe(false)
  })

  it('数据关联没法自动确认时不让用户去「修复对应记录」，只请他反馈', async () => {
    const { getCloudSyncErrorDiagnosis } = await import('../../src/renderer/lib/services/cloud-sync.service')
    const diagnosis = getCloudSyncErrorDiagnosis({
      success: false,
      appliedLocal: false,
      uploadedRemote: false,
      conflicts: [],
      summary: { added: 0, updated: 0, deleted: 0, kept: 0, conflicts: 0 },
      error: 'contract',
      diagnostic: { operationId: 'op', code: 'DATA_CONTRACT_INVALID', retryClass: 'deterministic', phase: 'merge', message: 'contract' } as any
    })

    expect(diagnosis.canUserFix).toBe(false)
    expect(diagnosis.suggestedActions).toHaveLength(2)
    expect(diagnosis.suggestedActions.join('')).not.toMatch(/集合|记录标识|修复对应记录/)
  })

  it('状态栏和状态卡片把这类失败显示成等待下次同步', async () => {
    const { createDataSyncStatusInput, resolveDataSyncStatusKind } = await import('../../src/renderer/lib/utils/data-sync-status')
    const snapshot = { status: 'error', pending: true, nextSyncAt: '2026-10-29T00:00:00.000Z', lastSyncAt: '2026-10-28T00:00:00.000Z' }

    expect(resolveDataSyncStatusKind(createDataSyncStatusInput(snapshot, { canAutoRetryError: true, quietError: true })))
      .toBe('pending')
    expect(resolveDataSyncStatusKind(createDataSyncStatusInput(snapshot, { canAutoRetryError: true, quietError: false })))
      .toBe('retryScheduled')
  })

  it('同步诊断的说明里不再出现数据库和协议术语', () => {
    for (const locale of ['zh-CN', 'zh-TW']) {
      const diagnosis = JSON.parse(readFileSync(`src/renderer/i18n/locales/${locale}.json`, 'utf8')).dataSync.diagnosis
      const text = JSON.stringify(diagnosis)
      expect(text, locale).not.toMatch(/事务|交易|集合|记录键|紀錄鍵|错误指纹|錯誤指紋|配额|配額|恢复决策|還原決定|接管|接手/)
    }
  })
})
