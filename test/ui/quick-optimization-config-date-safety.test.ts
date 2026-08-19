import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

/**
 * 回归测试：Gitea issue #37 —— 快捷优化提示词区域，所有按钮一点击就报错：
 * "Optimization failed: selectedConfig.createdAt.toISOString is not a function"
 *
 * 根因排查：
 * `PromptEditModal.vue` 的 `optimizePrompt` / `applyManualAdjustment` 在序列化
 * `selectedConfig`（来自 `AIModelSelector` 暴露的 `AIConfig`）以便通过 IPC 传递时，
 * 无条件调用 `selectedConfig.createdAt.toISOString()`，假设该字段永远是 `Date` 实例。
 *
 * 但 `AIConfig.createdAt/updatedAt` 一旦经由本地备份恢复或云同步写入
 * IndexedDB（`database-manager.service.ts` 的 `addRestoredRecord`，写入的是
 * 备份 JSON 里原样的字段，JSON 没有 Date 类型，所以是 ISO 字符串），
 * 就会变成字符串而不是 Date 实例；字符串没有 `.toISOString` 方法，于是抛出
 * `TypeError: selectedConfig.createdAt.toISOString is not a function`。
 *
 * 经 `git blame` 确认，这两处 `.toISOString()` 调用早在 2025-06-17（提交
 * 9f2507d6 / 7ac70fca）就已引入，比这批"快捷优化"重构（issue #7/#9/#11/#16，
 * 均为 2026 年提交）早了一年多——因此这是一个被最近改动"顺带暴露"、而非
 * 由本批次改动引入的既有潜藏 bug。同一份代码里序列化 AIConfig 用于 IPC 的
 * 另一处实现（`AIGeneratorComponent.vue` 的 `serializeConfig`）早已用
 * `instanceof Date` 判断类型分别处理，本次修复让 `PromptEditModal.vue` 的
 * 两处调用与之保持一致。
 */
describe('quick optimization: selectedConfig date fields survive non-Date values', () => {
  it('no longer assumes selectedConfig.createdAt/updatedAt are always Date instances', () => {
    const modal = readRendererFile('components/prompt-management/PromptEditModal.vue')

    // 修复前的写法：`selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : ...`
    // 一旦 createdAt 是非空字符串，三元表达式的真分支依然会调用 `.toISOString()` 而抛错。
    expect(modal).not.toMatch(/selectedConfig\.createdAt \? selectedConfig\.createdAt\.toISOString\(\)/)
    expect(modal).not.toMatch(/selectedConfig\.updatedAt \? selectedConfig\.updatedAt\.toISOString\(\)/)

    // 修复后：先判断是否为 Date 实例，只有真的是 Date 时才调用 .toISOString()。
    const guardedCreatedAt = modal.match(/createdAt: selectedConfig\.createdAt instanceof Date[^\n]*/g) || []
    const guardedUpdatedAt = modal.match(/updatedAt: selectedConfig\.updatedAt instanceof Date[^\n]*/g) || []

    // optimizePrompt 和 applyManualAdjustment 两处都需要修复。
    expect(guardedCreatedAt).toHaveLength(2)
    expect(guardedUpdatedAt).toHaveLength(2)
  })

  it('reproduces the crash for the old unguarded expression and proves the fixed expression is safe', () => {
    // 模拟备份恢复/云同步后从 IndexedDB 读出的配置：createdAt 是 ISO 字符串而非 Date。
    const restoredCreatedAt = '2026-08-19T07:11:30.502Z' as unknown as Date
    const freshCreatedAt = new Date('2026-08-19T07:11:30.502Z')

    // 修复前的表达式：只判断“真假”，不判断类型，字符串是真值，照样会走进 .toISOString()。
    const buildWithOldExpression = (createdAt: Date | string) =>
      createdAt ? (createdAt as Date).toISOString() : new Date().toISOString()

    // 对真实 Date 没问题
    expect(buildWithOldExpression(freshCreatedAt)).toBe(freshCreatedAt.toISOString())
    // 对字符串（备份恢复/云同步场景）会抛出与 issue #37 完全一致的错误
    expect(() => buildWithOldExpression(restoredCreatedAt)).toThrowError(
      /createdAt\.toISOString is not a function/
    )

    // 修复后的表达式：按实际类型分别处理，两种情况都不会抛错。
    const buildWithFixedExpression = (createdAt: Date | string) =>
      createdAt instanceof Date ? createdAt.toISOString() : (createdAt || new Date().toISOString())

    expect(buildWithFixedExpression(freshCreatedAt)).toBe(freshCreatedAt.toISOString())
    expect(() => buildWithFixedExpression(restoredCreatedAt)).not.toThrow()
    expect(buildWithFixedExpression(restoredCreatedAt)).toBe(restoredCreatedAt)
  })

  it('keeps the same defensive convention already used by AIGeneratorComponent.vue for the same field', () => {
    // 同一个"序列化 AIConfig 供 IPC 传递"的场景，AIGeneratorComponent.vue 早就用
    // instanceof Date 处理过这个问题；这里确认两处实现现在使用一致的判断方式，
    // 避免以后再次出现"一个地方修了、另一个复制出来的地方没修"的情况。
    const generator = readRendererFile('components/ai/AIGeneratorComponent.vue')
    expect(generator).toContain(
      "createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,"
    )
  })
})
