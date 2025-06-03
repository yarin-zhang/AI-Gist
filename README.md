<div align="center">

# AI Gist

本地 AI Prompt 管理工具，能够管理个人 AI Prompt + 维护 Prompt 标签分类 + Prompt 变量填充。

</div>

![](docs/images/image01.png?v=2)

## ✨ 特点

- **Prompt 模板管理**：集中管理和组织所有 AI Prompt 模板
- **变量填充**：支持在 Prompt 中定义变量，使用时可动态填充
- **分类与标签**：通过分类和标签系统轻松查找和过滤 Prompt
- **一键复制**：一键复制生成的 Prompt，直接粘贴到其他 AI 工具中使用
- **历史记录**：保存使用过的 Prompt，方便重复使用和优化
- **跨平台支持**：支持 Windows、macOS 和 Linux 系统

## 🚀 使用说明

1. **创建 Prompt 模板**：点击"新建"按钮创建新的 Prompt 模板，设置标题、内容和变量
2. **使用变量**：在 Prompt 内容中使用 `{{变量名}}` 格式定义变量
3. **填充变量**：选择模板后，系统会提示填写变量值
4. **生成 Prompt**：填写变量后自动生成最终 Prompt
5. **复制使用**：点击复制按钮，将生成的 Prompt 粘贴到任何 AI 工具中
6. **管理模板**：通过左侧导航栏管理分类和标签，组织你的 Prompt 库

## 开发说明

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

### 其他常用命令

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

### 开发指南

详细的开发指南请参阅 [docs](./docs) 目录：

- [tRPC 和 Prisma 使用指南](./docs/trpc-prisma-guide.md)
- [数据库模型管理](./docs/database-models.md)
- [API 接口开发](./docs/api-development.md)

### 使用静态资源

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

## 自动构建与发布

本项目使用 GitHub Actions 自动构建和发布应用程序。有关详细信息，请参阅 [GitHub Actions 自动构建与发布指南](docs/github-actions.md)。


## 应用截图

![](docs/images/image02.png?v=2)

![](docs/images/image03.png?v=2)
