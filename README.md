<div align="center">

![Logo](docs/images/logo.png)

# AI Gist

✨ 本地优先的 AI 提示词管理工具，能够管理 AI 提示词 + 变量填充 + 分类标签。

</div>

![](docs/images/imageMain.png?v=4)

## 特点

- **提示词模板管理**：集中管理和组织所有 AI 提示词模板
- **变量填充**：支持在提示词中定义变量，使用时可动态填充
- **分类与标签**：通过分类和标签系统轻松查找和过滤提示词
- **一键复制**：一键复制生成的提示词，直接粘贴到其他 AI 工具中使用
- **历史记录**：保存使用过的提示词，方便重复使用和优化
- **跨平台支持**：支持 Windows、macOS 和 Linux 系统

## 🚀 下载

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/yarin-zhang/AI-Gist?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases/latest) [![GitHub all releases](https://img.shields.io/github/downloads/yarin-zhang/AI-Gist/total?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases)

| 平台 | 下载链接 | 说明 |
|------|----------|------|
| ![Windows](https://custom-icon-badges.demolab.com/badge/Windows-0078D6?logo=windows11&logoColor=white) | [Windows Setup](https://github.com/yarin-zhang/AI-Gist/releases/latest) | Windows 安装程序 |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Apple Silicon)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 适用于 Apple 芯片 |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Intel)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 适用于 Intel 芯片 |
| ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black) | [Linux AppImage](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 通用 Linux 应用 |

### 安装说明

- **Windows：** 下载 `.exe` 文件后双击运行安装
- **macOS：** 下载 `.dmg` 文件后打开，将应用拖拽到应用程序文件夹，在终端执行 `xattr -cr /Applications/AI\ Gist.app` 以解除“已损坏”报错后启动。
- **Linux：** 下载 `.AppImage` 文件后添加执行权限：`chmod +x ai-gist-linux.AppImage`

## 📒 使用说明

1. **创建提示词模板**：点击"新建"按钮创建新的提示词模板，设置标题、内容和变量
2. **使用变量**：在提示词内容中使用 `{{变量名}}` 格式定义变量
3. **填充变量**：选择模板后，系统会提示填写变量值
4. **生成提示词**：填写变量后自动生成最终提示词
5. **复制使用**：点击复制按钮，将生成的提示词粘贴到任何 AI 工具中
6. **管理模板**：通过左侧导航栏管理分类和标签，组织你的提示词库

## 开发说明

### 安装依赖

```bash
yarn install
```

### 启动开发环境

```bash
yarn dev
```

### 其他常用命令

```bash
# 开发相关
yarn dev            # 启动应用并开启热重载
yarn build          # 打包应用，输出目录为 "dist"

# 跨平台构建
yarn build:win      # 构建 Windows 安装包
yarn build:mac      # 构建 macOS 安装包
yarn build:linux    # 构建 Linux 安装包
```

### 开发指南

详细的开发指南请参阅 [docs](./docs) 目录：

- [IndexedDB 架构指南](./docs/indexeddb-architecture.md)
- [GitHub Actions 自动构建与发布](./docs/github-actions.md)

## 应用截图

![](docs/images/image01.png?v=4)

![](docs/images/image02.png?v=4)

![](docs/images/image03.png?v=4)

![](docs/images/image04.png?v=4)

![](docs/images/image05.png?v=4)

![](docs/images/image06.png?v=4)

![](docs/images/image07.png?v=4)

![](docs/images/image08.png?v=4)

![](docs/images/image09.png?v=4)
