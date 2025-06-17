<div align="center">

![Logo](docs/images/logo.png)

# AI Gist

✨ 本地优先的 AI 提示词管理工具，能够管理 AI 提示词 + 变量填充 + 分类标签。

</div>

![](docs/images/imageMain.png?v=4)

## 📌 特点

- **提示词模板管理**：集中管理和组织所有 AI 提示词模板
- **变量填充**：支持在提示词中定义变量，使用时可动态填充
- **分类与标签**：通过分类和标签系统轻松查找和过滤提示词
- **历史记录**：保存使用过的提示词，方便重复使用和优化
- **100% 数据**：拥有完整的数据控制，完整支持导出和导入
- **本地优先**：所有数据存储在本地，确保隐私和安全
- **WebDAV**：支持 WebDAV 同步，方便在多设备间共享数据
- **跨平台支持**：支持 Windows、macOS 和 Linux 系统

## ⬇️ 下载

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/yarin-zhang/AI-Gist?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases/latest) [![GitHub all releases](https://img.shields.io/github/downloads/yarin-zhang/AI-Gist/total?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases)

| 平台 | 下载链接 | 说明 |
|------|----------|------|
| ![Windows](https://custom-icon-badges.demolab.com/badge/Windows-0078D6?logo=windows11&logoColor=white) | [Windows Setup](https://github.com/yarin-zhang/AI-Gist/releases/latest) | Windows 安装程序 |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Apple Silicon)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 适用于 Apple 芯片 |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Intel)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 适用于 Intel 芯片 |
| ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black) | [Linux AppImage](https://github.com/yarin-zhang/AI-Gist/releases/latest) | 通用 Linux 应用 |

## 🚀 安装说明

- **Windows：** 下载 `.exe` 文件后双击运行安装
- **macOS：** 下载 `.dmg` 文件后打开，将应用拖拽到应用程序文件夹，在终端执行 `xattr -cr /Applications/AI\ Gist.app` 以解除“已损坏”报错后启动。
- **Linux：** 下载 `.AppImage` 文件后添加执行权限：`chmod +x ai-gist-linux.AppImage`

## 📒 使用说明

方法一：手动维护数据

- 在应用中手动添加提示词模板、变量和分类标签
- 使用时直接选择模板，输入变量值即可

方法二：AI 生成提示词

- 先在应用中添加 AI 模型（支持纯本地 Ollama、LM Studio 模型，以及常见的 OpenAI、DeepSeek 等在线模型）。
- 在首页使用 AI 模型生成提示词。

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

## 贡献

本项目主要由个人开发，如果你喜欢这个项目，请考虑点击右上角的 Star ⭐️ 来支持我！这将激励我继续改进和维护这个项目。

如果有问题或建议，欢迎在 GitHub 上提交 Issue 或 Pull Request。

欢迎加入 QQ 群，与开发者和其他用户交流使用心得、反馈问题和获取最新动态。

<div style="max-width: 300px; padding: 16px; margin: 0 auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); text-align: center;">
  <img src="docs/images/QQ-QRCode.png?v=4" alt="QQ 群" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
</div>

## 许可证

本项目采用最宽松的 [MIT 许可证](./LICENSE)，你可以自由使用、修改和分发代码，但请保留原作者信息。