# 项目结构重构说明

## 重构目标
- 消除重复的代码和类型定义
- 明确各目录职责
- 统一管理共享资源
- 简化依赖关系

## 目录结构说明

### 主要目录职责

#### `src/main/electron/`
**职责**: 主进程 Electron 相关代码
- `ipc-handlers.ts` - IPC 请求处理器
- `preferences-manager.ts` - 用户偏好设置管理
- `window-manager.ts` - 窗口管理
- `theme-manager.ts` - 主题管理
- `ai-service-manager.ts` - AI 服务管理
- `webdav-service.ts` - WebDAV 同步服务
- `data-management-service.ts` - 数据管理服务

#### `src/renderer/lib/`
**职责**: 渲染进程业务逻辑库
- `db.ts` - 数据库主入口
- `ipc.ts` - IPC 通信工具（新统一版本）
- `services/` - 各种业务服务类
- `api/` - API 调用封装
- `utils/` - 工具函数集合

#### `src/shared/`
**职责**: 主进程和渲染进程共享的代码
- `types/` - 统一的类型定义
  - `common.ts` - 通用类型
  - `database.ts` - 数据库相关类型
  - `electron.ts` - Electron 相关类型
  - `ipc.ts` - IPC 通信类型

#### `test/`
**职责**: 统一的测试目录
- 所有测试文件都在这里
- 避免分散在多个地方

### 重构更改

#### 1. 类型定义统一化
**移除了分散的类型定义:**
- ❌ `src/renderer/lib/types/database.ts`
- ❌ `src/main/electron/types.ts`
- ❌ `src/shared/types/database.types.ts`
- ❌ `src/shared/types/ipc.types.ts`

**统一到:**
- ✅ `src/shared/types/` 目录下的分类文件

#### 2. IPC 逻辑统一化
**移除了重复的 IPC 代码:**
- ❌ `src/renderer/ipc/` 整个目录
- ❌ `src/renderer/lib/ipc-utils.ts` (旧版本)
- ❌ `src/renderer/lib/utils/ipc.utils.ts` (重构为兼容层)

**统一到:**
- ✅ `src/renderer/lib/ipc.ts` - 新的统一 IPC 工具类

#### 3. 测试目录整理
**移除了分散的测试:**
- ❌ `src/renderer/test/`
- ❌ 重复的测试文件

**统一到:**
- ✅ `test/` 根目录

#### 4. 备份文件位置
为了安全起见，移除的文件都备份到了 `backup/` 目录:
- `backup/ipc/` - 原 renderer/ipc 目录内容
- `backup/types/` - 各种重复的类型定义文件

## 使用方法

### 导入类型定义
```typescript
// 从统一的共享类型模块导入
import { User, Prompt, AIConfig, IpcResult } from '../shared/types';
```

### 使用 IPC 通信
```typescript
// 新版本 IPC 工具
import { IpcUtils } from './lib/ipc';

// 安全调用（不抛异常）
const result = await IpcUtils.safeInvoke('ai:test-config', config);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}

// 直接调用（可能抛异常）
try {
  const data = await IpcUtils.invoke('theme:get-current');
} catch (error) {
  console.error('IPC call failed:', error);
}

// 向后兼容
import { ipcInvoke } from './lib/ipc';
const result = await ipcInvoke('get-user-preferences');
```

### 数据库操作
```typescript
// 从统一入口导入
import { databaseService, User } from './lib/db';

// 使用数据库服务
const users = await databaseService.users.getAll();
```

## 迁移指南

### 对于现有代码

1. **类型导入更新:**
   ```typescript
   // 旧版本
   import { User } from './types/database';
   
   // 新版本
   import { User } from '../../shared/types';
   ```

2. **IPC 调用更新:**
   ```typescript
   // 旧版本
   import { ipcInvoke } from './ipc/ipc-utils';
   
   // 新版本
   import { IpcUtils } from './lib/ipc';
   // 或者向后兼容
   import { ipcInvoke } from './lib/ipc';
   ```

3. **测试文件位置:**
   - 将所有测试文件移动到根目录的 `test/` 下

## 好处

1. **减少重复代码** - 消除了多个地方维护相同功能的问题
2. **明确职责分工** - 每个目录都有明确的用途
3. **简化依赖关系** - 减少了交叉引用和循环依赖
4. **提高可维护性** - 统一的类型定义和工具函数
5. **更好的开发体验** - 清晰的项目结构，易于理解和扩展

## 注意事项

1. 所有旧文件都已备份到 `backup/` 目录，可以随时恢复
2. 为了向后兼容，保留了一些过渡性的导出
3. 建议逐步更新现有代码中的导入路径
4. 如果发现任何问题，可以查看备份文件进行对比
