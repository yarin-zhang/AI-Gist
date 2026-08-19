/**
 * 移动端悬浮导航条收起状态重置判断测试
 *
 * 对应 Gitea issue #88：从二级页面（提示词详情、设置子页面等）切换回第一个
 * Tab 时，悬浮导航条会先闪一下展开成较宽的状态，要等用户再滑动一下才收起。
 *
 * 用真实的 DOM/路由测量复现确认：MobileMainPage.vue 里原来的
 * `watch(() => route.path, () => { isNavMinimized.value = false })` 会在
 * 任何 route.path 变化时触发重置——包括离开/返回 /tabs/* 之外的二级页面
 * （这些页面和 /tabs 同级，不是它的子路由，MobileMainPage 导航过去时并不会
 * 被销毁，Ionic 的 ion-router-outlet 只是把它保留在页面栈底层）。于是提示词
 * 列表下滑到收起态后点进详情页，这个 watch 会把 isNavMinimized 提前误重置
 * 为 false（此时只是暂时被详情页盖住看不见），返回列表页时就会先展开成
 * 较宽状态，直到一次新的真实滚动事件才被纠正回来。
 *
 * 核心判断逻辑抽在 src/renderer/lib/mobile/floating-nav-reset.ts 里的纯函数
 * shouldResetFloatingNav，这里直接测这个函数，不需要挂载 Ionic 组件树。
 */

import { describe, it, expect } from 'vitest'
import { isTabRootPath, shouldResetFloatingNav } from '~/lib/mobile/floating-nav-reset'

describe('isTabRootPath — 是否是三个 Tab 根路径之一', () => {
  it('/tabs/* 下的路径判定为 Tab 根路径', () => {
    expect(isTabRootPath('/tabs/prompts')).toBe(true)
    expect(isTabRootPath('/tabs/ai-config')).toBe(true)
    expect(isTabRootPath('/tabs/settings')).toBe(true)
  })

  it('二级页面（提示词详情、设置子页面等）不是 Tab 根路径', () => {
    expect(isTabRootPath('/prompt/detail/4')).toBe(false)
    expect(isTabRootPath('/prompt/create')).toBe(false)
    expect(isTabRootPath('/mobile/settings/general')).toBe(false)
    expect(isTabRootPath('/ai-config/create')).toBe(false)
  })
})

describe('shouldResetFloatingNav — 悬浮导航条是否应该重置收起状态', () => {
  it('三个 Tab 之间互相切换时应该重置（原有意图，不能回归）', () => {
    expect(shouldResetFloatingNav('/tabs/prompts', '/tabs/ai-config')).toBe(true)
    expect(shouldResetFloatingNav('/tabs/ai-config', '/tabs/settings')).toBe(true)
    expect(shouldResetFloatingNav('/tabs/settings', '/tabs/prompts')).toBe(true)
  })

  it('从 Tab 根页面离开去二级页面时不应该重置（issue #88 根因）', () => {
    expect(shouldResetFloatingNav('/tabs/prompts', '/prompt/detail/4')).toBe(false)
    expect(shouldResetFloatingNav('/tabs/prompts', '/prompt/create')).toBe(false)
    expect(shouldResetFloatingNav('/tabs/settings', '/mobile/settings/general')).toBe(false)
  })

  it('从二级页面返回 Tab 根页面时不应该重置——这样才能保留返回前的收起状态', () => {
    expect(shouldResetFloatingNav('/prompt/detail/4', '/tabs/prompts')).toBe(false)
    expect(shouldResetFloatingNav('/mobile/settings/general', '/tabs/settings')).toBe(false)
  })

  it('两个二级页面之间互相跳转时不应该重置', () => {
    expect(shouldResetFloatingNav('/prompt/detail/4', '/prompt/edit/4')).toBe(false)
  })

  it('路径未变化时不应该重置', () => {
    expect(shouldResetFloatingNav('/tabs/prompts', '/tabs/prompts')).toBe(false)
  })
})
