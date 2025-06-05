# 数据库模型管理指南

本指南介绍如何在项目中管理 Prisma 数据库模型。

## 1. 理解 Prisma Schema

Prisma schema 文件位于 `prisma/schema.prisma`，包含：

```prisma
// 数据库配置
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 客户端生成器
generator client {
  provider = "prisma-client-js"
}

// 数据模型定义
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**注意：** 本项目使用 SQLite 数据库，适合桌面应用程序。开发环境数据库文件位于项目根目录的 `dev.db`。

## 2. 修改数据库模型

### 2.1 添加新模型

在 `schema.prisma` 中添加新的模型：

```prisma
model Category {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  posts       Post[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 2.2 修改现有模型

为现有模型添加字段：

```prisma
model Post {
  id         Int       @id @default(autoincrement())
  title      String
  content    String?
  published  Boolean   @default(false)
  author     User      @relation(fields: [authorId], references: [id])
  authorId   Int
  // 新增字段
  category   Category? @relation(fields: [categoryId], references: [id])
  categoryId Int?
  tags       String[]  // SQLite 中存储为 JSON
  viewCount  Int       @default(0)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}
```

### 2.3 定义关系

Prisma 支持多种关系类型：

```prisma
// 一对多关系
model User {
  id    Int    @id @default(autoincrement())
  posts Post[] // 一个用户有多篇文章
}

model Post {
  id       Int  @id @default(autoincrement())
  author   User @relation(fields: [authorId], references: [id])
  authorId Int  // 外键
}

// 多对多关系
model Post {
  id         Int        @id @default(autoincrement())
  categories Category[] @relation("PostCategories")
}

model Category {
  id    Int    @id @default(autoincrement())
  posts Post[] @relation("PostCategories")
}
```

## 3. 应用数据库变更

### 3.1 开发环境快速原型

使用 `db push` 快速同步 schema 到数据库：

```bash
# 推送 schema 变更到数据库
yarn prisma db push

# 重新生成 Prisma 客户端
yarn prisma generate
```

**注意：** `db push` 会直接修改数据库结构，可能导致数据丢失，仅适用于开发环境。

### 3.2 生产环境迁移

使用迁移来管理数据库变更：

```bash
# 创建迁移文件
yarn prisma migrate dev --name add_category_model

# 应用迁移到生产环境
yarn prisma migrate deploy
```

### 3.3 重置数据库

如果需要完全重置数据库：

```bash
# 删除现有数据库文件
rm -f dev.db*

# 重置数据库并应用所有迁移
yarn prisma migrate reset

# 填充种子数据（如果有 prisma/seed.ts）
yarn prisma db seed
```

## 4. 更新 TypeScript 类型

### 4.1 重新生成客户端

每次修改 schema 后，必须重新生成 Prisma 客户端：

```bash
yarn prisma generate
```

### 4.2 使用生成的类型

Prisma 会自动生成 TypeScript 类型：

```typescript
import type { User, Post, Category } from '@prisma/client';

// 包含关联数据的类型
type UserWithPosts = User & {
  posts: Post[];
};

type PostWithAuthor = Post & {
  author: User;
  category?: Category;
};
```

## 5. 更新数据库服务

在 `src/main/database.ts` 中添加新的数据库操作方法：

```typescript
export class DatabaseService {
  // ...existing methods...

  // Category 相关方法
  async createCategory(name: string, description?: string) {
    return this.prisma.category.create({
      data: { name, description },
    });
  }

  async getAllCategories() {
    return this.prisma.category.findMany({
      include: { posts: true },
    });
  }

  async getCategoryById(id: number) {
    return this.prisma.category.findUnique({
      where: { id },
      include: { posts: true },
    });
  }
}
```

## 6. 常见字段类型

```prisma
model Example {
  // 基础类型
  id          Int      @id @default(autoincrement())
  name        String
  age         Int?     // 可选
  isActive    Boolean  @default(true)
  score       Float
  
  // 日期时间
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  birthday    DateTime?
  
  // 特殊字段
  email       String   @unique
  slug        String   @unique
  
  // JSON 字段（SQLite 支持）
  metadata    Json?
  tags        String[] // 在 SQLite 中存储为 JSON
  
  // 枚举
  status      Status   @default(DRAFT)
}

enum Status {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

## 7. 最佳实践

### 7.1 命名约定

- 模型名使用 PascalCase：`User`、`BlogPost`
- 字段名使用 camelCase：`firstName`、`createdAt`
- 关系字段名要清晰：`author`、`posts`、`categories`

### 7.2 索引优化

```prisma
model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  
  // 添加索引提高查询性能
  @@index([authorId])
  @@index([title])
  @@index([authorId, title]) // 复合索引
}
```

### 7.3 数据验证

在数据库层面添加约束：

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  age   Int?   @default(0)
  
  // 确保邮箱格式（应用层验证）
  // 确保年龄范围（应用层验证）
}
```

## 8. 故障排除

### 8.1 常见错误

**错误：客户端过期**
```bash
yarn prisma generate
```

**错误：迁移冲突 / 表已存在**
```bash
# 删除数据库文件重新开始
find . -name "dev.db*" -delete
yarn prisma db push
yarn prisma generate
```

**错误：数据库连接失败**
检查 `DATABASE_URL` 环境变量。开发环境应该指向项目根目录的 `dev.db` 文件。

**错误：多个数据库文件**
如果发现有多个 `dev.db` 文件，删除所有并重新初始化：
```bash
find . -name "dev.db*" -delete
yarn prisma db push
```

**错误：P2010 - 表已存在**
这通常是因为数据库迁移状态不一致：
```bash
# 方法1：重置数据库
find . -name "dev.db*" -delete
yarn prisma db push

# 方法2：如果需要保留数据，标记迁移为已应用
yarn prisma migrate resolve --applied 20250530015702_init
```

### 8.2 查看数据库内容

```bash
# 打开 Prisma Studio
yarn prisma studio
```

## 下一步

- [API 接口开发](./api-development.md) - 学习如何为新模型创建 tRPC 接口
