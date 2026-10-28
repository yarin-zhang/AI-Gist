import { describe, expect, it } from 'vitest'
import {
  CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH,
  createCloudSyncCategoryNameLookup,
  createCloudSyncConflictPreview,
  createCloudSyncDataChecksum,
  createCloudSyncSemanticChecksum,
  createCloudSyncSnapshot,
  getCloudSyncConflictId,
  getCloudSyncRecordKey,
  mergeCloudSyncData,
  validateCloudSyncSnapshot
} from '@shared/cloud-sync-engine'
import {
  assertValidCloudSyncSnapshotFile,
  createCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots'

describe('cloud sync engine', () => {
  it('merges new local and remote records when there is no base snapshot', () => {
    const local = {
      categories: [
        { id: 1, uuid: 'cat-local', name: 'Local', updatedAt: '2026-01-01T00:00:00.000Z' }
      ],
      prompts: []
    }
    const remote = {
      categories: [
        { id: 9, uuid: 'cat-remote', name: 'Remote', updatedAt: '2026-01-02T00:00:00.000Z' }
      ],
      prompts: []
    }

    const result = mergeCloudSyncData(local, remote)

    expect(result.hasConflicts).toBe(false)
    expect(result.data.categories?.map(item => item.uuid).sort()).toEqual(['cat-local', 'cat-remote'])
    expect(result.summary.added).toBe(1)
  })

  it('uses uuid and business keys instead of device-local numeric ids', () => {
    const localPrompt = {
      id: 10,
      uuid: 'prompt-1',
      title: 'Prompt',
      content: 'Hello',
      categoryId: 1,
      category: { id: 1, uuid: 'cat-1', name: 'Category' },
      tags: ['b', 'a'],
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    const remotePrompt = {
      id: 99,
      uuid: 'prompt-1',
      title: 'Prompt',
      content: 'Hello',
      categoryId: 77,
      category: { id: 77, uuid: 'cat-1', name: 'Category' },
      tags: 'a,b',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }

    const result = mergeCloudSyncData({ prompts: [localPrompt] }, { prompts: [remotePrompt] })

    expect(getCloudSyncRecordKey('prompts', localPrompt)).toBe('uuid:prompt-1')
    expect(result.hasConflicts).toBe(false)
    expect(result.data.prompts).toHaveLength(1)
  })

  it('treats re-imported local ids and embedded prompt variables as semantic equivalents', () => {
    const firstDeviceData = {
      categories: [
        { id: 1, uuid: 'cat-1', name: 'Category', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      prompts: [
        {
          id: 10,
          uuid: 'prompt-1',
          title: 'Prompt',
          content: 'Hello',
          categoryId: 1,
          category: { id: 1, uuid: 'cat-1', name: 'Category' },
          variables: [
            { id: 100, uuid: 'var-1', promptId: 10, name: 'tone', updatedAt: '2026-06-12T00:00:00.000Z' }
          ],
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      promptVariables: [
        { id: 100, uuid: 'var-1', promptId: 10, name: 'tone', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      promptHistories: [
        { id: 1000, uuid: 'history-1', promptId: 10, promptUuid: 'prompt-1', content: 'History' }
      ],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }
    const secondDeviceData = {
      ...firstDeviceData,
      categories: [
        { ...firstDeviceData.categories[0], id: 501 }
      ],
      prompts: [
        {
          ...firstDeviceData.prompts[0],
          id: 601,
          categoryId: 501,
          category: { ...firstDeviceData.prompts[0].category, id: 501 },
          variables: [
            { ...firstDeviceData.prompts[0].variables[0], id: 701, promptId: 601 }
          ]
        }
      ],
      promptVariables: [
        { ...firstDeviceData.promptVariables[0], id: 701, promptId: 601 }
      ],
      promptHistories: [
        { ...firstDeviceData.promptHistories[0], id: 801, promptId: 601 }
      ]
    }

    expect(createCloudSyncDataChecksum(firstDeviceData)).not.toBe(
      createCloudSyncDataChecksum(secondDeviceData)
    )
    expect(createCloudSyncSemanticChecksum(firstDeviceData)).toBe(
      createCloudSyncSemanticChecksum(secondDeviceData)
    )
  })

  it('uses relation UUIDs instead of regenerated category ids for semantic equality', () => {
    const firstDeviceData = {
      categories: [
        { id: 1, uuid: 'cat-1', name: 'Category', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      prompts: [
        {
          id: 10,
          uuid: 'prompt-1',
          title: 'Prompt',
          content: 'Hello',
          categoryId: 1,
          categoryUuid: 'cat-1',
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      promptVariables: [],
      promptHistories: [
        {
          id: 100,
          uuid: 'history-1',
          promptId: 10,
          promptUuid: 'prompt-1',
          categoryId: 1,
          categoryUuid: 'cat-1',
          content: 'History'
        }
      ],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }
    const secondDeviceData = {
      ...firstDeviceData,
      categories: [
        { ...firstDeviceData.categories[0], id: 501 }
      ],
      prompts: [
        { ...firstDeviceData.prompts[0], id: 601, categoryId: 501 }
      ],
      promptHistories: [
        { ...firstDeviceData.promptHistories[0], id: 701, promptId: 601, categoryId: 501 }
      ]
    }

    expect(createCloudSyncDataChecksum(firstDeviceData)).not.toBe(
      createCloudSyncDataChecksum(secondDeviceData)
    )
    expect(createCloudSyncSemanticChecksum(firstDeviceData)).toBe(
      createCloudSyncSemanticChecksum(secondDeviceData)
    )
    expect(mergeCloudSyncData(firstDeviceData, secondDeviceData).hasConflicts).toBe(false)
  })

  it('infers missing legacy relation UUIDs from related records before comparing regenerated ids', () => {
    const legacyCloudData = {
      categories: [
        { id: 1, uuid: 'cat-legacy', name: 'Legacy category', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      prompts: [
        {
          id: 10,
          uuid: 'prompt-legacy',
          title: 'Legacy prompt',
          content: 'Hello',
          categoryId: 1,
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      promptVariables: [
        {
          id: 20,
          uuid: 'var-legacy',
          promptId: 10,
          name: 'tone',
          defaultValue: 'calm',
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      promptHistories: [
        {
          id: 30,
          uuid: 'history-legacy',
          promptId: 10,
          categoryId: 1,
          content: 'History',
          result: 'Result',
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }
    const regeneratedInstallData = {
      categories: [
        { ...legacyCloudData.categories[0], id: 501 }
      ],
      prompts: [
        {
          ...legacyCloudData.prompts[0],
          id: 601,
          categoryId: 501,
          categoryUuid: 'cat-legacy'
        }
      ],
      promptVariables: [
        {
          ...legacyCloudData.promptVariables[0],
          id: 701,
          promptId: 601,
          promptUuid: 'prompt-legacy'
        }
      ],
      promptHistories: [
        {
          ...legacyCloudData.promptHistories[0],
          id: 801,
          promptId: 601,
          promptUuid: 'prompt-legacy',
          categoryId: 501,
          categoryUuid: 'cat-legacy'
        }
      ],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }

    expect(createCloudSyncDataChecksum(legacyCloudData)).not.toBe(
      createCloudSyncDataChecksum(regeneratedInstallData)
    )
    expect(createCloudSyncSemanticChecksum(legacyCloudData)).toBe(
      createCloudSyncSemanticChecksum(regeneratedInstallData)
    )
    expect(mergeCloudSyncData(regeneratedInstallData, legacyCloudData).hasConflicts).toBe(false)
  })

  it('fails instead of silently overwriting duplicate sync keys', () => {
    expect(() => mergeCloudSyncData({
      prompts: [
        { id: 1, uuid: 'prompt-dup', title: 'First', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 2, uuid: 'prompt-dup', title: 'Second', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }, {})).toThrow('同步数据包含重复记录: prompts uuid:prompt-dup')
  })

  it('merges prompt variables as first-class metadata', () => {
    const local = {
      promptVariables: [
        { id: 1, uuid: 'variable-1', promptId: 1, name: 'tone', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const remote = {
      promptVariables: [
        { id: 99, uuid: 'variable-1', promptId: 9, name: 'tone', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 100, uuid: 'variable-2', promptId: 9, name: 'audience', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote)

    expect(getCloudSyncRecordKey('promptVariables', local.promptVariables[0])).toBe('uuid:variable-1')
    expect(result.hasConflicts).toBe(false)
    expect(result.data.promptVariables?.map(item => item.uuid).sort()).toEqual(['variable-1', 'variable-2'])
  })

  it('merges quick optimization configs as syncable user settings', () => {
    const local = {
      quickOptimizationConfigs: [
        { id: 1, uuid: 'quick-1', name: 'Shorter', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const remote = {
      quickOptimizationConfigs: [
        { id: 9, uuid: 'quick-2', name: 'Richer', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote)

    expect(getCloudSyncRecordKey('quickOptimizationConfigs', local.quickOptimizationConfigs[0])).toBe('uuid:quick-1')
    expect(result.hasConflicts).toBe(false)
    expect(result.data.quickOptimizationConfigs?.map(item => item.uuid).sort()).toEqual(['quick-1', 'quick-2'])
  })

  it('applies remote-only changes against a shared base', () => {
    const base = {
      settings: [
        { id: 1, key: 'theme', value: 'light', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const local = {
      settings: [
        { id: 2, key: 'theme', value: 'light', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const remote = {
      settings: [
        { id: 3, key: 'theme', value: 'dark', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.hasConflicts).toBe(false)
    expect(result.data.settings?.[0].value).toBe('dark')
    expect(result.summary.updated).toBe(1)
  })

  it('keeps updated data instead of letting a hard delete win silently', () => {
    const base = {
      categories: [
        { id: 1, uuid: 'cat-1', name: 'Original', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const local = {
      categories: []
    }
    const remote = {
      categories: [
        { id: 2, uuid: 'cat-1', name: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts[0]).toMatchObject({
      collection: 'categories',
      key: 'uuid:cat-1',
      reason: 'delete_vs_update',
      resolution: 'take-remote'
    })
    expect(result.data.categories?.[0].name).toBe('Remote edit')
  })

  it('detects both-modified conflicts and takes the newer record by default', () => {
    const base = {
      prompts: [
        { id: 1, uuid: 'prompt-1', title: 'Base', content: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const local = {
      prompts: [
        { id: 2, uuid: 'prompt-1', title: 'Local', content: 'A', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const remote = {
      prompts: [
        { id: 3, uuid: 'prompt-1', title: 'Remote', content: 'A', updatedAt: '2026-01-03T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts[0]).toMatchObject({
      collection: 'prompts',
      reason: 'both_modified',
      resolution: 'take-newer'
    })
    expect(result.data.prompts?.[0].title).toBe('Remote')
  })

  it('auto-merges different fields changed on the same record', () => {
    const base = {
      prompts: [
        {
          id: 1,
          uuid: 'prompt-1',
          title: 'Base title',
          content: 'Base content',
          tags: ['base'],
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
    const local = {
      prompts: [
        {
          id: 2,
          uuid: 'prompt-1',
          title: 'Local title',
          content: 'Base content',
          tags: ['base', 'local'],
          updatedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }
    const remote = {
      prompts: [
        {
          id: 3,
          uuid: 'prompt-1',
          title: 'Base title',
          content: 'Remote content',
          tags: ['base', 'remote'],
          updatedAt: '2026-01-03T00:00:00.000Z'
        }
      ]
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.hasConflicts).toBe(false)
    expect(result.data.prompts?.[0]).toMatchObject({
      uuid: 'prompt-1',
      title: 'Local title',
      content: 'Remote content',
      tags: ['base', 'local', 'remote'],
      updatedAt: '2026-01-03T00:00:00.000Z'
    })
  })

  it('still records conflicts when both devices change the same field', () => {
    const base = {
      prompts: [
        { id: 1, uuid: 'prompt-1', title: 'Base', content: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const local = {
      prompts: [
        { id: 2, uuid: 'prompt-1', title: 'Local', content: 'A', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const remote = {
      prompts: [
        { id: 3, uuid: 'prompt-1', title: 'Remote', content: 'A', updatedAt: '2026-01-03T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts[0]).toMatchObject({
      collection: 'prompts',
      reason: 'both_modified',
      resolution: 'take-newer'
    })
    expect(result.data.prompts?.[0].title).toBe('Remote')
  })

  it('lets the user keep a chosen side for each conflicting record', () => {
    const base = {
      prompts: [
        { id: 1, uuid: 'prompt-1', title: 'Base', content: 'A', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 2, uuid: 'prompt-2', title: 'Base 2', content: 'B', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
    const local = {
      prompts: [
        { id: 1, uuid: 'prompt-1', title: 'Local', content: 'Local body', updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 2, uuid: 'prompt-2', title: 'Local 2', content: 'B', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const remote = {
      prompts: [
        { id: 7, uuid: 'prompt-1', title: 'Remote', content: 'A', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 8, uuid: 'prompt-2', title: 'Remote 2', content: 'B', updatedAt: '2026-01-03T00:00:00.000Z' }
      ]
    }
    const preview = mergeCloudSyncData(local, remote, base)
    expect(preview.conflicts.map(getCloudSyncConflictId)).toEqual(['prompts::uuid:prompt-1', 'prompts::uuid:prompt-2'])

    const result = mergeCloudSyncData(local, remote, base, {
      resolutions: { 'prompts::uuid:prompt-1': 'local', 'prompts::uuid:prompt-2': 'remote' }
    })

    const byUuid = Object.fromEntries((result.data.prompts || []).map(prompt => [prompt.uuid, prompt]))
    // 选本机时整条保留本机版本，连同本机独有的正文修改
    expect(byUuid['prompt-1']).toMatchObject({ title: 'Local', content: 'Local body' })
    expect(byUuid['prompt-2']).toMatchObject({ title: 'Remote 2' })
    expect(result.conflicts.map(conflict => conflict.resolution)).toEqual(['keep-local', 'take-remote'])
  })

  it('lets the user keep a deletion over an edit from the other side', () => {
    const base = {
      categories: [{ id: 1, uuid: 'cat-1', name: 'Original', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }

    const localDeleteWins = mergeCloudSyncData(
      { categories: [] },
      { categories: [{ id: 2, uuid: 'cat-1', name: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }] },
      base,
      { resolutions: { 'categories::uuid:cat-1': 'local' } }
    )
    expect(localDeleteWins.data.categories).toEqual([])
    expect(localDeleteWins.conflicts[0]).toMatchObject({ reason: 'delete_vs_update', resolution: 'keep-local' })

    const remoteDeleteWins = mergeCloudSyncData(
      { categories: [{ id: 1, uuid: 'cat-1', name: 'Local edit', updatedAt: '2026-01-02T00:00:00.000Z' }] },
      { categories: [] },
      base,
      { resolutions: { 'categories::uuid:cat-1': 'remote' } }
    )
    expect(remoteDeleteWins.data.categories).toEqual([])
    expect(remoteDeleteWins.conflicts[0]).toMatchObject({ reason: 'delete_vs_update', resolution: 'take-remote' })
  })

  it('ignores a stored choice once the record no longer conflicts', () => {
    const base = {
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Base', content: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }
    const local = {
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local title', content: 'A', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remote = {
      prompts: [{ id: 7, uuid: 'prompt-1', title: 'Base', content: 'Remote body', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }

    const result = mergeCloudSyncData(local, remote, base, { resolutions: { 'prompts::uuid:prompt-1': 'remote' } })

    expect(result.hasConflicts).toBe(false)
    expect(result.data.prompts?.[0]).toMatchObject({ title: 'Local title', content: 'Remote body' })
  })

  it('creates sync snapshots without mutating input data', () => {
    const data = {
      aiConfigs: [
        { id: 1, configId: 'openai', name: 'OpenAI', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }

    const snapshot = createCloudSyncSnapshot(data, 'device-a', 'rev-1')
    snapshot.data.aiConfigs![0].name = 'Changed'

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      deviceId: 'device-a',
      revision: 'rev-1'
    })
    expect(snapshot.data.prompts).toEqual([])
    expect(snapshot.data.promptHistories).toEqual([])
    expect(snapshot.data.syncTombstones).toEqual([])
    expect(data.aiConfigs[0].name).toBe('OpenAI')
  })

  it('adds a deterministic checksum to new snapshots', () => {
    const left = createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'Prompt', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-1')
    const right = createCloudSyncSnapshot({
      prompts: [
        { updatedAt: '2026-01-01T00:00:00.000Z', title: 'Prompt', uuid: 'prompt-1' }
      ]
    }, 'device-a', 'rev-1')

    expect(left.dataChecksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/)
    expect(left.dataChecksum).toBe(right.dataChecksum)
    expect(validateCloudSyncSnapshot(left).valid).toBe(true)
  })

  it('creates JSON-stable checksums when records contain undefined fields', () => {
    const snapshot = createCloudSyncSnapshot({
      prompts: [
        {
          uuid: 'prompt-undefined',
          title: 'Prompt',
          optional: undefined,
          nested: {
            keep: 'value',
            drop: undefined
          },
          values: [undefined, 'kept']
        }
      ]
    }, 'device-a', 'rev-json-stable')

    const jsonRoundTripFile = JSON.parse(JSON.stringify(createCloudSyncSnapshotFile(snapshot)))
    const restoredSnapshot = assertValidCloudSyncSnapshotFile(jsonRoundTripFile)

    expect(snapshot.data.prompts![0]).not.toHaveProperty('optional')
    expect(snapshot.data.prompts![0].nested).not.toHaveProperty('drop')
    expect(snapshot.data.prompts![0].values).toEqual([null, 'kept'])
    expect(restoredSnapshot.dataChecksum).toBe(snapshot.dataChecksum)
    expect(restoredSnapshot.dataChecksum).toBe(createCloudSyncDataChecksum(restoredSnapshot.data))
  })

  it('repairs readable snapshot files with checksum metadata drift', () => {
    const snapshot = createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'Prompt', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-drift')
    const brokenFile = createCloudSyncSnapshotFile({
      ...snapshot,
      dataChecksum: 'fnv1a32:00000000'
    })

    const repairedSnapshot = assertValidCloudSyncSnapshotFile(brokenFile)

    expect(repairedSnapshot.revision).toBe('rev-drift')
    expect(repairedSnapshot.dataChecksum).toBe(createCloudSyncDataChecksum(repairedSnapshot.data))
    expect(validateCloudSyncSnapshot(repairedSnapshot).valid).toBe(true)
  })

  it('rejects snapshots that are missing required sync collections', () => {
    const snapshot = createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'Prompt', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-1')
    delete snapshot.data.promptHistories
    snapshot.dataChecksum = createCloudSyncDataChecksum(snapshot.data)

    expect(validateCloudSyncSnapshot(snapshot)).toMatchObject({
      valid: false,
      reason: 'snapshot data missing collection promptHistories'
    })
  })

  it('rejects snapshots with duplicate record sync keys', () => {
    expect(() => createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'A', updatedAt: '2026-01-01T00:00:00.000Z' },
        { uuid: 'prompt-1', title: 'B', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-1')).toThrow('snapshot data prompts has duplicate record key uuid:prompt-1')

    const snapshot = createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'A', updatedAt: '2026-01-01T00:00:00.000Z' },
        { uuid: 'prompt-2', title: 'B', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-1')
    snapshot.data.prompts![1].uuid = 'prompt-1'
    snapshot.dataChecksum = createCloudSyncDataChecksum(snapshot.data)

    expect(validateCloudSyncSnapshot(snapshot)).toMatchObject({
      valid: false,
      reason: 'snapshot data prompts has duplicate record key uuid:prompt-1'
    })
  })

  it('rejects snapshots with non-object records', () => {
    expect(() => createCloudSyncSnapshot({
      prompts: ['bad-record'] as any[]
    }, 'device-a', 'rev-1')).toThrow('snapshot data prompts[0] must be an object')
  })

  it('rejects snapshots that still contain raw image Blob values', () => {
    expect(() => createCloudSyncSnapshot({
      prompts: [
        {
          uuid: 'prompt-1',
          title: 'Prompt with raw image',
          imageBlobs: [new Blob(['image-bytes'], { type: 'image/png' })],
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }, 'device-a', 'rev-1')).toThrow('contains unserialized Blob')
  })

  it('rejects snapshots with invalid tombstones', () => {
    expect(() => createCloudSyncSnapshot({
      syncTombstones: [
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          deletedAt: 'not-a-date'
        }
      ]
    }, 'device-a', 'rev-1')).toThrow('syncTombstones[0] deletedAt is invalid')

    const snapshot = createCloudSyncSnapshot({
      syncTombstones: [
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          deletedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }, 'device-a', 'rev-1')
    delete (snapshot.data.syncTombstones as any[])[0].recordKey
    snapshot.dataChecksum = createCloudSyncDataChecksum(snapshot.data)

    expect(validateCloudSyncSnapshot(snapshot)).toMatchObject({
      valid: false,
      reason: 'snapshot data syncTombstones[0] is invalid'
    })
  })

  it('rejects snapshots when checksum does not match the data', () => {
    const snapshot = createCloudSyncSnapshot({
      prompts: [
        { uuid: 'prompt-1', title: 'Before', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }, 'device-a', 'rev-1')
    snapshot.data.prompts![0].title = 'After'

    expect(validateCloudSyncSnapshot(snapshot)).toMatchObject({
      valid: false,
      reason: 'snapshot data checksum mismatch'
    })
  })

  it('applies tombstones so deleted records do not come back from older remote data', () => {
    const local = {
      prompts: [],
      syncTombstones: [
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          recordUuid: 'prompt-1',
          deletedAt: '2026-01-03T00:00:00.000Z'
        }
      ]
    }
    const remote = {
      prompts: [
        { id: 3, uuid: 'prompt-1', title: 'Deleted remotely stale', updatedAt: '2026-01-02T00:00:00.000Z' }
      ],
      syncTombstones: []
    }

    const result = mergeCloudSyncData(local, remote)

    expect(result.data.prompts).toEqual([])
    expect(result.data.syncTombstones).toHaveLength(1)
  })

  it('does not let an older tombstone delete a newer record update', () => {
    const local = {
      prompts: [],
      syncTombstones: [
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          recordUuid: 'prompt-1',
          deletedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }
    const remote = {
      prompts: [
        { id: 3, uuid: 'prompt-1', title: 'Newer remote edit', updatedAt: '2026-01-03T00:00:00.000Z' }
      ]
    }

    const result = mergeCloudSyncData(local, remote)

    expect(result.data.prompts).toHaveLength(1)
    expect(result.data.prompts?.[0].title).toBe('Newer remote edit')
  })

  it('does not apply cascade child tombstones when the parent prompt delete loses to a newer prompt update', () => {
    const local = {
      prompts: [],
      promptVariables: [],
      promptHistories: [],
      aiHistory: [],
      syncTombstones: [
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          recordUuid: 'prompt-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: {
            id: 10,
            uuid: 'prompt-1'
          }
        },
        {
          collectionName: 'promptVariables',
          recordKey: 'uuid:variable-1',
          recordUuid: 'variable-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: {
            id: 20,
            uuid: 'variable-1',
            promptId: 10,
            promptUuid: 'prompt-1'
          }
        },
        {
          collectionName: 'promptHistories',
          recordKey: 'uuid:history-1',
          recordUuid: 'history-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: {
            id: 30,
            uuid: 'history-1',
            promptId: 10,
            promptUuid: 'prompt-1'
          }
        }
      ]
    }
    const remote = {
      prompts: [
        { id: 10, uuid: 'prompt-1', title: 'Newer generation', updatedAt: '2026-01-03T00:00:00.000Z' }
      ],
      promptVariables: [
        {
          id: 20,
          uuid: 'variable-1',
          promptId: 10,
          promptUuid: 'prompt-1',
          name: 'tone',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      promptHistories: [
        {
          id: 30,
          uuid: 'history-1',
          promptId: 10,
          promptUuid: 'prompt-1',
          result: 'Earlier history',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 31,
          uuid: 'history-2',
          promptId: 10,
          promptUuid: 'prompt-1',
          result: 'New generation history',
          updatedAt: '2026-01-03T00:00:00.000Z'
        }
      ],
      aiHistory: []
    }

    const result = mergeCloudSyncData(local, remote)

    expect(result.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-1', title: 'Newer generation' })
    ]))
    expect(result.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'variable-1', promptUuid: 'prompt-1' })
    ]))
    expect(result.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'history-1', promptUuid: 'prompt-1' }),
      expect.objectContaining({ uuid: 'history-2', promptUuid: 'prompt-1' })
    ]))
  })

  it('keeps a category when another device added a prompt that still references it', () => {
    const base = {
      categories: [
        {
          id: 1,
          uuid: 'cat-1',
          name: 'Shared category',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      prompts: [],
      syncTombstones: []
    }
    const local = {
      categories: [],
      prompts: [],
      syncTombstones: [
        {
          collectionName: 'categories',
          recordKey: 'uuid:cat-1',
          recordUuid: 'cat-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: base.categories[0]
        }
      ]
    }
    const remote = {
      categories: base.categories,
      prompts: [
        {
          id: 10,
          uuid: 'prompt-1',
          title: 'Prompt created while offline',
          categoryId: 1,
          categoryUuid: 'cat-1',
          updatedAt: '2026-01-03T00:00:00.000Z'
        }
      ],
      syncTombstones: []
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'cat-1', name: 'Shared category' })
    ]))
    expect(result.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-1',
        categoryUuid: 'cat-1'
      })
    ]))
    expect(result.data.syncTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionName: 'categories', recordUuid: 'cat-1' })
    ]))
  })

  it('does not keep a category only because a deleted prompt used to reference it', () => {
    const base = {
      categories: [
        {
          id: 1,
          uuid: 'cat-1',
          name: 'Shared category',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      prompts: [
        {
          id: 10,
          uuid: 'prompt-1',
          title: 'Prompt that was deleted',
          categoryId: 1,
          categoryUuid: 'cat-1',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      syncTombstones: []
    }
    const local = {
      categories: [],
      prompts: [],
      syncTombstones: [
        {
          collectionName: 'categories',
          recordKey: 'uuid:cat-1',
          recordUuid: 'cat-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: base.categories[0]
        },
        {
          collectionName: 'prompts',
          recordKey: 'uuid:prompt-1',
          recordUuid: 'prompt-1',
          deletedAt: '2026-01-02T00:00:00.000Z',
          recordSnapshot: base.prompts[0]
        }
      ]
    }
    const remote = {
      categories: base.categories,
      prompts: base.prompts,
      syncTombstones: []
    }

    const result = mergeCloudSyncData(local, remote, base)

    expect(result.data.categories).toEqual([])
    expect(result.data.prompts).toEqual([])
    expect(result.data.syncTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionName: 'categories', recordUuid: 'cat-1' }),
      expect.objectContaining({ collectionName: 'prompts', recordUuid: 'prompt-1' })
    ]))
  })
})

describe('conflict previews (#447)', () => {
  it('shows a prompt title, category name, tags and the beginning of the body', () => {
    const categoryNameOf = createCloudSyncCategoryNameLookup({
      categories: [{ id: 3, uuid: 'cat-3', name: '写作' }, { id: 4, uuid: 'cat-4', name: 'Deleted', isDeleted: true }]
    })
    const preview = createCloudSyncConflictPreview('prompts', {
      uuid: 'p', title: '  周报  ', content: 'x'.repeat(CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH + 50), categoryId: 3,
      tags: ['工作', ' 周报 '], description: '每周五用', imageBlobs: ['data:image/png;base64,AAAA']
    }, { categoryNameOf })

    expect(preview?.title).toBe('周报')
    expect(preview?.fields).toEqual([
      { key: 'category', value: '写作' },
      { key: 'tags', value: '工作, 周报' },
      { key: 'description', value: '每周五用' }
    ])
    expect(preview?.excerpt?.endsWith('…')).toBe(true)
    expect(Array.from(preview?.excerpt || '').length).toBe(CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH + 1)
    expect(JSON.stringify(preview)).not.toContain('image/png')
    expect(categoryNameOf({ categoryId: 4 })).toBeUndefined()
    expect(categoryNameOf({ categoryUuid: 'cat-3', categoryId: 99 })).toBe('写作')
  })

  it('never exposes API keys or endpoints of AI configs, nor secret-looking settings', () => {
    const ai = createCloudSyncConflictPreview('aiConfigs', {
      name: 'OpenAI', type: 'openai', apiKey: 'sk-secret', baseURL: 'https://api.example.com?token=x', defaultModel: 'gpt-4o'
    })
    expect(ai).toEqual({ title: 'OpenAI', fields: [{ key: 'provider', value: 'openai' }, { key: 'model', value: 'gpt-4o' }] })
    expect(JSON.stringify(ai)).not.toContain('sk-secret')

    expect(createCloudSyncConflictPreview('settings', { key: 'webdav.password', value: 'hunter2' })?.fields).toEqual([])
    expect(createCloudSyncConflictPreview('settings', { key: 'theme', value: 'dark' })?.fields).toEqual([{ key: 'value', value: 'dark' }])
  })

  it('returns no preview for a deleted or missing side', () => {
    expect(createCloudSyncConflictPreview('prompts', undefined)).toBeUndefined()
    expect(createCloudSyncConflictPreview('prompts', { uuid: 'p', title: 'x', isDeleted: true })).toBeUndefined()
    expect(createCloudSyncConflictPreview('categories', { uuid: 'c', name: 'x', _deleted: true })).toBeUndefined()
  })

  it('does not split emoji when truncating', () => {
    const preview = createCloudSyncConflictPreview('prompts', { title: 't', content: '😀'.repeat(CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH + 5) })
    expect(preview?.excerpt).toBe('😀'.repeat(CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH) + '…')
  })
})
