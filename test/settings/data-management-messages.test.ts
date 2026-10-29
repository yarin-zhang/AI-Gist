/**
 * 设置页「数据备份」的结果提示：取消不算失败、失败不报成成功、底层原文（表名、记录、错误堆栈）不出现在提示里。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { backupService, database, api } = vi.hoisted(() => ({
  backupService: {
    list: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
    openDirectory: vi.fn(),
    createSafetyBackup: vi.fn()
  },
  database: {
    exportAllData: vi.fn(),
    getHealthStatus: vi.fn(),
    repairDatabase: vi.fn(),
    forceCleanAllTables: vi.fn()
  },
  api: {
    selectExportPath: vi.fn(),
    exportDataToFile: vi.fn(),
    exportFullBackup: vi.fn(),
    importFullBackup: vi.fn()
  }
}))

vi.mock('@renderer/lib/services/local-backup.service', async () => {
  const actual = await vi.importActual<typeof import('@renderer/lib/services/local-backup.service')>(
    '@renderer/lib/services/local-backup.service'
  )
  return {
    LocalBackupRestoreError: actual.LocalBackupRestoreError,
    isLocalDataUnchangedAfterFailedRestore: actual.isLocalDataUnchangedAfterFailedRestore,
    localBackupService: backupService
  }
})
// 和真实的 safeDbOperation 一样：出错时只返回兜底值，不往外抛
vi.mock('@renderer/composables/useDatabase', () => ({
  useDatabase: () => ({
    safeDbOperation: async <T>(operation: () => Promise<T>, fallback?: T) => {
      try {
        return await operation()
      } catch {
        return fallback
      }
    }
  })
}))
vi.mock('@renderer/lib/api/data-management.api', () => ({ DataManagementAPI: api }))
vi.mock('@renderer/lib/db', () => ({ databaseService: database }))

const load = async () => {
  const { useDataManagement } = await import('@renderer/composables/useDataManagement')
  return useDataManagement()
}

describe('data management result messages', () => {
  beforeEach(() => {
    for (const mock of [...Object.values(backupService), ...Object.values(database), ...Object.values(api)]) mock.mockReset()
    backupService.list.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('cancelling the selective export save dialog shows nothing', async () => {
    database.exportAllData.mockResolvedValue({ success: true, data: { prompts: [] } })
    api.selectExportPath.mockResolvedValue(null)
    const { exportSelectedData, error, success } = await load()

    expect(await exportSelectedData('json', { includePrompts: true })).toBe(false)
    expect(error.value).toBeNull()
    expect(success.value).toBeNull()
    expect(api.exportDataToFile).not.toHaveBeenCalled()
  })

  it('a failed local restore says the data is unchanged and hides the cause', async () => {
    const { LocalBackupRestoreError } = await import('@renderer/lib/services/local-backup.service')
    backupService.restore.mockRejectedValue(new LocalBackupRestoreError('prompts uuid:3f2a 的 categoryId 关系无法安全解析'))
    const { restoreBackup, error } = await load()

    expect(await restoreBackup('b1')).toBe(false)
    expect(error.value).toBe('恢复没有完成，本机数据没有变化。')
  })

  it('other restore failures fall back to the plain message', async () => {
    backupService.restore.mockRejectedValue(new Error('写入 prompts 记录失败'))
    const { restoreBackup, error } = await load()

    await restoreBackup('b1')
    expect(error.value).toBe('恢复备份失败')
  })

  it.each([
    ['createBackup', 'create', '创建备份失败'],
    ['deleteBackup', 'delete', '删除备份失败'],
    ['openBackupDirectory', 'openDirectory', '无法打开备份目录']
  ] as const)('%s never shows the raw error', async (action, method, expected) => {
    backupService[method].mockRejectedValue(new Error('EACCES: permission denied, open /Users/x/backups'))
    const management = await load()

    await (management[action] as (id?: string) => Promise<unknown>)('b1')
    expect(management.error.value).toBe(expected)
  })

  it('the health check points to the repair button without listing internal tables', async () => {
    database.getHealthStatus.mockResolvedValue({ healthy: false, missingStores: ['prompts', 'ai_configs'] })
    const { checkDatabaseHealth, error } = await load()

    await checkDatabaseHealth()
    expect(error.value).toBe('部分本机数据需要修复，请点「修复数据」。')
    expect(error.value).not.toMatch(/prompts|ai_configs/)
  })

  it('a health check that could not run is not reported as broken data', async () => {
    database.getHealthStatus.mockRejectedValue(new Error('db locked'))
    const { checkDatabaseHealth, error } = await load()

    await checkDatabaseHealth()
    expect(error.value).toBe('数据检查没有完成，请稍后再试。')
  })

  it('repair failures do not show which tables are missing', async () => {
    database.repairDatabase.mockResolvedValue({ success: false, message: '数据库修复后仍有问题，缺失的表: prompts' })
    const { repairDatabase, error } = await load()

    expect(await repairDatabase()).toBe(false)
    expect(error.value).toBe('数据修复没有完成，请稍后再试。')
  })

  it('a failed clear is not reported as success', async () => {
    backupService.createSafetyBackup.mockResolvedValue({ action: 'created' })
    database.forceCleanAllTables.mockRejectedValue(new Error('清空表 prompts 事务失败'))
    const { clearDatabase, error, success } = await load()

    expect(await clearDatabase()).toBe(false)
    expect(success.value).toBeNull()
    expect(error.value).toBe('没能清空全部数据，请再试一次。')
  })

  it('clearing stops before touching data when the safety backup fails', async () => {
    backupService.createSafetyBackup.mockRejectedValue(new Error('ENOSPC'))
    const { clearDatabase, error } = await load()

    expect(await clearDatabase()).toBe(false)
    expect(database.forceCleanAllTables).not.toHaveBeenCalled()
    expect(error.value).toBe('清空前没能先备份当前数据，所以没有清空。本机数据没有变化。')
  })

  it('a successful clear still reports success', async () => {
    backupService.createSafetyBackup.mockResolvedValue({ action: 'created' })
    database.forceCleanAllTables.mockResolvedValue(undefined)
    const { clearDatabase, error, success } = await load()

    expect(await clearDatabase()).toBe(true)
    expect(error.value).toBeNull()
    expect(success.value).toBe('本机数据已清空')
  })

  it('full export failures show the plain message', async () => {
    api.exportFullBackup.mockRejectedValue(new Error('数据库服务未初始化'))
    const { exportFullBackup, error } = await load()

    await exportFullBackup()
    expect(error.value).toBe('完整备份导出失败')
  })
})
