# 版本号与构建号规范

## 一句话

**`package.json` 里只手写 `version` 和 `buildRevision` 两个字段，其他所有平台的版本号/构建号都由它们推导，改完跑一次 `yarn version:sync`。**

## 两个号分别是什么

| | 叫法 | 例子 | 谁看 |
| --- | --- | --- | --- |
| 版本号 | 营销版本号（marketing version） | `2.1.1` | 用户、商店页面、Release 标签 |
| 构建号 | build number | `1` | 商店后台，用来区分同一版本的多次上传 |

`package.json`：

```json
{
    "version": "2.1.1",
    "buildRevision": 1
}
```

读作 **2.1.1 (1)**。同一个版本号需要再上传一次时（商店审核被拒、打包脚本出问题重新打包等），把 `buildRevision` 改成 2，得到 2.1.1 (2)。**版本号一升，`buildRevision` 就归 1 重新开始** —— iOS 只要求构建号在同一个营销版本号内递增，2.2.1 又可以从 (1) 数起。Android 和 Mac App Store 要的是全局单调的号，由版本号编码推导，不受这次重置影响（见下）。

## 各平台拿到什么

| 平台 | 字段 | 值（2.1.1 (1)） | 规则 |
| --- | --- | --- | --- |
| iOS | `CFBundleVersion` | `1` | 就是 `buildRevision`，每个版本号从 1 开始 |
| Mac App Store | `CFBundleVersion` | `2010101` | 和 Android `versionCode` 同一套编码，见下 |
| iOS / Mac App Store | `CFBundleShortVersionString` | `2.1.1` | 就是 `version` |
| Android | `versionCode` | `2010101` | 见下 |
| Android | `versionName` | `2.1.1` | 就是 `version` |
| Windows Store（appx） | 包版本 | `2.1.1.0` | electron-builder 从 `version` 生成 |
| 桌面安装包 / Snap / Web / CLI | — | `2.1.1` | 直接读 `package.json` |

### Android 和 Mac App Store 为什么是个长数字

Google Play 的 `versionCode` 是**全局单调递增的整数**，只跟"这个 app 上传过的最大值"比，跟 `versionName` 无关，**不能随版本号重置**。所以它必须把版本号本身编进去：

```
versionCode = major*1000000 + minor*10000 + patch*100 + buildRevision
```

| 版本 | versionCode |
| --- | --- |
| 2.1.1 (1) | 2010101 |
| 2.1.1 (2) | 2010102 |
| 2.1.2 (1) | 2010201 |
| 2.2.0 (1) | 2020001 |
| 3.0.0 (1) | 3000001 |

读法就是 `2.01.01.01`。这个号用户永远看不到，只在 Play 后台做排序用。

约束：`minor`、`patch` 必须小于 100，`buildRevision` 在 1-99 之间，否则相邻版本的 `versionCode` 会撞车 —— `scripts/version.js` 会直接报错，不会悄悄算出个错的号。

### Mac App Store 和 iOS 不一样

同样是 `CFBundleVersion`，App Store Connect 对两条线的校验规则不同：

- **iOS**：构建号只在同一个营销版本号内比较，`2.2.0 (1)` 接在 `2.1.1 (7)` 后面是合法的。
- **Mac**：构建号是**全局**比较的，只跟这个 app 历史上上传过的最大值比，跟营销版本号无关。

2.1.1 第一次发版时踩到过这个坑 —— Mac 那条线用 `buildRevision=1` 上传被拒：

```
This bundle is invalid. The value for key CFBundleVersion [1] in the Info.plist
file must contain a higher version than that of the previously uploaded
version [150].                                                          (90061)
```

`150` 是更早以前拿 CI `run_number` 当构建号留下的高水位。所以 Mac 只能跟 Android 一样用编码过的长整数（`--mac-build`），保证跨版本永远单调。商店后台会显示成 `2.1.1 (2010101)`，用户在商店页面看到的仍然只有 `2.1.1`。

## 为什么不再用 CI 的 run_number

以前 iOS 和 Mac App Store 的构建号取 CI 的 `run_number`，每跑一次流水线（哪怕只是重试一次失败的构建）构建号就往上跳一截，同一个版本的构建号毫无规律，也没法从构建号反推是哪次发版。现在构建号只跟 `package.json` 有关：重跑流水线不变，只有真的要重新上传商店时才 +1。

## 发版时怎么做

1. 改 `package.json` 的 `version`，并把 `buildRevision` 归 `1`。
2. 跑同步：

   ```bash
   yarn version:sync
   ```

   它把值写进那两个必须把版本存在文件里的原生工程：

   - `android/app/build.gradle` → `versionName` / `versionCode`
   - `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`

   桌面端（electron-builder）、Web 端、CLI 都直接读 `package.json`，不需要同步。

3. 提交、打 `vX.Y.Z` 标签、推送，按 [github-actions.md](github-actions.md) 走发布流程。

同一个版本要重新上传商店时，只改 `buildRevision`（1 → 2），重跑 `yarn version:sync`，不动版本号。

## 相关文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | `version` + `buildRevision`，唯一手写的版本信息 |
| `scripts/version.js` | 推导构建号；`--version` / `--build`（iOS） / `--mac-build`（Mac App Store） / `--version-code`（Android） 供 CI 取值 |
| `scripts/sync-version.js` | 写入原生工程；`--check` 只校验（`yarn version:check`） |

CI 里 Android 的两条流水线会跑 `yarn version:check`，`build.gradle` 和 `package.json` 不一致就直接失败，避免用旧的 `versionCode` 打出包来。iOS 归档时用 `node scripts/version.js` 的输出覆盖 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`，Mac App Store 打包时用 `--mac-build` 的输出作为 `--config.buildVersion`。
