/**
 * 基于UUID和时间戳的同步算法测试
 * 专门测试 UUID 主键和 updatedAt 时间戳的冲突解决机制
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { testDataGenerators } from '../helpers/test-utils'

/**
 * 模拟基于UUID和时间戳的同步算法
 * 这是理想中的同步算法实现
 */
class UUIDBasedSyncAlgorithm {
  /**
   * 比较两个数据集并生成合并结果
   */
  compareAndMerge(localData: any, remoteData: any): {
    mergedData: any;
    conflicts: any[];
    changes: {
      added: any[];
      modified: any[];
      deleted: any[];
    };
  } {
    const mergedData: any = { prompts: [], categories: [] }
    const conflicts: any[] = []
    const changes = { added: [], modified: [], deleted: [] }

    // 处理提示词
    if (localData.prompts || remoteData.prompts) {
      const promptResult = this.mergeRecordsByUuid(
        localData.prompts || [],
        remoteData.prompts || [],
        'prompts'
      )
      mergedData.prompts = promptResult.merged
      conflicts.push(...promptResult.conflicts)
      changes.added.push(...promptResult.changes.added)
      changes.modified.push(...promptResult.changes.modified)
      changes.deleted.push(...promptResult.changes.deleted)
    }

    // 处理分类
    if (localData.categories || remoteData.categories) {
      const categoryResult = this.mergeRecordsByUuid(
        localData.categories || [],
        remoteData.categories || [],
        'categories'
      )
      mergedData.categories = categoryResult.merged
      conflicts.push(...categoryResult.conflicts)
      changes.added.push(...categoryResult.changes.added)
      changes.modified.push(...categoryResult.changes.modified)
      changes.deleted.push(...categoryResult.changes.deleted)
    }

    return { mergedData, conflicts, changes }
  }

  /**
   * 基于UUID合并记录
   */
  private mergeRecordsByUuid(localRecords: any[], remoteRecords: any[], type: string) {
    const merged: any[] = []
    const conflicts: any[] = []
    const changes = { added: [], modified: [], deleted: [] }

    // 创建UUID映射
    const localMap = new Map(localRecords.map(record => [record.uuid || record.id, record]))
    const remoteMap = new Map(remoteRecords.map(record => [record.uuid || record.id, record]))

    // 获取所有UUID
    const allUuids = new Set([...localMap.keys(), ...remoteMap.keys()])

    for (const uuid of allUuids) {
      const localRecord = localMap.get(uuid)
      const remoteRecord = remoteMap.get(uuid)

      if (localRecord && remoteRecord) {
        // 两边都有，检查冲突
        const resolution = this.resolveConflictByTimestamp(localRecord, remoteRecord, type, uuid)
        merged.push(resolution.winner)
        
        if (resolution.hasConflict) {
          conflicts.push(resolution.conflict)
        }
        
        if (resolution.wasModified) {
          changes.modified.push({ type, uuid, local: localRecord, remote: remoteRecord })
        }
      } else if (localRecord) {
        // 只有本地有
        merged.push(localRecord)
        // 注意：这可能是远程删除的，也可能是本地新增的
        // 在实际应用中需要更复杂的逻辑来区分
      } else if (remoteRecord) {
        // 只有远程有
        merged.push(remoteRecord)
        changes.added.push({ type, uuid, record: remoteRecord })
      }
    }

    return { merged, conflicts, changes }
  }

