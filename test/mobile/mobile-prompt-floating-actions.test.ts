/**
 * 移动端底部浮动导航「提示词操作区」两态按钮布局测试
 *
 * 对应 Gitea issue #7：提示词 Tab 的浮动操作区从单一的「AI 生成」长条按钮，
 * 改为「新建提示词」长条 + 「AI 生成提示词」圆形按钮的组合，具体谁是主位
 * （长条）、谁是次位（圆形）由是否已配置可用的 AI 决定：
 *
 * - 未配置 AI：新建提示词是唯一能立刻用的操作 → 主位；AI 生成引导去配置 → 次位。
 * - 已配置 AI：AI 生成体验更完整 → 主位；新建提示词退居次位。
 *
 * 核心判断逻辑抽在 src/renderer/lib/mobile/floating-prompt-actions.ts 里的纯函数
 * getPromptFloatingActions，这里直接测这个函数，不需要挂载 Ionic 组件树。
 */

import { describe, it, expect } from 'vitest'
import { getPromptFloatingActions } from '~/lib/mobile/floating-prompt-actions'

describe('getPromptFloatingActions — 提示词浮动操作区两态布局', () => {
  it('未配置 AI 时：新建提示词是主位（长条），AI 生成是次位（圆形，引导配置）', () => {
    const actions = getPromptFloatingActions(false)
    expect(actions.primary).toBe('create')
    expect(actions.secondary).toBe('ai-generate')
  })

  it('已配置 AI 后：AI 生成升为主位（长条），新建提示词退居次位（圆形）', () => {
    const actions = getPromptFloatingActions(true)
    expect(actions.primary).toBe('ai-generate')
    expect(actions.secondary).toBe('create')
  })

  it('两态下 primary 与 secondary 始终互斥，不会出现同一个操作占两个位置', () => {
    for (const hasAIConfig of [true, false]) {
      const actions = getPromptFloatingActions(hasAIConfig)
      expect(actions.primary).not.toBe(actions.secondary)
    }
  })
})
