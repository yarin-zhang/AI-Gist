import { describe, expect, it } from 'vitest'
import {
  createBackupPayload,
  parseBackupPayload,
  unwrapBackupData
} from '../../src/shared/backup-integrity'

describe('backup-integrity', () => {
  const data = {
    categories: [{ id: 1, name: '分类A' }],
    prompts: [{ id: 1, title: '提示词A' }],
    aiConfigs: [],
    aiHistory: [],
    settings: []
  }

  it('为备份 payload 写入稳定 checksum 并可校验解包', () => {
    const payload = createBackupPayload({
      id: 'backup-1',
      name: 'backup-2026-06-12',
      description: '完整备份',
      createdAt: '2026-06-12T00:00:00.000Z',
      data
    })

    expect(payload.checksum).toMatch(/^fnv1a32:/)
    expect(parseBackupPayload(payload).data).toEqual(data)
    expect(unwrapBackupData(payload)).toEqual(data)
  })

  it('拒绝 checksum 与 data 不匹配的备份', () => {
    const payload = createBackupPayload({
      id: 'backup-1',
      name: 'backup-2026-06-12',
      createdAt: '2026-06-12T00:00:00.000Z',
      data
    })

    payload.data.prompts.push({ id: 2, title: '损坏写入' })

    expect(() => parseBackupPayload(payload)).toThrow('备份数据校验失败')
  })

  it('保留自动恢复快照元数据且不影响旧格式校验', () => {
    const payload = createBackupPayload({
      id: 'automatic-1',
      name: 'backup-automatic',
      createdAt: '2026-07-11T00:00:00.000Z',
      data,
      backupType: 'automatic',
      trigger: 'interval',
      deviceId: 'electron',
      dataChecksum: 'fnv1a32:test'
    })

    expect(parseBackupPayload(payload).payload).toMatchObject({
      backupType: 'automatic',
      trigger: 'interval',
      deviceId: 'electron',
      dataChecksum: 'fnv1a32:test'
    })
  })

  it('兼容旧版本裸数据导入', () => {
    expect(unwrapBackupData(data)).toEqual(data)
  })

  it('兼容旧版本云备份 envelope', () => {
    const legacyPayload = {
      id: 'legacy-1',
      name: 'backup-legacy',
      createdAt: '2026-06-12T00:00:00.000Z',
      data
    }

    const parsed = parseBackupPayload(legacyPayload)
    expect(parsed.legacy).toBe(true)
    expect(parsed.data).toEqual(data)
  })
})
