# WebDAV 删除同步完整解决方案

## 问题描述

在 Prompt 管理中，批量删除操作后存在以下问题：

1. **删除后立即回滚**：删除操作后，WebDAV 认为是远端有新数据，导致数据立即恢复到本地
2. **手动同步时重新下载**：手动触发同步时，被删除的数据会从远端重新下载到本地

## 根本原因

1. **删除记录收集不完整**：批量删除时没有正确收集所有相关数据的 UUID（提示词、变量、历史记录）
2. **同步时机不当**：删除操作过程中多次触发同步，导致状态混乱
3. **删除记录清理过早**：删除记录在确认远程删除前就被清理
4. **本地快照包含已删除数据**：本地快照生成时没有正确过滤已删除的项目

## 完整解决方案

### 1. 改进批量删除逻辑 (`PromptService.batchDeletePrompts`)

```typescript
// 1. 预先收集所有需要同步的UUID
const allDeletedUuids: string[] = [];
// 收集提示词、变量、历史记录的UUID

// 2. 禁用自动同步，避免多次触发
const originalAutoSyncEnabled = autoSyncManager.getConfig().enabled;
if (originalAutoSyncEnabled) {
  autoSyncManager.disable();
}

// 3. 执行删除操作（不触发同步）
await this.batchDeleteWithoutSync('promptVariables', variableIds);
await this.batchDeleteWithoutSync('prompts', ids);

// 4. 手动触发一次同步，传递所有删除的UUID
autoSyncManager.triggerAutoSyncAfterBatchDelete(allDeletedUuids, reason);

// 5. 恢复自动同步状态
if (originalAutoSyncEnabled) {
  autoSyncManager.enable();
}
```

### 2. 改进 WebDAV 同步逻辑

#### 2.1 删除阶段 (`performDeleteRemotePhase`)

```typescript
// 获取删除记录，用于识别本地已删除的项目
const deletedItems = await this.getDeletedItems();
const deletedUUIDs = new Set(deletedItems.map(item => item.uuid));

// 检查是否应该删除远程项目
const shouldDelete = !localItem || // 本地不存在
                   localItem.metadata.deleted || // 本地标记为删除
                   deletedUUIDs.has(id); // 在删除记录中
```

#### 2.2 下载阶段 (`performDownloadAndMergePhase`)

```typescript
// 检查这个项目是否是本地已删除的
if (deletedUUIDs.has(id)) {
  console.log(`[WebDAV] 跳过已删除的项目: ${id} (在删除记录中)`);
  continue; // 跳过已删除的项目，不下载
}

// 检查远程项目是否被标记为删除
if (remoteItem.metadata.deleted) {
  console.log(`[WebDAV] 跳过远程删除的项目: ${id} (远程标记为删除)`);
  continue; // 跳过远程删除的项目
}
```

#### 2.3 本地快照生成 (`getLocalSnapshot`)

```typescript
// 获取删除记录，用于过滤已删除的项目
const deletedItems = await this.getDeletedItems();
const deletedUUIDs = new Set(deletedItems.map(item => item.uuid));

// 过滤掉已删除的项目，确保它们不会出现在本地快照中
const activeItems = items.filter(item => !deletedUUIDs.has(item.id));

// 为删除记录创建软删除项目（用于同步删除操作）
const deletedDataItems: DataItem[] = deletedItems.map(deletedItem => ({
  id: deletedItem.uuid,
  type: 'prompt',
  title: '[已删除]',
  content: null,
  metadata: {
    // ... 其他元数据
    deleted: true, // 软删除标记
  }
}));
```

### 3. 改进删除记录管理

#### 3.1 记录删除项目

```typescript
// 在删除操作时记录UUID
await WebDAVAPI.recordDeletedItems(metadata.deletedUUIDs);
```

#### 3.2 清理删除记录

```typescript
// 只有在确认远程服务器也删除了这些项目后才清理
private async cleanupDeletedItems(syncedUuids: string[]): Promise<void> {
  const remainingDeletedItems = deletedItems.filter(item => 
    !syncedUuids.includes(item.uuid)
  );
  
  // 只清理已确认在远程删除的项目
  if (cleanedCount > 0) {
    await this.preferencesManager.updatePreferences({
      webdav: {
        ...preferences.webdav,
        deletedItems: remainingDeletedItems
      }
    });
  }
}
```

### 4. 改进自动同步管理器

#### 4.1 批量删除专用同步方法

```typescript
triggerAutoSyncAfterBatchDelete(deletedUUIDs: string[], reason = '批量删除后自动同步') {
  const metadata: SyncMetadata = {
    deletedUUIDs,
    source: 'batch-delete',
    reason
  };
  
  this.triggerAutoSync(reason, metadata);
}
```

#### 4.2 状态管理

```typescript
// 添加配置状态获取方法
getConfig(): AutoSyncConfig {
  return { ...this.config };
}

// 在批量删除时正确保存和恢复状态
const originalAutoSyncEnabled = autoSyncManager.getConfig().enabled;
// ... 执行删除操作
if (originalAutoSyncEnabled) {
  autoSyncManager.enable();
}
```

## 同步流程

### 批量删除后的同步流程

1. **收集UUID**：删除前收集所有相关数据的 UUID
2. **禁用自动同步**：避免删除过程中的多次同步
3. **执行删除**：使用不触发同步的删除方法
4. **记录删除**：将删除的 UUID 记录到 WebDAV 服务
5. **触发同步**：手动触发一次同步，传递删除的 UUID
6. **恢复状态**：恢复自动同步状态

### WebDAV 同步流程

1. **生成本地快照**：过滤已删除项目，创建软删除标记
2. **删除远程项目**：根据删除记录删除远程项目
3. **下载远程变更**：跳过已删除的项目，不重新下载
4. **清理删除记录**：确认远程删除后清理本地删除记录

## 测试验证

创建了测试文件 `test/webdav-delete-sync.test.ts` 来验证：

1. UUID 收集的正确性
2. 删除记录的同步处理
3. 自动同步状态的保存和恢复

## 预期效果

修复后，批量删除操作应该：

1. ✅ 正确收集所有删除项目的 UUID
2. ✅ 只触发一次同步操作
3. ✅ 将删除操作同步到远端
4. ✅ 防止被删除的数据重新下载
5. ✅ 正确处理删除记录的清理

## 注意事项

1. **删除记录保留时间**：删除记录保留 30 天，避免数据无限增长
2. **网络异常处理**：网络异常时删除记录不会丢失，下次同步时会重试
3. **多设备同步**：删除操作会在所有设备间同步，确保数据一致性 