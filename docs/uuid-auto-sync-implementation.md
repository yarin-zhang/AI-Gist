# UUID 和自动同步功能实现文档

## 概述

本文档总结了 AI-Gist 项目中 UUID 字段和自动同步功能的实现。

## 已完成的功能

### 1. UUID 字段支持

#### 数据模型更新
- ✅ 所有需要同步的数据模型（Prompts、AIConfig、History 等）都增加了 `uuid` 字段
- ✅ UUID 在数据创建时自动生成
- ✅ 数据库索引支持 UUID 查询

#### UUID 工具函数
- ✅ 创建了 `generateUUID()` 工具函数
- ✅ 所有 add/create 方法自动调用 UUID 生成
- ✅ UUID 格式：标准 v4 格式

#### 数据导入/导出 UUID 补全
- ✅ 导出数据时自动补全缺失的 UUID 字段
- ✅ 导入数据时自动补全缺失的 UUID 字段
- ✅ 支持旧数据的 UUID 迁移策略（"缺失时补全"）

### 2. 自动同步功能

#### 自动同步管理器
- ✅ 创建了 `AutoSyncManager` 类
- ✅ 支持数据变更后自动触发同步
- ✅ 支持网络恢复后自动同步
- ✅ 防抖功能避免频繁同步
- ✅ 错误重试机制
- ✅ 同步状态监听和通知

#### 基础数据库服务集成
- ✅ 所有 add、update、delete 操作后自动触发同步
- ✅ 与 WebDAV 同步服务无缝集成

#### 前端 UI 支持
- ✅ 自动同步状态组件（AutoSyncStatus.vue）
- ✅ 同步状态实时显示（同步中、成功、失败、离线）
- ✅ 错误提示和手动重试功能
- ✅ 主页面集成同步状态显示

#### WebDAV 设置界面
- ✅ 自动同步开关配置
- ✅ 同步间隔设置
- ✅ 动态启用/禁用自动同步

### 3. 数据库结构升级

#### 索引优化
- ✅ 所有同步表都添加了 UUID 索引
- ✅ 支持基于 UUID 的快速查询

#### 服务类增强
- ✅ 所有数据库服务类都支持基于 UUID 的 CRUD 操作
- ✅ 统一的 UUID 补全策略

### 4. WebDAV 同步集成

#### 后端同步逻辑
- ✅ WebDAV 导出数据时自动补全 UUID
- ✅ 同步冲突解决基于 UUID
- ✅ 支持增量同步

#### 网络状态监听
- ✅ 自动检测网络连接状态
- ✅ 网络恢复后自动触发同步
- ✅ 离线状态用户提示

## 代码文件更新列表

### 核心文件
- `src/shared/types/database.ts` - 数据模型类型定义
- `src/renderer/lib/utils/uuid.ts` - UUID 工具函数
- `src/renderer/lib/utils/auto-sync-manager.ts` - 自动同步管理器

### 服务类
- `src/renderer/lib/services/base-database.service.ts` - 基础数据库服务
- `src/renderer/lib/services/ai-config.service.ts` - AI 配置服务
- `src/renderer/lib/services/prompt.service.ts` - 提示词服务
- `src/renderer/lib/services/category.service.ts` - 分类服务
- `src/renderer/lib/services/ai-generation-history.service.ts` - AI 生成历史服务
- `src/renderer/lib/services/database-manager.service.ts` - 数据库管理器服务

### WebDAV 相关
- `src/renderer/lib/api/webdav.api.ts` - WebDAV API
- `src/main/electron/webdav-service.ts` - WebDAV 主进程服务
- `src/main/electron/data-management-service.ts` - 数据管理服务

### UI 组件
- `src/renderer/components/common/AutoSyncStatus.vue` - 自动同步状态组件
- `src/renderer/pages/MainPage.vue` - 主页面
- `src/renderer/components/settings/WebDAVSyncSettings.vue` - WebDAV 同步设置
- `src/renderer/pages/SettingsPage.vue` - 设置页面

## 使用说明

### 开发者
1. 所有新的数据创建都会自动分配 UUID
2. 数据库操作后会自动触发同步（如果已启用）
3. 网络状态变化会自动处理同步逻辑

### 用户
1. 在设置页面可以配置自动同步选项
2. 主页面会显示同步状态
3. 同步失败时可以手动重试
4. 离线时会显示相应提示

## 测试建议

1. **UUID 生成测试**：验证所有新数据都有 UUID
2. **数据导入测试**：导入没有 UUID 的旧数据，验证自动补全
3. **自动同步测试**：修改数据后验证自动同步触发
4. **网络状态测试**：断网重连后验证自动同步恢复
5. **错误处理测试**：模拟同步失败场景，验证重试机制

## 性能考虑

1. **防抖机制**：避免频繁的数据修改导致过多同步请求
2. **索引优化**：UUID 字段建立索引提高查询性能
3. **增量同步**：基于 UUID 实现更高效的数据同步

## 维护注意事项

1. 确保所有新的数据模型都包含 UUID 字段
2. 新的 CRUD 操作需要集成自动同步触发
3. WebDAV 同步逻辑需要考虑 UUID 字段的处理
4. 定期检查同步状态和错误日志
