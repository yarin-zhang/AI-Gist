# 同步服务测试文档

## 概述

本项目为 WebDAV 和 iCloud 同步服务提供了全面的测试覆盖，采用 Vitest 测试框架，涵盖了各种复杂场景和边界情况。

## 测试结构

```
test/
├── main/electron/
│   ├── webdav-service.test.ts     # WebDAV 同步服务测试
│   └── icloud-service.test.ts     # iCloud 同步服务测试
├── integration/
│   └── sync-services.test.ts      # 集成测试
├── algorithms/
│   └── uuid-sync-algorithm.test.ts # UUID 同步算法测试
└── helpers/
    └── test-utils.ts              # 测试工具和数据生成器
```

## 测试类别

### 1. WebDAV 同步服务测试 (`webdav-service.test.ts`)

**覆盖场景：**
- ✅ 基础功能：初始化、IPC 处理器设置和清理
- ✅ 密码加密解密：AES-256-CBC 加密、解密、格式检测
- ✅ 连接测试：成功连接、连接失败、网络错误
- ✅ 同步决策算法：首次上传/下载、数据相同检测、冲突检测
- ✅ 数据合并：提示词合并、分类合并、重复数据处理
- ✅ 数据哈希计算：一致性验证、差异检测
- ✅ 同步执行：上传操作、网络错误处理、配置验证
- ✅ 边界情况：大量数据、JSON 解析错误、并发访问
- ✅ 性能测试：哈希计算性能、数据排序效率

**关键测试用例：**
```typescript
it('应该基于记录数差异做决策', async () => {
  // 测试当远程有更多数据时，是否选择下载
})

it('应该检测并发修改并选择合并', async () => {
  // 测试时间差较小的并发修改场景
})

it('应该处理大量数据', async () => {
  // 测试 1000+ 记录的性能表现
})
```

### 2. iCloud 同步服务测试 (`icloud-service.test.ts`)

**覆盖场景：**
- ✅ 基础功能：服务初始化、路径配置
- ✅ iCloud 可用性检测：目录存在性、权限检查、读写测试
- ✅ 同步决策算法：与 WebDAV 一致的决策逻辑
- ✅ 数据哈希和标准化：时间戳字段过滤、数组排序
- ✅ 数据变更分析：首次同步、增量变更、无变更检测
- ✅ 同步执行：立即同步、手动上传/下载、冲突解决
- ✅ 边界情况：空目录、损坏文件、权限拒绝
- ✅ 配置管理：获取/设置配置、目录操作
- ✅ 性能测试：大数据处理、内存使用优化

**关键测试用例：**
```typescript
it('应该正确检测分类变更', () => {
  // 测试基于 UUID 的精确变更检测
})

it('应该处理时间戳相同但内容不同的冲突', () => {
  // 测试冲突检测和解决机制
})

it('应该高效处理数据变更分析', () => {
  // 测试 5000+ 记录的变更分析性能
})
```

### 3. 同步服务集成测试 (`sync-services.test.ts`)

**覆盖场景：**
- ✅ 基于 UUID 的同步：记录级别比较、时间戳冲突解决
- ✅ 复杂同步场景：大规模增量同步、网络中断重试
- ✅ 服务间冲突：同时使用 WebDAV 和 iCloud
- ✅ 数据完整性验证：序列化一致性、哈希验证
- ✅ 错误恢复：部分失败恢复、磁盘空间不足
- ✅ 性能和压力测试：高并发、超大数据集
- ✅ 数据一致性：跨服务一致性、类型转换

**关键测试用例：**
```typescript
it('应该正确处理基于UUID的数据同步', async () => {
  // 测试 UUID 主键和时间戳的冲突解决
})

it('应该处理大规模数据的增量同步', async () => {
  // 测试 1000+ 记录的增量同步性能
})

it('应该在高并发情况下保持稳定', async () => {
  // 测试 10 个并发同步操作的稳定性
})
```

### 4. UUID 同步算法测试 (`uuid-sync-algorithm.test.ts`)

**覆盖场景：**
- ✅ 基础合并功能：无冲突合并、时间戳比较
- ✅ 冲突解决：本地优先、远程优先、时间戳相同处理
- ✅ 复杂场景：多种变更混合、大规模数据合并
- ✅ 边界情况：空数据集、缺失时间戳、无效格式
- ✅ 差异报告：详细统计、冲突详情

**核心算法逻辑：**
```typescript
// 基于时间戳解决冲突的核心逻辑
if (localTime > remoteTime) {
  winner = localRecord
} else if (remoteTime > localTime) {
  winner = remoteRecord
} else {
  // 时间戳相同，检查内容差异
  if (hasContentChanges) {
    hasConflict = true
    winner = localRecord // 默认优先本地
  }
}
```

## 运行测试

### 使用 Yarn 脚本（推荐）

```bash
# 运行所有测试（监视模式）
yarn test

# 运行一次所有测试
yarn test:run

# 带UI界面的测试
yarn test:ui

# 生成覆盖率报告
yarn test:coverage
```

### 运行特定测试

```bash
# 只运行 WebDAV 测试
yarn test webdav-service

# 只运行 iCloud 测试  
yarn test icloud-service

# 运行集成测试
yarn test sync-services

# 运行算法测试
yarn test uuid-sync-algorithm

# 监视特定测试文件
yarn test --watch test/main/electron/webdav-service.test.ts
```

### 使用 Vitest 命令

