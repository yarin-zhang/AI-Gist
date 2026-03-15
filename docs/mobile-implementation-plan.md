# AI Gist 移动端实现计划

## 项目概述

为 AI Gist 应用创建独立的移动端界面，使用 Ionic Framework 提供原生移动端体验，同时保持桌面端功能完全不受影响。

## 技术栈

- **UI 框架**: Ionic Framework 8.x (移动端) + Naive UI (桌面端)
- **路由**: Vue Router 4.x
- **平台检测**: PlatformDetector (已实现)
- **数据层**: 100% 复用现有 API 和服务层
- **构建工具**: Vite + Capacitor 8.1.0

## 架构设计

### 目录结构

```
src/renderer/
├── components/
│   ├── mobile/              # 移动端专用组件
│   │   ├── layout/
│   │   │   ├── MobileTabBar.vue
│   │   │   ├── MobileHeader.vue
│   │   │   └── MobileLayout.vue
│   │   ├── prompt/
│   │   │   ├── MobilePromptList.vue
│   │   │   ├── MobilePromptCard.vue
│   │   │   ├── MobilePromptDetail.vue
│   │   │   └── MobilePromptEditor.vue
│   │   ├── ai/
│   │   │   ├── MobileAIConfigList.vue
│   │   │   ├── MobileAIConfigEditor.vue
│   │   │   └── MobileAIGenerator.vue
│   │   └── settings/
│   │       └── MobileSettingsList.vue
│   ├── prompt-management/   # 桌面端组件（保持不变）
│   ├── settings/            # 桌面端组件（保持不变）
│   └── ai/                  # 桌面端组件（保持不变）
├── pages/
│   ├── MainPage.vue         # 桌面端主页
│   └── MobileMainPage.vue   # 移动端主页
├── composables/             # 业务逻辑（95% 复用）
├── capacitor-bridge/        # 适配层（100% 复用）
└── lib/                     # 数据层（100% 复用）
```

### 平台切换机制

```vue
<!-- App.vue -->
<template>
  <!-- 桌面端：Naive UI -->
  <NConfigProvider v-if="isDesktop" ...>
    <MainPage />
  </NConfigProvider>

  <!-- 移动端：Ionic -->
  <IonApp v-else>
    <MobileMainPage />
  </IonApp>
</template>
```

## 实施阶段

### 阶段 1：环境准备和基础框架 ✅ (已完成)

**完成内容：**
- ✅ 安装 Ionic Framework 8.x 和 vue-router
- ✅ 集成 Ionic 到项目（条件加载）
- ✅ 修改 App.vue 添加平台检测
- ✅ 创建 MobileMainPage.vue
- ✅ 创建移动端组件目录结构

**关键文件：**
- `/src/renderer/main.ts` - 条件导入 Ionic 样式和插件
- `/src/renderer/App.vue` - 平台检测和条件渲染
- `/src/renderer/pages/MobileMainPage.vue` - 移动端主页

### 阶段 2：提示词管理功能 (5-7 天)

**任务清单：**

1. **提示词列表** (2 天)
   - 创建 `MobilePromptList.vue`
   - 使用 `ion-list` 和 `ion-item`
   - 实现搜索栏 (`ion-searchbar`)
   - 添加筛选和排序
   - 下拉刷新功能

2. **提示词卡片** (1 天)
   - 创建 `MobilePromptCard.vue`
   - 显示标题、描述、标签、分类
   - 支持点击查看详情
   - 侧滑操作（编辑/删除）

3. **提示词详情** (1 天)
   - 创建 `MobilePromptDetail.vue`
   - 全屏模态框展示
   - 显示完整内容和元数据
   - 编辑、删除、收藏按钮

4. **提示词编辑器** (2 天)
   - 创建 `MobilePromptEditor.vue`
   - 使用 `ion-textarea` 编辑内容
   - 分类选择器 (`ion-select`)
   - 标签管理
   - 变量管理

5. **浮动操作按钮** (0.5 天)
   - 添加 `ion-fab` 创建新提示词

**复用的业务逻辑：**
- `/src/renderer/lib/api/prompt.api.ts` (100%)
- `/src/renderer/lib/api/category.api.ts` (100%)
- `/src/renderer/composables/useDatabase.ts` (100%)

### 阶段 3：AI 配置和生成功能 (3-5 天)

**任务清单：**

1. **AI 配置列表** (1 天)
   - 创建 `MobileAIConfigList.vue`
   - 使用 `ion-list` 展示配置
   - 启用/禁用开关 (`ion-toggle`)
   - 编辑和删除操作

2. **AI 配置编辑** (1.5 天)
   - 创建 `MobileAIConfigEditor.vue`
   - 表单组件 (`ion-input`, `ion-select`)
   - 配置验证
   - 测试连接功能

3. **AI 生成器** (1.5 天)
   - 创建 `MobileAIGenerator.vue`
   - 简化的生成界面
   - 需求输入和模型选择
   - 生成结果展示

**复用的业务逻辑：**
- `/src/renderer/lib/api/ai-config.api.ts` (100%)
- `/src/renderer/lib/utils/ai.service.ts` (需适配)

### 阶段 4：设置页面 (3-5 天)

**任务清单：**

1. **设置列表** (1 天)
   - 创建 `MobileSettingsList.vue`
   - 使用 `ion-list` 和 `ion-item-group`
   - 分组显示设置项

