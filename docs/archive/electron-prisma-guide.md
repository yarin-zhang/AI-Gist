
# 📘 Electron + Prisma 本地数据库管理实践文档

## ✅ 项目目标

在 Electron 应用中使用 Prisma 管理本地 SQLite 数据库，支持以下能力：

* 自动初始化用户本地数据库
* 应用更新后能同步数据库结构（不丢失用户数据）
* 可预设初始数据，提升用户首次启动体验
* 数据库存储安全、路径跨平台兼容

---

## 📦 项目架构角色说明

| 组件               | 作用                          |
| ---------------- | --------------------------- |
| `Prisma`         | 作为 ORM，定义数据库模型并操作数据         |
| `SQLite`         | 嵌入式数据库，适合本地桌面应用             |
| `Electron`       | 桌面框架，负责应用主进程、用户路径管理等        |
| `starter.db`（推荐） | 打包预设数据库模板，供首次启动初始化使用        |
| `prisma db push` | 用于将最新的模型结构推送到用户现有数据库，实现结构升级 |

---

## 🔄 数据库生命周期管理流程

### 🚧 开发阶段

1. 使用 `schema.prisma` 定义模型结构：

   ```prisma
   datasource db {
     provider = "sqlite"
     url      = "file:./dev.db"
   }

   generator client {
     provider = "prisma-client-js"
   }

   model User {
     id    Int    @id @default(autoincrement())
     name  String
   }
   ```

2. 创建数据库并同步结构：

   ```bash
   yarn prisma db push
   ```

3. 如需预设数据，可用脚本插入初始记录：

   ```ts
   await prisma.user.create({ data: { name: "Admin" } });
   ```

4. 复制 `dev.db` 为 `starter.db`，放入 `resources` 目录待打包：

   ```
   cp dev.db ./resources/starter.db
   ```

---

### 🧳 打包阶段

* 使用 Electron Builder 打包应用时，确保以下文件被包含：

  * `starter.db`
  * `schema.prisma`
  * `.env.template`（用于运行时动态生成 `.env`）

---

### 🚀 用户启动应用时

在 Electron 主进程中执行数据库初始化逻辑：

```ts
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'app.db');
const starterDbPath = path.join(process.resourcesPath, 'starter.db');

// Step 1: 初始化数据库文件（首次启动）
if (!fs.existsSync(dbPath)) {
  fs.copyFileSync(starterDbPath, dbPath);
}

// Step 2: 动态生成 .env 文件
const envPath = path.join(__dirname, '.env');
fs.writeFileSync(envPath, `DATABASE_URL="file:${dbPath.replace(/\\/g, '/')}"\n`);

// Step 3: 执行 db push（确保结构同步）
execSync('yarn prisma db push', {
  cwd: path.join(__dirname), // 确保路径正确
  env: {
    ...process.env,
    DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`,
  },
});
```

---

## 💡 技术说明与最佳实践

| 问题       | 推荐做法                         |
| -------- | ---------------------------- |
| 首次创建数据库  | 使用 `starter.db` 初始化          |
| 数据结构更新   | 使用 `prisma db push`          |
| 避免数据库被覆盖 | 在复制前判断文件是否已存在                |
| 路径跨平台兼容  | 使用 `app.getPath('userData')` |
| 用户数据持久化  | 永远使用用户目录的数据库路径               |
| .env 设置  | 启动时动态生成或设置环境变量               |

---

## ✅ 可选目录结构推荐

```
your-app/
├── prisma/
│   ├── schema.prisma
│   └── starter.db        ← 打包资源
├── src/
│   └── main.ts           ← Electron 主进程
├── scripts/
│   └── bootstrapDb.ts    ← 启动时初始化/升级数据库
├── .env.template         ← 用于生成运行时环境配置
```

---

## 📌 总结

| 目标          | 实现方式                          |
| ----------- | ----------------------------- |
| 自动创建数据库结构   | `prisma db push`              |
| 快速初始化新用户数据库 | 提供预设 `starter.db`             |
| 保证老用户结构升级   | 启动时执行结构同步                     |
| 用户数据不被覆盖    | 判断 `app.db` 是否存在再拷贝           |
| 跨平台路径安全     | 