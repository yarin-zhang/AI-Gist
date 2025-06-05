# tRPC 和 Prisma 集成使用指南

本指南将详细介绍如何在这个 Electron + Vue 3 项目中使用 tRPC 和 Prisma。

## 概述

项目使用 tRPC 作为类型安全的 API 层，Prisma 作为数据库 ORM。这种组合提供了：

- 🔒 端到端类型安全
- 🚀 自动代码生成
- 📊 强大的数据库操作
- ✅ 内置数据验证

## 技术栈架构

```
Frontend (Vue 3)  ←→  tRPC Client  ←→  tRPC Server  ←→  Prisma  ←→  Database
    (渲染进程)            (IPC 通信)        (主进程)         (ORM)      (SQLite)
```

## 核心文件说明

### 1. Prisma 相关文件

- `prisma/schema.prisma` - 数据库模型定义
- `src/main/database.ts` - 数据库服务封装
- `prisma/dev.db` - SQLite 开发数据库

### 2. tRPC 相关文件

- `src/main/trpc.ts` - tRPC 服务端路由定义
- `src/renderer/lib/trpc.ts` - tRPC 客户端配置
- `src/main/preload.ts` - Electron IPC 桥接

### 3. Vue 组件

- `src/renderer/components/TrpcDemo.vue` - tRPC 使用示例

## 数据流程

1. **前端发起请求** - Vue 组件调用 tRPC 客户端方法
2. **IPC 通信** - 通过 Electron 的 preload 脚本进行进程间通信
3. **路由处理** - tRPC 服务端接收请求并路由到对应处理器
4. **数据库操作** - 通过 Prisma 客户端执行数据库操作
5. **响应返回** - 结果通过相同路径返回到前端

## 类型安全保证

整个数据流程都是类型安全的：

```typescript
// 前端调用，具有完整的类型提示和校验
const users = await window.electronAPI.trpc.users.getAll.query();
//    ^^ User[] 类型自动推断

// 服务端定义，类型自动同步到客户端
export const appRouter = router({
  users: router({
    getAll: publicProcedure.query(async () => {
      return await dbService.getAllUsers(); // 返回 User[]
    }),
  }),
});
```

## 下一步

- [数据库模型管理](./database-models.md) - 学习如何定义和修改数据库模型
- [API 接口开发](./api-development.md) - 学习如何开发 tRPC 接口
