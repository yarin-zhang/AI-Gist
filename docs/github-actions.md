# Actions 自动构建与发布指南

本项目使用兼容 Actions 格式的 Runner 自动构建和发布 AI Gist 应用程序。

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

   随后运行一次版本同步，把新版本号和推导出的构建号写进 Android / iOS 原生工程（详见 [versioning.md](versioning.md)）：

   ```bash
   yarn version:sync
   ```

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
6. 点击 "Run workflow" 开始构建流程。正式发布的手动运行必须输入一个已经存在的版本标签（版本号留空时使用 `package.json` 的版本并检查对应标签），并从该标签指向的 commit 发起；工作流会核对远端标签 SHA 与当前 checkout SHA，不一致时中止，也不会创建或推送标签。输入 `store`、`mac-store`、`linux-store-build` 或 `linux-store` 时进入对应商店流程，这些构建不要求版本标签。

## 构建产物

工作流将生成以下构建产物：

- Windows: `AI-Gist-{version}-Windows-Setup.exe`
- macOS (Intel): `AI-Gist-{version}-macOS-x64.dmg`
- macOS (Apple Silicon): `AI-Gist-{version}-macOS-arm64.dmg`
- Linux: `AI-Gist-{version}-linux.AppImage`
- Android: `AI-Gist-v{version}-android.apk`

这些文件将自动上传到对应版本的 Draft Release 页面。签名凭据不完整时产出的 Windows / macOS 兼容包会带 `-unsigned` 后缀（例如 `AI-Gist-{version}-Windows-Setup-unsigned.exe`），避免与已签名产物混淆或互相覆盖。

## 桌面代码签名

每个平台 job 的签名状态（signed / unsigned、缺少哪些 Secrets）会写入 Actions 的 Job Summary，凭据缺失时同时输出 warning，不会静默跳过。

### Windows（SignPath）

Windows 使用 SignPath Foundation 的免费开源代码签名服务。申请通过并在仓库中配置以下 Actions secrets 后，工作流会先上传未签名安装包供 SignPath 验证来源，等待签名批准，再对签名结果做 Authenticode 校验（`Get-AuthenticodeSignature`，校验失败即中断发布），最后把签名后的安装包上传到 Release：

- `SIGNPATH_API_TOKEN`：SignPath 用户设置中生成的 API Token
- `SIGNPATH_ORGANIZATION_ID`：SignPath 组织 ID
- `SIGNPATH_PROJECT_SLUG`：SignPath 项目 slug
- `SIGNPATH_SIGNING_POLICY_SLUG`：正式签名策略 slug（从 SignPath 控制台复制）

申请流程：在 [signpath.org](https://signpath.org/apply) 提交开源项目申请（需要仓库公开、含 [`CODE_SIGNING_POLICY.md`](../CODE_SIGNING_POLICY.md)、账号开启 MFA），通过后在 SignPath 控制台创建项目并把上述四个值配置到仓库的 Actions secrets。四个 secrets 任一缺失时，工作流发布带 `-unsigned` 后缀的未签名兼容包。

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

#### SignPath onboarding：先试签，再启用正式发布

不要用 `build-release.yml` 做自签证书测试：它会创建或更新 Release 附件。独立的 `windows-signing-test.yml` 只有 `actions: read`、`contents: read` 权限，使用 GitHub-hosted Windows runner，并以 `--publish never` 构建；结果仅保留为 7 天的 Actions artifact，文件名带 `-test-signed`，不得分发。

在 SignPath 现有项目中先核对以下配置，不要重复创建已有项目或策略：

- 项目关联 GitHub.com trusted build system，并指向 `yarin-zhang/AI-Gist`。按 SignPath 要求核对 GitHub App 的现有安装。
- `CI builds` 用户是测试策略的 submitter；维护者负责批准请求。
- 测试策略绑定已提供的自签测试证书。项目 slug、测试策略 slug、artifact configuration slug 都从控制台复制，不猜测名称。
- artifact configuration 的根文件类型为 `<zip-file>`，其中匹配 `AI-Gist-*-Windows-Setup.exe` 的 PE 文件执行 Authenticode 签名。Actions 上传的是 ZIP，不能直接使用裸 EXE 根配置。可上传 unsigned Actions artifact 生成配置，再检查匹配与签名规则。

试签只需前三个现有接口 secrets：`SIGNPATH_API_TOKEN`、`SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`。API token 由用户通过 GitHub Secrets 安全输入；不要写进代码、日志或 PR。手动运行 **Windows SignPath test (no release)**，传入已有测试 policy/artifact configuration slug 和从 SignPath 独立复制的测试证书 SHA-1 thumbprint（40 位十六进制，无空格）。thumbprint 是证书标识，不是私钥。

流程先检查签名者指纹，再仅在临时 runner 的 CurrentUser Root 存储中临时信任该已核对的测试证书，要求 Authenticode `Valid`，最后删除临时信任。该成功只证明试签链路与文件签名完整性，不能证明用户 Windows 已信任证书或生产证书已经签发。成功后的 summary 含 SignPath 请求链接、证书指纹和安装包 SHA256，可供供应商复核。

供应商复核并提供生产证书后，再设置 `SIGNPATH_SIGNING_POLICY_SLUG` 为正式策略，设置仓库 Actions variable `SIGNPATH_RELEASE_CERTIFICATE_THUMBPRINT` 为生产证书指纹。生产策略应使用项目的正确默认 artifact configuration。正式流程要求签名者与该指纹一致且 Authenticode `Valid`；四个签名 secrets 已齐全但生产证书指纹缺失时直接失败，不会把测试签名上传 Release。续期或轮换生产证书后需要同步该 variable。

参考：[SignPath GitHub 集成](https://docs.signpath.io/trusted-build-systems/github)、[artifact configuration 示例](https://docs.signpath.io/artifact-configuration/examples)。
