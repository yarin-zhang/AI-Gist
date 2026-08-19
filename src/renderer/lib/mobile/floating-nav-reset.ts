/**
 * 移动端悬浮导航条（AI 入口条 + 标签栏）的收起状态重置判断。
 *
 * 对应 Gitea issue #88：从二级页面（提示词详情、设置子页面等，见
 * router/mobile.ts——这些路由都和 /tabs 同级，不是它的子路由）返回第一个
 * Tab 时，悬浮导航条会先闪一下展开成较宽的状态，要等用户再滑动一下才收起。
 *
 * 根因：MobileMainPage.vue 里 `watch(() => route.path, ...)` 原本想在
 * 「三个 Tab 之间切换」时重置收起状态（isNavMinimized），避免带着上一个
 * Tab 的收起态进入新 Tab；但它不分青红皂白地在 route.path 变化时一律重置，
 * 而 MobileMainPage 导航到 /tabs/* 之外的二级页面时并不会被销毁——Ionic 的
 * ion-router-outlet 只是把它保留在页面栈底层、盖上新页面。于是离开二级页面
 * 的那一刻这个 watch 也会触发，把 isNavMinimized 提前错误地重置为 false
 * （此时只是暂时被二级页面盖住看不见），等返回列表页时就会先展开成较宽
 * 状态，直到一次新的真实滚动事件才把它纠正回来。
 *
 * 把「新旧路径是否都落在 Tab 根路径下」这条判断抽成纯函数，只有两者都是
 * Tab 根路径（确实在三个 Tab 之间切换）才应该重置；离开/返回二级页面时
 * 不应该重置，从而保留原有的收起状态。
 */
export function isTabRootPath(path: string): boolean {
  return path.startsWith('/tabs/')
}

export function shouldResetFloatingNav(oldPath: string, newPath: string): boolean {
  return isTabRootPath(oldPath) && isTabRootPath(newPath) && oldPath !== newPath
}