```bash
# 运行特定测试文件
npx vitest run test/main/electron/webdav-service.test.ts

# 监视模式
npx vitest watch test/main/electron/icloud-service.test.ts

# 运行匹配模式的测试
npx vitest run --grep "UUID"
```

## 测试数据生成器

### 基础生成器

```typescript
// 创建模拟分类
const category = testDataGenerators.createMockCategory({
  uuid: 'custom-uuid',
  name: '自定义分类',
  updatedAt: '2023-01-01T12:00:00Z'
})

// 创建模拟提示词
const prompt = testDataGenerators.createMockPrompt({
  uuid: 'custom-uuid',
  title: '自定义提示词',
  content: '自定义内容',
  updatedAt: '2023-01-01T12:00:00Z'
})
```

### 高级生成器

```typescript
// 创建冲突数据对
const conflict = testDataGenerators.createSyncConflictScenario('timestamp_conflict')

// 创建大量测试数据
const bulkData = testDataGenerators.createBulkTestData('test', 1000, {
  baseTime: Date.now(),
  timeIncrement: 1000
})

// 创建具有冲突的数据对
const conflictPair = testDataGenerators.createConflictingDataPair('uuid-001', Date.now())
```

## 测试重点场景

### 1. UUID 冲突解决

测试相同 UUID 的记录在不同时间戳下的冲突解决：

```typescript
// 场景：本地版本更新
localRecord.updatedAt = '2023-01-01T12:00:00Z'
remoteRecord.updatedAt = '2023-01-01T10:00:00Z'
// 期望：选择本地版本

// 场景：远程版本更新  
localRecord.updatedAt = '2023-01-01T10:00:00Z'
remoteRecord.updatedAt = '2023-01-01T12:00:00Z'
// 期望：选择远程版本

// 场景：时间戳相同但内容不同
localRecord.updatedAt = remoteRecord.updatedAt = '2023-01-01T12:00:00Z'
localRecord.title = '本地标题'
remoteRecord.title = '远程标题'
// 期望：产生冲突，默认选择本地版本
```

### 2. 增量同步

测试大量数据的增量同步性能：

```typescript
// 创建 1000 条本地记录
const localData = createBulkTestData('local', 1000)

// 创建 800 条远程记录
const remoteData = createBulkTestData('remote', 800)

// 期望：合并后有 1800 条记录，处理时间 < 1秒
```

### 3. 网络容错

测试网络不稳定情况下的重试机制：

```typescript
// 模拟前两次网络失败，第三次成功
let attemptCount = 0
mockClient.stat.mockImplementation(() => {
  attemptCount++
  if (attemptCount <= 2) {
    throw new Error('Network timeout')
  }
  return Promise.resolve({ type: 'directory' })
})

// 期望：最终同步成功，attemptCount = 3
```

## 性能基准

### 期望性能指标

| 操作 | 数据量 | 期望时间 | 实际测试 |
|------|--------|----------|----------|
| 数据哈希计算 | 10,000 记录 | < 1秒 | ✅ |
| 数据排序 | 1,000 记录 | < 100毫秒 | ✅ |
| 增量同步 | 1,000 记录 | < 1秒 | ✅ |
| 变更分析 | 5,000 记录 | < 500毫秒 | ✅ |
| 并发同步 | 10 个请求 | < 5秒 | ✅ |

### 内存使用

- ✅ 大数据集处理不应导致内存泄漏
- ✅ 并行处理多个数据集应保持稳定
- ✅ 长时间运行的同步操作应释放临时内存

## 错误处理覆盖

### 网络错误
- ✅ 连接超时
- ✅ 认证失败
- ✅ 服务器不可达
- ✅ 数据传输中断

### 文件系统错误  
- ✅ 权限拒绝
- ✅ 磁盘空间不足
- ✅ 目录不存在
- ✅ 文件锁定

### 数据错误
- ✅ JSON 格式错误
- ✅ 数据损坏
- ✅ 缺失必要字段
- ✅ 类型转换错误

## 扩展测试

### 添加新的测试场景

1. **创建测试文件**：在相应目录下创建 `.test.ts` 文件
2. **使用测试工具**：导入 `testDataGenerators` 生成测试数据
3. **编写测试用例**：使用 Vitest 的 `describe`、`it`、`expect` API
4. **添加到测试脚本**：在 `test-sync-services.js` 中添加新的测试类别

### 自定义数据生成器

```typescript
// 扩展测试工具
export const customTestGenerators = {
  createSpecialScenario: (options) => {
    // 自定义场景生成逻辑
  }
}
```

### Mock 服务扩展

```typescript
// 扩展 Mock 服务
const customMockService = {
  // 自定义 Mock 实现
}
```

## 最佳实践

1. **独立性**：每个测试用例应该独立，不依赖其他测试的状态
2. **清理**：使用 `beforeEach` 和 `afterEach` 确保测试环境干净
3. **真实性**：测试数据应该尽可能接近真实使用场景
4. **覆盖率**：确保关键业务逻辑有足够的测试覆盖
5. **性能**：包含性能测试确保在合理时间内完成操作
6. **边界条件**：测试各种边界情况和异常场景

## 持续集成

建议在 CI/CD 流程中：

1. **每次提交**：运行快速测试套件
2. **Pull Request**：运行完整测试套件
3. **发布前**：运行性能测试和压力测试
4. **定期**：运行覆盖率分析

```yaml
# GitHub Actions 示例
- name: Run Sync Services Tests
  run: |
    node scripts/test-sync-services.js all --coverage
    node scripts/test-sync-services.js integration --bail
```
