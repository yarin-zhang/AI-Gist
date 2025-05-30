<div align="center">

# Electron Starter 启动模板

<img width="794" alt="image" src="https://user-images.githubusercontent.com/32544586/222748627-ee10c9a6-70d2-4e21-b23f-001dd8ec7238.png">

这是一个基于 **Vue 3** + **Vite** + **Electron** + **Prisma** + **tRPC** + **NaiveUI** 的现代化启动模板，内置了 **TypeScript** 支持和 **Electron Builder**。

**仓库地址：** [https://git.yarinz.com/yarin-zhang/electron-vue-template](https://git.yarinz.com/yarin-zhang/electron-vue-template)

</div>

## 项目简介

该模板使用 [ViteJS](https://vitejs.dev) 构建和启动你的前端（Vue）应用，支持热重载（HMR），让开发体验快速而流畅 ⚡

内置了完整的技术栈：
- **Vue 3** - 现代化的前端框架
- **Vite** - 极速的构建工具
- **Electron** - 跨平台桌面应用框架
- **Prisma** - 现代化的数据库 ORM
- **tRPC** - 端到端类型安全的 API
- **NaiveUI** - 优雅的 Vue 3 组件库
- **TypeScript** - 类型安全的 JavaScript

Electron 主进程构建采用 [Electron Builder](https://www.electron.build/)，可轻松打包分发应用，并支持跨平台构建 😎

## 快速开始

点击页面上方绿色的 **Use this template** 按钮，创建一个属于你自己的仓库。

**或者**

直接克隆此仓库：`git clone https://git.yarinz.com/yarin-zhang/electron-vue-template.git`

### 安装依赖 ⏬

```bash
yarn install
```

### 初始化数据库 🗄️

```bash
yarn prisma generate
yarn prisma db push
```

### 启动开发环境 ⚒️

```bash
yarn dev
```

## 其他常用命令

```bash
# 开发相关
yarn dev            # 启动应用并开启热重载
yarn build          # 打包应用，输出目录为 "dist"

# 数据库相关
yarn prisma studio  # 打开 Prisma 数据库管理界面
yarn prisma generate # 生成 Prisma 客户端
yarn prisma db push # 推送 schema 变更到数据库
yarn prisma migrate # 创建和应用数据库迁移

# 跨平台构建
yarn build:win      # 构建 Windows 安装包
yarn build:mac      # 构建 macOS 安装包
yarn build:linux    # 构建 Linux 安装包
```

更多配置选项请参阅 [Electron Builder CLI 文档](https://www.electron.build/cli.html)。

## 项目结构

```bash
- docs/               # 开发文档
- prisma/            # Prisma 数据库配置
  - schema.prisma    # 数据库模型定义
  - dev.db          # SQLite 开发数据库
  - migrations/     # 数据库迁移文件
- scripts/           # 包含构建和启动相关脚本，可按需修改
- src/
  - main/           # 主进程目录（Electron 应用逻辑）
    - database.ts   # 数据库服务
    - trpc.ts      # tRPC 路由定义
    - main.ts      # Electron 主进程入口
    - preload.ts   # 预加载脚本
  - renderer/       # 渲染进程目录（VueJS 前端应用）
    - components/   # Vue 组件
    - lib/         # 工具库
      - trpc.ts    # tRPC 客户端配置
    - assets/      # 静态资源
```

## 分支说明

原始仓库：https://github.com/Deluze/electron-vue-template

此仓库在原始仓库的基础上做了以下改动：

1. 添加了 .yarnrc.yml ，解决 node_modules 的兼容性问题。
2. 添加了 prisma 和 tRPC 的集成，提供端到端类型安全的 API。
3. 使用 NaiveUI 组件库，提供现代化的 Vue 3 组件。
4. 添加了详细的开发文档，帮助快速上手。

根据不同的需求，提供了以下分支：

- `main` - 主分支，包含最新的功能和改进。
- `base` - 基础分支，包含最小化的 Electron + Vue 3 + Vite + TypeScript 配置。
- `prisma` - 包含 Prisma 和 tRPC 集成的分支，提供端到端类型安全的 API。
- `prisma+naiveui` - 包含 NaiveUI 组件库的分支，提供现代化的 Vue 3 组件。

## 核心功能

### 🔌 tRPC + Prisma 集成
- 端到端类型安全的 API 通信
- 自动生成的类型定义
- 内置数据验证（Zod）
- SQLite 数据库支持

### 🎨 NaiveUI 组件库
- 现代化的 Vue 3 组件
- 主题定制支持
- 图标库集成

### ⚡ 热重载开发
- 前端和后端代码变更自动重载
- 快速的开发体验

## 开发指南

详细的开发指南请参阅 [docs](./docs) 目录：

- [tRPC 和 Prisma 使用指南](./docs/trpc-prisma-guide.md)
- [数据库模型管理](./docs/database-models.md)
- [API 接口开发](./docs/api-development.md)

## 使用静态资源

如果你有一些文件需要在安装后复制到应用目录，请将它们放入 `src/main/static` 目录中。

该目录中的文件仅对主进程可访问，类似于 `src/renderer/assets` 目录中的资源只对渲染进程可访问。其使用方式与你在其他前端项目中的经验类似。

### 主进程中引用静态资源

```ts
/* 假设文件 src/main/static/myFile.txt 存在 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync } from 'fs';

const path = join(app.getAppPath(), 'static', 'myFile.txt');
const buffer = readFileSync(path);
```
