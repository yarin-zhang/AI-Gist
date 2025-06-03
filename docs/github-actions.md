# GitHub Actions 自动构建与发布指南

本项目使用 GitHub Actions 自动构建和发布 AI Gist 应用程序。

## 自动发布流程

当您想要发布新版本时，可以通过以下两种方式触发构建流程：

### 方式一：通过创建 Git 标签（推荐）

1. 首先，使用 yarn version 命令更新版本号并创建 Git 标签：

```bash
# 更新补丁版本 (0.1.0 -> 0.1.1)
yarn version patch

# 或更新次要版本 (0.1.0 -> 0.2.0)
yarn version minor

# 或更新主要版本 (0.1.0 -> 1.0.0)
yarn version major
```

2. 这将自动：
   - 更新 `package.json` 中的版本号
   - 创建对应的 Git 标签（例如：v0.1.1）
   - 提交更改
   - 推送代码和标签到 GitHub

3. 一旦标签被推送到 GitHub，GitHub Actions 工作流将自动触发并执行以下操作：
   - 为该版本创建一个新的 GitHub Release
   - 构建 Windows、macOS (x64 和 ARM64) 和 Linux 版本的安装包
   - 将构建好的安装包上传到该 Release

### 方式二：手动触发工作流

1. 前往 GitHub 仓库页面
2. 点击 "Actions" 标签
3. 在左侧列表中选择 "Build and Release" 工作流
4. 点击 "Run workflow" 按钮
5. 输入版本号（例如：v0.1.1）
6. 点击 "Run workflow" 开始构建流程

## 构建产物

工作流将生成以下构建产物：

- Windows: `AI-Gist-Setup-{version}.exe`
- macOS (Intel): `AI-Gist-{version}-mac-x64.dmg`
- macOS (Apple Silicon): `AI-Gist-{version}-mac-arm64.dmg`
- Linux: `ai-gist-{version}-linux.snap`

这些文件将自动上传到对应版本的 GitHub Release 页面。

## 工作流配置文件

工作流配置位于 `.github/workflows/build-release.yml`。

## 注意事项

- 确保您的仓库设置了适当的 GitHub Actions 权限
- 如需修改构建流程，请编辑 `.github/workflows/build-release.yml` 文件
