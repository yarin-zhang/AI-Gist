# 移动端开发指南

本文档介绍如何在 AI Gist 项目中进行移动端开发。

## 架构说明

AI Gist 采用混合架构：
- **桌面端**: Electron + Vue 3
- **移动端**: Capacitor + Vue 3

两个平台共享相同的 Vue 3 渲染层代码，通过平台适配层处理差异。

## 目录结构

```
src/
├── main/                    # Electron 主进程（仅桌面端）
├── renderer/                # Vue 3 应用（共享）
│   ├── capacitor-bridge/    # Capacitor 适配层
│   └── ...
├── shared/                  # 共享代码
│   └── platform.ts          # 平台检测
└── ...

# 移动端构建产物（已忽略）
ios/                         # iOS 原生项目
android/                     # Android 原生项目
```

## 开发流程

### 1. 桌面端预览移动端效果

窗口最小宽度已调整为 375px（iPhone 宽度），可以直接在桌面端预览移动端效果：

```bash
yarn dev
```

然后将窗口宽度调整到 375px 左右即可预览移动端布局。

### 2. 更新应用图标（打包前必做）

每次更换图标后，需要重新生成各平台所需的图标尺寸：

```bash
yarn cap:assets
```

图标源文件放在 `resources/` 目录下：

| 文件 | 尺寸 | 说明 |
|------|------|------|
| `resources/icon.png` | 1024×1024 | 主图标（必须） |
| `resources/icon-foreground.png` | 1024×1024 | Android 自适应图标前景层（可选） |
| `resources/icon-background.png` | 1024×1024 | Android 自适应图标背景层（可选） |
| `resources/splash.png` | 2732×2732 | 启动屏（可选） |

> 注意：此命令会直接覆盖 `ios/` 和 `android/` 目录中的图标文件，运行后需要重新 `cap sync`。

### 3. 构建移动端应用

```bash
# 构建渲染层并同步到 Capacitor
yarn build:mobile
```

### 3. 打开原生 IDE

**iOS (需要 macOS + Xcode):**
```bash
yarn cap:ios
```

**Android (需要 Android Studio):**
```bash
yarn cap:android
```

### 4. 在模拟器/真机上运行

在 Xcode 或 Android Studio 中点击运行按钮即可。

## 平台适配

### 平台检测

使用 `PlatformDetector` 检测当前运行环境：

```typescript
import { PlatformDetector } from '@shared/platform';

if (PlatformDetector.isElectron()) {
  // 桌面端逻辑
} else if (PlatformDetector.isMobile()) {
  // 移动端逻辑
}
```

### 文件系统

使用统一的文件系统适配层：

```typescript
import { fileSystem } from '@renderer/capacitor-bridge';

// 读取文件
const content = await fileSystem.readFile('data.json');

// 写入文件
await fileSystem.writeFile('data.json', JSON.stringify(data));
```

### 存储

使用统一的存储适配层：

```typescript
import { storage } from '@renderer/capacitor-bridge';

// 保存数据
await storage.set('key', 'value');

// 读取数据
const value = await storage.get('key');
```

## 注意事项

### 1. 功能差异

某些功能在移动端可能需要特殊处理：
- **文件系统**: 移动端使用沙盒文件系统
- **窗口管理**: 移动端没有窗口概念
- **系统托盘**: 移动端不支持
- **快捷键**: 移动端需要使用触摸手势

### 2. 权限配置

移动端需要在原生配置中声明权限：

**iOS (ios/App/App/Info.plist):**
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>需要访问相册以保存图片</string>
```

**Android (android/app/src/main/AndroidManifest.xml):**
```xml
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### 3. 调试

**移动端调试:**
- iOS: Safari -> 开发 -> 模拟器
- Android: Chrome -> chrome://inspect

## 常见问题

### Q: 如何同步代码到移动端？

A: 每次修改代码后运行 `yarn build:mobile` 即可。

### Q: 移动端如何调用原生功能？

A: 使用 Capacitor 插件，例如：
```typescript
import { Share } from '@capacitor/share';

await Share.share({
  title: '分享标题',
  text: '分享内容',
  url: 'https://example.com',
});
```

### Q: 如何添加新的 Capacitor 插件？

A:
```bash
yarn add @capacitor/plugin-name
yarn cap sync
```

## 相关资源

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Capacitor 插件市场](https://capacitorjs.com/docs/plugins)
- [iOS 开发指南](https://developer.apple.com/documentation/)
- [Android 开发指南](https://developer.android.com/docs)
