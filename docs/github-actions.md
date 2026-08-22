# Actions 自动构建与发布指南

本项目使用兼容 GitHub Actions 格式的 Actions Runner 自动构建和发布 AI Gist 应用程序。

## 自动发布流程

当您想要发布新版本时，可以通过以下两种方式触发构建流程：

### 方式一：通过创建 Git 标签（推荐，正式发布）

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
   - 推送代码和标签到仓库远端

3. 一旦形如 `v1.2.3` 的标签被推送，Actions 工作流将自动触发并执行以下操作：
   - 为该版本创建一个新的 Draft Release
   - 构建 Windows、macOS (x64 和 ARM64) 和 Linux 版本的安装包
   - 将构建好的安装包上传到该 Release

普通提交推送到 `main` 不会触发正式发布，也不会自动创建 Release。这样可以避免合并 PR 时重复生成无版本意义的安装包。需要发布时先更新 `package.json` 版本并推送对应的 `vX.Y.Z` 标签。

### 方式二：手动触发工作流

1. 前往仓库的 Actions 页面
2. 点击 "Actions" 标签
3. 在左侧列表中选择 "Build and Release" 工作流
4. 点击 "Run workflow" 按钮
5. 输入版本号（例如：v0.1.1）
6. 点击 "Run workflow" 开始构建流程。版本号留空时使用 `package.json` 的版本；输入 `store`、`mac-store`、`linux-store-build` 或 `linux-store` 时进入对应商店流程。

## 构建产物

工作流将生成以下构建产物：

- Windows: `AI-Gist-{version}-Windows-Setup.exe`
- macOS (Intel): `AI-Gist-{version}-macOS-x64.dmg`
- macOS (Apple Silicon): `AI-Gist-{version}-macOS-arm64.dmg`
- Linux: `AI-Gist-{version}-linux.AppImage`
- Android: `AI-Gist-v{version}-android.apk`

这些文件将自动上传到对应版本的 Draft Release 页面。签名凭据不完整时产出的 Windows / macOS 兼容包会带 `-unsigned` 后缀（例如 `AI-Gist-{version}-Windows-Setup-unsigned.exe`），避免与已签名产物混淆或互相覆盖。

## 桌面代码签名

每个平台 job 的签名状态（signed / unsigned、缺少哪些 Secrets）会写入 GitHub Actions 的 Job Summary，凭据缺失时同时输出 warning，不会静默跳过。

### Windows（SignPath）

Windows 使用 SignPath Foundation 的免费开源代码签名服务。申请通过并在仓库中配置以下 Actions secrets 后，工作流会先上传未签名安装包供 SignPath 验证来源，等待签名批准，再对签名结果做 Authenticode 校验（`Get-AuthenticodeSignature`，校验失败即中断发布），最后把签名后的安装包上传到 Release：

- `SIGNPATH_API_TOKEN`：SignPath 用户设置中生成的 API Token
- `SIGNPATH_ORGANIZATION_ID`：SignPath 组织 ID
- `SIGNPATH_PROJECT_SLUG`：SignPath 项目 slug
- `SIGNPATH_SIGNING_POLICY_SLUG`：签名策略 slug（一般为 `release-signing`）

申请流程：在 [signpath.org](https://signpath.org/apply) 提交开源项目申请（需要仓库公开、含 [`CODE_SIGNING_POLICY.md`](../CODE_SIGNING_POLICY.md)、账号开启 MFA），通过后在 SignPath 控制台创建项目并把上述四个值配置到 GitHub 仓库的 Actions secrets。四个 secrets 任一缺失时，工作流发布带 `-unsigned` 后缀的未签名兼容包。

### macOS（Developer ID + 公证）

macOS 使用 Apple Developer ID 签名并通过 Apple 公证，构建后会在 CI 内执行 `codesign --verify`、`xcrun stapler validate` 与 `spctl --assess` 三重校验。需要配置：

- `MAC_CSC_LINK`：Developer ID Application `.p12` 文件的 Base64 内容（在 [Apple Developer 证书页面](https://developer.apple.com/account/resources/certificates/list) 创建 **Developer ID Application** 类型证书，注意不是 Mac App Store 用的 Apple Distribution）
- `MAC_CSC_KEY_PASSWORD`：`.p12` 导出密码
- `APPLE_ID`：Apple Developer 账号
- `APPLE_APP_SPECIFIC_PASSWORD`：Apple 账户的 [App 专用密码](https://appleid.apple.com/account/manage)
- `APPLE_TEAM_ID`：10 位 Team ID

凭据不完整时，工作流会发出 warning 并继续生成带 `-unsigned` 后缀的兼容包，不会中断现有发布。兼容包会通过 `scripts/adhoc-sign-mac.js` 做 ad-hoc 签名（否则 asar 打包破坏签名封条后，Apple Silicon 会直接拒绝运行该二进制），用户仍需 `xattr -cr` 移除 quarantine 属性后才能打开。签名配置、责任角色和构建来源见 [`CODE_SIGNING_POLICY.md`](../CODE_SIGNING_POLICY.md)。

### Linux

AppImage 无需代码签名。用户下载后需要 `chmod +x` 赋予执行权限；Ubuntu 22.04+ 运行 AppImage 需要 `libfuse2`。相关指引已写入 Release 说明模板。

## 工作流配置文件

工作流配置位于 `.github/workflows/build-release.yml`。

## 常见问题

**问题：** `'tsc' is not recognized as an internal or external command` 或 `/bin/sh: tsc: command not found`

**解决方案：**
- 这是 TypeScript 编译器未找到的问题
- 工作流已经配置了自动安装 TypeScript
- 如果仍有问题，可以检查 `package.json` 中是否包含 `typescript` 依赖

**问题：** `Application entry file "main\main.js" does not exist`

**解决方案：**
- 这通常是由于 TypeScript 编译失败导致的
- 确保所有 TypeScript 源文件语法正确
- 检查 `src/main/tsconfig.json` 配置是否正确

## 注意事项

- 确保您的仓库设置了适当的 Actions 权限（至少允许工作流写入 Release 与标签）
- 如需修改构建流程，请编辑 `.github/workflows/build-release.yml` 文件