  /**
   * 基于时间戳解决冲突
   */
  private resolveConflictByTimestamp(localRecord: any, remoteRecord: any, type: string, uuid: string) {
    // 安全地解析时间戳，处理无效时间戳
    const parseTimestamp = (record: any): number => {
      const timestamp = record.updatedAt || record.createdAt
      if (!timestamp || timestamp === null || timestamp === undefined) return 0
      
      const date = new Date(timestamp)
      const time = date.getTime()
      return isNaN(time) ? 0 : time
    }

    const localTime = parseTimestamp(localRecord)
    const remoteTime = parseTimestamp(remoteRecord)

    let winner
    let hasConflict = false
    let wasModified = false

    // 如果一方有有效时间戳，另一方没有，优先选择有时间戳的
    if (localTime > 0 && remoteTime === 0) {
      winner = localRecord
      wasModified = true
    } else if (remoteTime > 0 && localTime === 0) {
      winner = remoteRecord
      wasModified = true
    } else if (localTime > remoteTime) {
      winner = localRecord
      wasModified = this.hasContentChanges(localRecord, remoteRecord)
    } else if (remoteTime > localTime) {
      winner = remoteRecord
      wasModified = this.hasContentChanges(localRecord, remoteRecord)
    } else {
      // 时间戳相同（包括都为0的情况），检查内容是否不同
      if (this.hasContentChanges(localRecord, remoteRecord)) {
        hasConflict = true
        winner = localRecord // 默认优先本地
        wasModified = true
      } else {
        winner = localRecord // 内容相同，选择任意一个
      }
    }

    const conflict = hasConflict ? {
      type: 'timestamp_identical_content_different',
      uuid,
      recordType: type,
      localRecord,
      remoteRecord,
      resolution: 'local_wins',
      reason: '时间戳相同但内容不同，优先使用本地版本'
    } : null

    return { winner, hasConflict, wasModified, conflict }
  }

  /**
   * 检查两个记录的内容是否有变化
   */
  private hasContentChanges(record1: any, record2: any): boolean {
    // 排除时间戳字段进行比较
    const excludeFields = ['createdAt', 'updatedAt', 'modifiedAt', 'lastModified', 'timestamp']
    
    const normalize = (obj: any) => {
      const normalized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        if (!excludeFields.includes(key)) {
          normalized[key] = value
        }
      }
      return normalized
    }

    const normalized1 = normalize(record1)
    const normalized2 = normalize(record2)

    return JSON.stringify(normalized1) !== JSON.stringify(normalized2)
  }

  /**
   * 生成数据差异报告
   */
  generateDiffReport(localData: any, remoteData: any) {
    const result = this.compareAndMerge(localData, remoteData)
    
    return {
      summary: {
        totalChanges: result.changes.added.length + result.changes.modified.length + result.changes.deleted.length,
        added: result.changes.added.length,
        modified: result.changes.modified.length,
        deleted: result.changes.deleted.length,
        conflicts: result.conflicts.length
      },
      details: result.changes,
      conflicts: result.conflicts,
      mergedData: result.mergedData
    }
  }
}