2. **基础设置** (1 天)
   - 语言设置 (`ion-select`)
   - 主题设置 (`ion-segment`)

3. **数据管理** (1.5 天)
   - 导入/导出功能
   - 备份管理
   - 数据库健康检查

4. **云备份** (1.5 天)
   - WebDAV 配置
   - 同步功能
   - 冲突解决

**不实现的功能：**
- ❌ 快捷键设置（桌面端特有）
- ❌ 窗口行为设置（桌面端特有）
- ❌ 启动行为设置（桌面端特有）

### 阶段 5：手势和交互优化 (2-3 天)

**任务清单：**

1. **下拉刷新** (0.5 天)
   - 在列表页添加 `ion-refresher`
   - 实现刷新逻辑

2. **侧滑操作** (0.5 天)
   - 使用 `ion-item-sliding`
   - 编辑和删除操作

3. **长列表优化** (1 天)
   - 使用 `ion-virtual-scroll`
   - 分页加载

4. **触觉反馈** (0.5 天)
   - 使用 Capacitor Haptics API
   - 关键操作反馈

### 阶段 6：测试和调试 (3-5 天)

**测试清单：**

**功能测试：**
- [ ] 提示词 CRUD 操作
- [ ] 搜索和筛选
- [ ] AI 生成功能
- [ ] 数据导入/导出
- [ ] 云备份同步
- [ ] 设置修改

**交互测试：**
- [ ] 底部导航切换
- [ ] 下拉刷新
- [ ] 侧滑操作
- [ ] 模态框打开/关闭
- [ ] 浮动操作按钮

**性能测试：**
- [ ] 首屏加载时间 < 2s
- [ ] 列表滚动 FPS > 50
- [ ] 数据库操作 < 100ms
- [ ] 内存占用 < 200MB

**兼容性测试：**
- [ ] iOS 14+ 测试
- [ ] Android 7+ 测试
- [ ] 不同屏幕尺寸
- [ ] 桌面端回归测试

## 关键技术点

### 1. 条件加载 Ionic

```typescript
// main.ts
if (PlatformDetector.isMobile()) {
  import('@ionic/vue/css/core.css')
  // ... 其他样式
}

// 条件注册插件
if (PlatformDetector.isMobile()) {
  import('@ionic/vue').then(({ IonicVue }) => {
    app.use(IonicVue);
  });
}
```

### 2. 底部导航栏

```vue
<ion-tabs>
  <ion-tab-bar slot="bottom">
    <ion-tab-button tab="prompts">
      <ion-icon :icon="listOutline"></ion-icon>
      <ion-label>提示词</ion-label>
    </ion-tab-button>
    <!-- 其他标签 -->
  </ion-tab-bar>
</ion-tabs>
```

### 3. 移动端交互模式

- **全屏模态框**: `ion-modal` + `breakpoints`
- **抽屉菜单**: 从底部滑出的 `ion-modal`
- **浮动按钮**: `ion-fab` 固定右下角
- **下拉刷新**: `ion-refresher`
- **侧滑操作**: `ion-item-sliding`

### 4. 数据层复用

所有数据层代码 100% 复用，无需修改：
- API 层: `/src/renderer/lib/api/`
- 服务层: `/src/renderer/lib/services/`
- 数据库: `/src/renderer/lib/db.ts`
- 适配层: `/src/renderer/capacitor-bridge/`

## 风险和挑战

### 1. 样式冲突

**问题**: Naive UI 和 Ionic 全局样式可能冲突

**解决方案**:
- Ionic 组件使用 Shadow DOM 隔离
- 条件加载样式文件
- 使用 CSS 作用域

### 2. 性能问题

**问题**: 长列表滚动、图片加载

**解决方案**:
- 使用 `ion-virtual-scroll`
- 图片懒加载和压缩
- 分页加载数据

### 3. 平台差异

**问题**: iOS 和 Android UI 规范不同

**解决方案**:
- Ionic 自动适配平台样式
- 测试两个平台
- 使用响应式布局

## 预期成果

**总时间**: 19-30 天

**阶段成果**:
- 阶段 1 (3-5 天): ✅ 基础框架完成
- 阶段 2 (5-7 天): 提示词管理完成
- 阶段 3 (3-5 天): AI 功能完成
- 阶段 4 (3-5 天): 设置页面完成
- 阶段 5 (2-3 天): 交互优化完成
- 阶段 6 (3-5 天): 测试完成

**最终交付**:
- ✅ 移动端完整功能
- ✅ 原生移动端体验
- ✅ 桌面端功能不受影响
- ✅ 代码复用率 > 80%
- ✅ 性能指标达标

## 维护和扩展

### 后续优化

1. **性能优化**
   - 虚拟滚动优化
   - 图片懒加载
   - 组件按需加载

2. **移动端特有功能**
   - 分享功能
   - 剪贴板增强
   - 触觉反馈

3. **离线支持**
   - Service Worker
   - 离线缓存
   - 数据同步

### App Store 发布

1. **iOS App Store**
   - 应用截图
   - 应用描述
   - 隐私政策

2. **Google Play Store**
   - 应用截图
   - 应用描述
   - 隐私政策

## 参考资源

- [Ionic Vue 文档](https://ionicframework.com/docs/vue/overview)
- [Capacitor 文档](https://capacitorjs.com/docs)
- [Vue Router 文档](https://router.vuejs.org/)
- [Ionic 图标库](https://ionic.io/ionicons)
