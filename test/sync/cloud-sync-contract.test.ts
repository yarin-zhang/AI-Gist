import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CLOUD_SYNC_COLLECTION_CONTRACT,
  getCloudSyncStableIdentity,
  pruneCloudSyncTombstonedPromptChildren,
  quarantineCloudSyncContractIssues,
  reconcileCloudSyncDataContract
} from '@shared/cloud-sync-contract';

describe('cloud sync data contract', () => {
  it('declares the database stores, stable identities, and business unique keys', () => {
    expect(CLOUD_SYNC_COLLECTION_CONTRACT.categories).toEqual({
      storeName: 'categories',
      stableIdentityFields: ['uuid'],
      businessUniqueFields: ['name']
    });
    expect(CLOUD_SYNC_COLLECTION_CONTRACT.aiConfigs.storeName).toBe('ai_configs');
    expect(CLOUD_SYNC_COLLECTION_CONTRACT.aiConfigs.businessUniqueFields).toEqual(['configId']);
    expect(CLOUD_SYNC_COLLECTION_CONTRACT.aiHistory).toMatchObject({
      storeName: 'ai_generation_history',
      businessUniqueFields: ['historyId']
    });
    expect(getCloudSyncStableIdentity('aiConfigs', { configId: 'config-1' })).toBe('configId:config-1');
  });

  it('merges same-name categories deterministically and rewrites every category relation', () => {
    const input = {
      categories: [
        { id: 2, uuid: 'cat-z', name: 'Work', description: 'filled', createdAt: '2026-01-02' },
        { id: 1, uuid: 'cat-a', name: 'Work', color: '#fff', createdAt: '2026-01-01' },
        { id: 3, uuid: 'child', name: 'Child', parentUuid: 'cat-z', parentId: 2 }
      ],
      prompts: [
        { id: 10, uuid: 'prompt-1', categoryUuid: 'cat-z', categoryId: 2 }
      ],
      promptVariables: [
        { id: 20, uuid: 'variable-1', promptUuid: 'prompt-1', promptId: 10 }
      ],
      promptHistories: [
        {
          id: 30,
          uuid: 'prompt-history-1',
          promptUuid: 'prompt-1',
          promptId: 10,
          categoryUuid: 'cat-z',
          categoryId: 2
        }
      ]
    };

    const result = reconcileCloudSyncDataContract(input);

    expect(result.valid).toBe(true);
    expect(result.data.categories).toHaveLength(2);
    expect(result.data.categories?.find(item => item.uuid === 'cat-a')).toMatchObject({
      id: 1,
      name: 'Work',
      color: '#fff',
      description: 'filled'
    });
    expect(result.data.categories?.find(item => item.uuid === 'child')).toMatchObject({
      parentUuid: 'cat-a',
      parentId: 1
    });
    expect(result.data.prompts?.[0]).toMatchObject({ categoryUuid: 'cat-a', categoryId: 1 });
    expect(result.data.promptHistories?.[0]).toMatchObject({ categoryUuid: 'cat-a', categoryId: 1 });
    expect(input.categories[0].uuid).toBe('cat-z');
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0]).not.toHaveProperty('businessKey');
    expect(JSON.stringify(result.merges[0])).not.toContain('Work');
  });

  it('prefers the base UUID over creation time and rewrites relations to it', () => {
    const base = {
      categories: [{ id: 99, uuid: 'cat-base', name: 'Shared', createdAt: '2025-01-01' }]
    };
    const input = {
      categories: [
        { id: 1, uuid: 'cat-oldest', name: 'Shared', createdAt: '2020-01-01' },
        { id: 2, uuid: 'cat-base', name: 'Shared', createdAt: '2026-01-01' }
      ],
      prompts: [{ uuid: 'prompt-1', categoryUuid: 'cat-oldest', categoryId: 1 }]
    };

    const result = reconcileCloudSyncDataContract(input, base);

    expect(result.data.categories).toHaveLength(1);
    expect(result.data.categories?.[0].uuid).toBe('cat-base');
    expect(result.data.prompts?.[0]).toMatchObject({ categoryUuid: 'cat-base', categoryId: 2 });
  });

  it('uses lexical UUID ordering when creation times tie', () => {
    const first = reconcileCloudSyncDataContract({
      aiConfigs: [
        { id: 2, uuid: 'config-z', configId: 'shared', createdAt: '2026-01-01' },
        { id: 1, uuid: 'config-a', configId: 'shared', createdAt: '2026-01-01' }
      ]
    });
    const second = reconcileCloudSyncDataContract({
      aiConfigs: [...first.data.aiConfigs!].reverse().map(item => ({ ...item }))
    });

    expect(first.data.aiConfigs).toHaveLength(1);
    expect(first.data.aiConfigs?.[0].uuid).toBe('config-a');
    expect(second.data.aiConfigs?.[0].uuid).toBe('config-a');
  });

  it('deduplicates configId and historyId before IndexedDB unique indexes are reached', () => {
    const result = reconcileCloudSyncDataContract({
      aiConfigs: [
        { uuid: 'cfg-b', configId: 'cfg-1', createdAt: '2026-01-02' },
        { uuid: 'cfg-a', configId: 'cfg-1', createdAt: '2026-01-01' }
      ],
      aiHistory: [
        { uuid: 'history-b', historyId: 'history-1', createdAt: '2026-01-02' },
        { uuid: 'history-a', historyId: 'history-1', createdAt: '2026-01-01' }
      ]
    });

    expect(result.data.aiConfigs?.map(item => item.uuid)).toEqual(['cfg-a']);
    expect(result.data.aiHistory?.map(item => item.uuid)).toEqual(['history-a']);
    expect(result.merges.map(item => item.collection)).toEqual(['aiConfigs', 'aiHistory']);
  });

  it('prefers relation UUIDs when a legacy numeric ID disagrees', () => {
    const result = reconcileCloudSyncDataContract({
      categories: [
        { id: 1, uuid: 'category-a', name: 'A' },
        { id: 2, uuid: 'category-b', name: 'B' }
      ],
      prompts: [
        { id: 10, uuid: 'prompt-1', categoryUuid: 'category-b', categoryId: 1 }
      ],
      promptVariables: [],
      promptHistories: []
    });

    expect(result.valid).toBe(true);
    expect(result.data.prompts?.[0]).toMatchObject({ categoryUuid: 'category-b', categoryId: 2 });
  });

  it('resolves an unambiguous legacy numeric relation and adds its UUID', () => {
    const result = reconcileCloudSyncDataContract({
      prompts: [{ id: 10, uuid: 'prompt-1' }],
      promptVariables: [{ uuid: 'variable-1', promptId: 10 }],
      promptHistories: [{ uuid: 'history-1', promptId: 10 }]
    });

    expect(result.valid).toBe(true);
    expect(result.data.promptVariables?.[0]).toMatchObject({ promptUuid: 'prompt-1', promptId: 10 });
    expect(result.data.promptHistories?.[0]).toMatchObject({ promptUuid: 'prompt-1', promptId: 10 });
  });

  it('reports unresolved UUIDs without guessing from a numeric ID', () => {
    const result = reconcileCloudSyncDataContract({
      prompts: [
        { id: 10, uuid: 'prompt-real' },
        { id: 11, uuid: 'prompt-other' }
      ],
      promptVariables: [
        { id: 20, uuid: 'variable-1', promptUuid: 'prompt-missing', promptId: 10, defaultValue: 'secret' }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.data.promptVariables?.[0].promptUuid).toBe('prompt-missing');
    expect(result.issues).toEqual([{
      code: 'unresolved_relation_uuid',
      collection: 'promptVariables',
      recordIdentity: 'uuid:variable-1',
      relation: 'prompt',
      targetCollection: 'prompts',
      referenceUuid: 'prompt-missing'
    }]);
    expect(JSON.stringify(result.issues)).not.toContain('secret');
  });

  it('reports ambiguous numeric relations instead of choosing by input order', () => {
    const result = reconcileCloudSyncDataContract({
      prompts: [
        { id: 10, uuid: 'prompt-a' },
        { id: 10, uuid: 'prompt-b' }
      ],
      promptVariables: [{ uuid: 'variable-1', promptId: 10 }]
    });

    expect(result.valid).toBe(false);
    expect(result.data.promptVariables?.[0]).not.toHaveProperty('promptUuid');
    expect(result.issues[0]).toMatchObject({
      code: 'ambiguous_relation_id',
      recordIdentity: 'uuid:variable-1',
      referenceId: '10'
    });
  });

  it('reports missing required prompt relations and removes self-parent links', () => {
    const result = reconcileCloudSyncDataContract({
      categories: [{ id: 1, uuid: 'category-1', name: 'A', parentUuid: 'category-1' }],
      promptVariables: [{ uuid: 'variable-1' }]
    });

    expect(result.valid).toBe(false);
    expect(result.data.categories?.[0]).not.toHaveProperty('parentUuid');
    expect(result.issues.map(issue => issue.code)).toEqual([
      'self_relation',
      'missing_required_relation'
    ]);
  });

  it('prunes prompt children only when their parent was conclusively tombstoned', () => {
    const pruned = pruneCloudSyncTombstonedPromptChildren({
      prompts: [],
      promptVariables: [{ uuid: 'variable-1', promptId: 10, promptUuid: 'prompt-1' }],
      promptHistories: [{ uuid: 'history-1', promptId: 10, promptUuid: 'prompt-1' }],
      syncTombstones: [{
        collectionName: 'prompts',
        recordKey: 'uuid:prompt-1',
        recordUuid: 'prompt-1',
        recordSnapshot: { id: 10, uuid: 'prompt-1' },
        deletedAt: '2026-01-01T00:00:00.000Z'
      }]
    });

    expect(pruned.promptVariables).toEqual([]);
    expect(pruned.promptHistories).toEqual([]);
  });

  it('is deterministic for duplicate business keys regardless of device record order', () => {
    fc.assert(fc.property(
      fc.uuid(),
      fc.uuid(),
      fc.integer({ min: 0, max: 2_000_000_000 }),
      fc.integer({ min: 0, max: 2_000_000_000 }),
      (uuidA, uuidB, timeA, timeB) => {
        fc.pre(uuidA !== uuidB);
        const left = {
          id: 1,
          uuid: uuidA,
          name: 'Shared category',
          createdAt: new Date(timeA).toISOString(),
          description: 'left'
        };
        const right = {
          id: 2,
          uuid: uuidB,
          name: 'Shared category',
          createdAt: new Date(timeB).toISOString(),
          color: '#fff'
        };

        const forward = reconcileCloudSyncDataContract({ categories: [left, right] });
        const reverse = reconcileCloudSyncDataContract({ categories: [right, left] });
        expect(forward.data).toEqual(reverse.data);
        expect(forward.merges).toEqual(reverse.merges);
      }
    ), { numRuns: 100 });
  });

  it('quarantines an invalid prompt and its dependent records as one complete group', () => {
    const data = {
      categories: [],
      prompts: [{ id: 10, uuid: 'prompt-1', title: 'orphan', categoryUuid: 'missing-category' }],
      promptVariables: [{ id: 20, uuid: 'variable-1', promptId: 10, promptUuid: 'prompt-1' }],
      promptHistories: [{ id: 30, uuid: 'history-1', promptId: 10, promptUuid: 'prompt-1' }]
    };
    const contract = reconcileCloudSyncDataContract(data);
    const quarantine = quarantineCloudSyncContractIssues(contract.data, contract.issues);

    expect(contract.valid).toBe(false);
    expect(quarantine.groups).toHaveLength(1);
    expect(quarantine.groups[0].records.map(record => record.recordIdentity)).toEqual([
      'uuid:history-1',
      'uuid:prompt-1',
      'uuid:variable-1'
    ]);
    expect(quarantine.data.prompts).toEqual([]);
    expect(quarantine.data.promptVariables).toEqual([]);
    expect(quarantine.data.promptHistories).toEqual([]);
  });
});
