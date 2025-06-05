# IndexedDB 数据存储架构

本项目使用 IndexedDB 作为客户端数据存储解决方案，完全在渲染进程中处理数据操作。

## 架构概览

```
Vue 3 前端  ←→  IndexedDB 数据impo```vue
<script setup>
import { api } from '../lib/database-client'

// 查询数据
const prompts = await api.prompts.getAll.query()

// 创建数据
await api.prompts.create.mutate({ient } from '../lib/database-client'

// 查询数据
const prompts = await api.prompts.getAll.query()

// 创建数据
await api.prompts.create.mutate({览器存储)
   (渲染进程)         (客户端)
```

## 数据模型

### User (用户)
- id: number (自增)
- email: string (唯一)
- name?: string
- createdAt: Date
- updatedAt: Date

### Category (分类)
- id: number (自增)
- name: string (唯一)
- color?: string
- createdAt: Date
- updatedAt: Date

### Prompt (提示词)
- id: number (自增)
- title: string
- content: string
- description?: string
- categoryId?: number (外键)
- tags?: string (逗号分隔)
- isFavorite: boolean
- useCount: number
- createdAt: Date
- updatedAt: Date

### PromptVariable (变量)
- id: number (自增)
- name: string
- label: string
- type: string ('text' | 'textarea' | 'select')
- options?: string
- defaultValue?: string
- required: boolean
- placeholder?: string
- promptId: number (外键)
- createdAt: Date
- updatedAt: Date

## 核心服务

### DatabaseService (`src/renderer/lib/database.ts`)

提供完整的 CRUD 操作：

```typescript
// 用户管理
await databaseService.createUser(userData)
await databaseService.getAllUsers()
await databaseService.getUserById(id)
await databaseService.updateUser(id, updates)
await databaseService.deleteUser(id)

// 分类管理
await databaseService.createCategory(categoryData)
await databaseService.getAllCategories()
await databaseService.updateCategory(id, updates)
await databaseService.deleteCategory(id)

// 提示词管理
await databaseService.createPrompt(promptData)
await databaseService.getAllPrompts(filters)
await databaseService.getPromptById(id)
await databaseService.updatePrompt(id, updates)
await databaseService.deletePrompt(id)
await databaseService.togglePromptFavorite(id)
await databaseService.incrementPromptUseCount(id)
await databaseService.fillPromptVariables(promptId, variables)
```

## 数据初始化

应用启动时会自动初始化 IndexedDB：

1. 检查数据库是否存在
2. 创建必要的对象存储（表）
3. 设置索引以优化查询性能
4. 数据库版本管理和升级

## 优势

- **简化架构**: 移除了主进程数据库依赖和 IPC 通信复杂性
- **离线优先**: 无需服务器，完全本地存储
- **性能优异**: 客户端数据库，无网络延迟
- **类型安全**: TypeScript 接口确保数据一致性
- **自动备份**: 数据存储在用户设备上

## 使用指南

### 在组件中使用

```vue
<script setup>
import { trpc } from '../lib/trpc'

// 获取数据
const prompts = await trpc.prompts.getAll.query()

// 创建数据
await trpc.prompts.create.mutate({
  title: '新提示词',
  content: '内容...',
  categoryId: 1
})

// 更新数据
await api.prompts.update.mutate({
  id: 1,
  data: { title: '更新的标题' }
})
</script>
```

### 错误处理

所有数据库操作都会抛出适当的错误，建议使用 try-catch：

```typescript
try {
  await api.prompts.create.mutate(promptData)
  message.success('创建成功')
} catch (error) {
  message.error('创建失败: ' + error.message)
  console.error(error)
}
```

## 性能考虑

- IndexedDB 支持事务操作
- 自动创建索引优化查询
- 大数据量时建议分页处理
- 定期清理无用数据
