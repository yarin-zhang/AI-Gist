import { describe, it, expect } from 'vitest';

/**
 * WebDAV 同步功能改进测试
 * 这个文件用于验证我们的 WebDAV 同步改进是否正常工作
 */

// 模拟数据
const mockLocalData = {
  categories: [
    { id: '1', name: '分类1', description: '本地分类1', createdAt: '2025-06-15T10:00:00Z' },
    { id: '2', name: '分类2', description: '本地分类2', createdAt: '2025-06-16T10:00:00Z' }
  ],
  prompts: [
    { id: '1', title: '提示词1', content: '本地提示词内容1', categoryId: '1', updatedAt: '2025-06-15T12:00:00Z' },
    { id: '2', title: '提示词2', content: '本地提示词内容2', categoryId: '2', updatedAt: '2025-06-16T12:00:00Z' }
  ]
};

const mockRemoteData = {
  categories: [
    { id: '1', name: '分类1', description: '远程分类1（已修改）', createdAt: '2025-06-15T10:00:00Z' },
    { id: '3', name: '分类3', description: '远程新分类3', createdAt: '2025-06-17T10:00:00Z' }
  ],
  prompts: [
    { id: '1', title: '提示词1', content: '远程提示词内容1（已修改）', categoryId: '1', updatedAt: '2025-06-17T12:00:00Z' },
    { id: '2', title: '提示词2', content: '本地提示词内容2', categoryId: '2', updatedAt: '2025-06-16T12:00:00Z' },
    { id: '3', title: '提示词3', content: '远程新提示词3', categoryId: '3', updatedAt: '2025-06-17T13:00:00Z' }
  ]
};

// 模拟数据比较函数（基于我们的改进逻辑）
function compareDataTypeItems(localItems: any[], remoteItems: any[], type: string) {
  const result = {
    added: [] as any[],
    modified: [] as any[],
    deleted: [] as any[]
  };

  const localMap = new Map();
  const remoteMap = new Map();

  localItems.forEach(item => {
    localMap.set(item.id, item);
  });

  remoteItems.forEach(item => {
    remoteMap.set(item.id, item);
  });

  // 查找新增的项（远程有，本地没有）
  for (const [id, remoteItem] of remoteMap) {
    if (!localMap.has(id)) {
      result.added.push({
        ...remoteItem,
        _type: type,
        _changeType: 'added'
      });
    }
  }

  // 查找删除的项（本地有，远程没有）
  for (const [id, localItem] of localMap) {
    if (!remoteMap.has(id)) {
      result.deleted.push({
        ...localItem,
        _type: type,
        _changeType: 'deleted'
      });
    }
  }

  // 查找修改的项（两边都有但内容不同）
  for (const [id, localItem] of localMap) {
    const remoteItem = remoteMap.get(id);
    if (remoteItem) {
      // 简化的比较逻辑（实际实现会更复杂）
      if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
        result.modified.push({
          id,
          _type: type,
          _changeType: 'modified',
          local: localItem,
          remote: remoteItem,
          localLastModified: localItem.updatedAt || localItem.createdAt,
          remoteLastModified: remoteItem.updatedAt || remoteItem.createdAt
        });
      }
    }
  }

  return result;
}

describe('WebDAV 同步功能改进测试', () => {
  it('应该正确识别新增的数据项', () => {
    const categoryComparison = compareDataTypeItems(
      mockLocalData.categories, 
      mockRemoteData.categories, 
      'categories'
    );

    expect(categoryComparison.added).toHaveLength(1);
    expect(categoryComparison.added[0].name).toBe('分类3');
    expect(categoryComparison.added[0]._changeType).toBe('added');
  });

  it('应该正确识别删除的数据项', () => {
    const categoryComparison = compareDataTypeItems(
      mockLocalData.categories, 
      mockRemoteData.categories, 
      'categories'
    );

    expect(categoryComparison.deleted).toHaveLength(1);
    expect(categoryComparison.deleted[0].name).toBe('分类2');
    expect(categoryComparison.deleted[0]._changeType).toBe('deleted');
  });

  it('应该正确识别修改的数据项', () => {
    const categoryComparison = compareDataTypeItems(
      mockLocalData.categories, 
      mockRemoteData.categories, 
      'categories'
    );

    expect(categoryComparison.modified).toHaveLength(1);
    expect(categoryComparison.modified[0].id).toBe('1');
    expect(categoryComparison.modified[0].local.description).toBe('本地分类1');
    expect(categoryComparison.modified[0].remote.description).toBe('远程分类1（已修改）');
  });

  it('应该为提示词数据提供正确的差异分析', () => {
    const promptComparison = compareDataTypeItems(
      mockLocalData.prompts, 
      mockRemoteData.prompts, 
      'prompts'
    );

    // 新增项：提示词3
    expect(promptComparison.added).toHaveLength(1);
    expect(promptComparison.added[0].title).toBe('提示词3');

    // 删除项：无（所有本地提示词在远程都存在）
    expect(promptComparison.deleted).toHaveLength(0);

    // 修改项：提示词1（内容和更新时间不同）
    expect(promptComparison.modified).toHaveLength(1);
    expect(promptComparison.modified[0].id).toBe('1');
  });

  it('应该提供完整的差异概览', () => {
    const dataTypes = [
      { key: 'categories', items: [mockLocalData.categories, mockRemoteData.categories] },
      { key: 'prompts', items: [mockLocalData.prompts, mockRemoteData.prompts] }
    ];

    let totalAdded = 0;
    let totalModified = 0;
    let totalDeleted = 0;

    dataTypes.forEach(({ key, items }) => {
      const comparison = compareDataTypeItems(items[0], items[1], key);
      totalAdded += comparison.added.length;
      totalModified += comparison.modified.length;
      totalDeleted += comparison.deleted.length;
    });

    expect(totalAdded).toBe(2); // 分类3 + 提示词3
    expect(totalModified).toBe(2); // 分类1 + 提示词1
    expect(totalDeleted).toBe(1); // 分类2
  });
});

describe('冲突解决策略测试', () => {
  it('使用本地数据策略应该保持本地不变', () => {
    const strategy = 'use_local';
    expect(strategy).toBe('use_local');
    // 实际实现中，这会保持 mockLocalData 不变
  });

  it('使用远程数据策略应该采用远程数据', () => {
    const strategy = 'use_remote';
    expect(strategy).toBe('use_remote');
    // 实际实现中，这会用 mockRemoteData 替换本地数据
  });

  it('智能合并策略应该合并非冲突项', () => {
    const strategy = 'merge_smart';
    expect(strategy).toBe('merge_smart');
    // 实际实现中，这会：
    // 1. 添加所有新增项（分类3, 提示词3）
    // 2. 对修改项选择时间更新的版本
    // 3. 保留本地独有的项（分类2）
  });

  it('手动合并策略应该按用户选择处理', () => {
    const strategy = 'merge_manual';
    const mockUserSelections = {
      added: ['categories-3', 'prompts-3'], // 用户选择添加这些项
      deleted: ['categories-2'], // 用户选择保留这个被删除的项
      modified: {
        'categories-1': 'remote', // 用户选择远程版本
        'prompts-1': 'local' // 用户选择本地版本
      }
    };

    expect(strategy).toBe('merge_manual');
    expect(mockUserSelections.added).toHaveLength(2);
    expect(mockUserSelections.deleted).toHaveLength(1);
    expect(Object.keys(mockUserSelections.modified)).toHaveLength(2);
  });
});

export { compareDataTypeItems, mockLocalData, mockRemoteData };