describe('基于UUID和时间戳的同步算法', () => {
  let syncAlgorithm: UUIDBasedSyncAlgorithm

  beforeEach(() => {
    syncAlgorithm = new UUIDBasedSyncAlgorithm()
  })

  describe('基础合并功能', () => {
    it('应该正确合并无冲突的数据', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地提示词1',
            updatedAt: '2023-01-01T10:00:00Z'
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-002',
            title: '远程提示词2',
            updatedAt: '2023-01-01T11:00:00Z'
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(2)
      expect(result.conflicts).toHaveLength(0)
      expect(result.changes.added).toHaveLength(1)
      expect(result.changes.modified).toHaveLength(0)
      expect(result.changes.deleted).toHaveLength(0)
    })

    it('应该基于时间戳解决冲突 - 本地版本更新', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地版本（更新）',
            content: '本地内容',
            updatedAt: '2023-01-01T12:00:00Z'
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程版本（旧）',
            content: '远程内容',
            updatedAt: '2023-01-01T10:00:00Z'
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.mergedData.prompts[0].title).toBe('本地版本（更新）')
      expect(result.conflicts).toHaveLength(0)
      expect(result.changes.modified).toHaveLength(1)
    })

    it('应该基于时间戳解决冲突 - 远程版本更新', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地版本（旧）',
            updatedAt: '2023-01-01T10:00:00Z'
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程版本（更新）',
            updatedAt: '2023-01-01T12:00:00Z'
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.mergedData.prompts[0].title).toBe('远程版本（更新）')
      expect(result.conflicts).toHaveLength(0)
      expect(result.changes.modified).toHaveLength(1)
    })

    it('应该处理时间戳相同但内容不同的冲突', () => {
      const sameTimestamp = '2023-01-01T12:00:00Z'
      
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '相同时间戳 - 本地版本',
            content: '本地内容',
            updatedAt: sameTimestamp
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '相同时间戳 - 远程版本',
            content: '远程内容',
            updatedAt: sameTimestamp
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.mergedData.prompts[0].title).toBe('相同时间戳 - 本地版本') // 默认优先本地
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].type).toBe('timestamp_identical_content_different')
    })

    it('应该处理时间戳和内容都相同的情况', () => {
      const sameRecord = testDataGenerators.createMockPrompt({ 
        uuid: 'prompt-001',
        title: '完全相同的记录',
        content: '相同内容',
        updatedAt: '2023-01-01T12:00:00Z'
      })
      
      const localData = { prompts: [sameRecord], categories: [] }
      const remoteData = { prompts: [{ ...sameRecord }], categories: [] }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.conflicts).toHaveLength(0)
      expect(result.changes.modified).toHaveLength(0)
    })
  })

  describe('复杂场景测试', () => {
    it('应该处理多种类型的混合变更', () => {
      const localData = {
        prompts: [
          // 将被修改（远程更新）
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地版本1',
            updatedAt: '2023-01-01T10:00:00Z'
          }),
          // 本地独有（可能是新增）
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-002',
            title: '本地独有',
            updatedAt: '2023-01-01T11:00:00Z'
          }),
          // 将被修改（本地更新）
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-003',
            title: '本地版本3（更新）',
            updatedAt: '2023-01-01T13:00:00Z'
          })
        ],
        categories: [
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-001',
            name: '本地分类1',
            updatedAt: '2023-01-01T10:00:00Z'
          })
        ]
      }

      const remoteData = {
        prompts: [
          // 将修改本地版本
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程版本1（更新）',
            updatedAt: '2023-01-01T12:00:00Z'
          }),
          // 将被本地版本覆盖
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-003',
            title: '远程版本3',
            updatedAt: '2023-01-01T09:00:00Z'
          }),
          // 远程独有（新增）
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-004',
            title: '远程独有',
            updatedAt: '2023-01-01T14:00:00Z'
          })
        ],
        categories: [
          // 时间戳相同但内容不同
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-001',
            name: '远程分类1（不同名称）',
            updatedAt: '2023-01-01T10:00:00Z'
          }),
          // 远程新增
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-002',
            name: '远程新分类',
            updatedAt: '2023-01-01T15:00:00Z'
          })
        ]
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      // 验证合并结果
      expect(result.mergedData.prompts).toHaveLength(4)
      expect(result.mergedData.categories).toHaveLength(2)

      // 验证提示词合并
      const mergedPrompts = result.mergedData.prompts
      const prompt001 = mergedPrompts.find((p: any) => p.uuid === 'prompt-001')
      expect(prompt001.title).toBe('远程版本1（更新）') // 远程版本更新

      const prompt002 = mergedPrompts.find((p: any) => p.uuid === 'prompt-002')
      expect(prompt002.title).toBe('本地独有') // 本地独有

      const prompt003 = mergedPrompts.find((p: any) => p.uuid === 'prompt-003')
      expect(prompt003.title).toBe('本地版本3（更新）') // 本地版本更新

      const prompt004 = mergedPrompts.find((p: any) => p.uuid === 'prompt-004')
      expect(prompt004.title).toBe('远程独有') // 远程独有

      // 验证分类合并
      const mergedCategories = result.mergedData.categories
      const cat001 = mergedCategories.find((c: any) => c.uuid === 'cat-001')
      expect(cat001.name).toBe('本地分类1') // 时间戳相同，优先本地

      const cat002 = mergedCategories.find((c: any) => c.uuid === 'cat-002')
      expect(cat002.name).toBe('远程新分类') // 远程新增

      // 验证冲突检测
      expect(result.conflicts).toHaveLength(1) // cat-001 有冲突
      expect(result.conflicts[0].uuid).toBe('cat-001')

      // 验证变更统计
      expect(result.changes.added).toHaveLength(2) // prompt-004, cat-002
      expect(result.changes.modified.length).toBeGreaterThan(0)
    })

    it('应该处理大规模数据的合并', () => {
      const createLargeDataset = (prefix: string, count: number, baseTime: number) => ({
        prompts: Array.from({ length: count }, (_, i) => 
          testDataGenerators.createMockPrompt({
            uuid: `${prefix}-prompt-${i}`,
            title: `${prefix} 提示词 ${i}`,
            updatedAt: new Date(baseTime + i * 1000).toISOString()
          })
        ),
        categories: Array.from({ length: Math.floor(count / 10) }, (_, i) => 
          testDataGenerators.createMockCategory({
            uuid: `${prefix}-cat-${i}`,
            name: `${prefix} 分类 ${i}`,
            updatedAt: new Date(baseTime + i * 1000).toISOString()
          })
        )
      })

      const baseTime = Date.now()
      const localData = createLargeDataset('local', 1000, baseTime)
      const remoteData = createLargeDataset('remote', 800, baseTime + 500000) // 远程数据时间稍晚

      const startTime = Date.now()
      const result = syncAlgorithm.compareAndMerge(localData, remoteData)
      const endTime = Date.now()

      expect(result.mergedData.prompts).toHaveLength(1800)
      expect(result.mergedData.categories).toHaveLength(180)
      expect(endTime - startTime).toBeLessThan(1000) // 应该在1秒内完成
    })
  })

  describe('边界情况测试', () => {
    it('应该处理空数据集', () => {
      const emptyLocal = { prompts: [], categories: [] }
      const emptyRemote = { prompts: [], categories: [] }

      const result = syncAlgorithm.compareAndMerge(emptyLocal, emptyRemote)

      expect(result.mergedData.prompts).toHaveLength(0)
      expect(result.mergedData.categories).toHaveLength(0)
      expect(result.conflicts).toHaveLength(0)
      expect(result.changes.added).toHaveLength(0)
    })

    it('应该处理缺失的时间戳', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '无时间戳记录',
            updatedAt: null,  // 明确设置为 null
            createdAt: null   // 也设置 createdAt 为 null
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '有时间戳记录',
            updatedAt: '2023-01-01T12:00:00Z'
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.mergedData.prompts[0].title).toBe('有时间戳记录') // 有时间戳的版本胜出
    })

    it('应该处理无效的时间戳格式', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '无效时间戳',
            updatedAt: 'invalid-date'
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '有效时间戳',
            updatedAt: '2023-01-01T12:00:00Z'
          })
        ],
        categories: []
      }

      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
      expect(result.mergedData.prompts[0].title).toBe('有效时间戳') // 有效时间戳的版本胜出
    })

    it('应该处理缺失UUID的记录', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            id: 1, // 使用 id 而不是 uuid
            title: '使用ID的记录',
            uuid: undefined as any
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            id: 1,
            title: '使用ID的记录（远程）',
            uuid: undefined as any
          })
        ],
        categories: []
      }

      // 算法应该能够回退到使用 id 作为标识符
      const result = syncAlgorithm.compareAndMerge(localData, remoteData)

      expect(result.mergedData.prompts).toHaveLength(1)
    })
  })

  describe('差异报告生成', () => {
    it('应该生成详细的差异报告', () => {
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地版本',
            updatedAt: '2023-01-01T10:00:00Z'
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程版本（更新）',
            updatedAt: '2023-01-01T12:00:00Z'
          }),
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-002',
            title: '远程新增',
            updatedAt: '2023-01-01T13:00:00Z'
          })
        ],
        categories: []
      }

      const report = syncAlgorithm.generateDiffReport(localData, remoteData)

      expect(report.summary.totalChanges).toBe(2)
      expect(report.summary.added).toBe(1)
      expect(report.summary.modified).toBe(1)
      expect(report.summary.deleted).toBe(0)
      expect(report.summary.conflicts).toBe(0)

      expect(report.details.added).toHaveLength(1)
      expect(report.details.modified).toHaveLength(1)
      expect(report.conflicts).toHaveLength(0)

      expect(report.mergedData.prompts).toHaveLength(2)
    })

    it('应该包含冲突详情', () => {
      const sameTimestamp = '2023-01-01T12:00:00Z'
      
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地版本',
            content: '本地内容',
            updatedAt: sameTimestamp
          })
        ],
        categories: []
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程版本',
            content: '远程内容',
            updatedAt: sameTimestamp
          })
        ],
        categories: []
      }

      const report = syncAlgorithm.generateDiffReport(localData, remoteData)

      expect(report.summary.conflicts).toBe(1)
      expect(report.conflicts).toHaveLength(1)
      expect(report.conflicts[0]).toHaveProperty('type')
      expect(report.conflicts[0]).toHaveProperty('uuid')
      expect(report.conflicts[0]).toHaveProperty('localRecord')
      expect(report.conflicts[0]).toHaveProperty('remoteRecord')
      expect(report.conflicts[0]).toHaveProperty('resolution')
      expect(report.conflicts[0]).toHaveProperty('reason')
    })
  })
})
