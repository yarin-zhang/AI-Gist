/**
 * 移动端底部面板的操作区（Gitea #469）
 *
 * 面板停在 0.92 / 0.85 / 0.75 这类断点时，ion-modal 默认只是把整屏高的面板往下推，
 * 底部按钮（停止、重新生成、运行、显示 N 个结果）落在屏幕外。带底部操作或长列表的面板
 * 要关掉 expandToScroll，让 Ionic 把内容高度限制在当前断点的可见范围内。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const modalTag = (source: string, marker: string) => {
  const tags = source.match(/<ion-modal\b[^>]*>/g) || []
  return tags.find(tag => tag.includes(marker)) || ''
}

describe('移动端底部面板的操作区始终在可视范围内', () => {
  it.each([
    ['src/renderer/components/mobile/prompt/MobileTryRunSheet.vue', ':is-open="open"', 'run-sheet__foot'],
    ['src/renderer/components/mobile/prompt/MobileQuickOptimizeSheet.vue', ':is-open="open"', 'optimize-sheet__foot'],
    ['src/renderer/components/mobile/prompt/MobilePromptFilterSheet.vue', ':is-open="open"', 'filter-sheet__foot'],
  ])('%s 的底部按钮贴着面板可见区域的底边', (path, marker, footer) => {
    const source = read(path)
    const tag = modalTag(source, marker)
    expect(tag).toContain(':breakpoints=')
    expect(tag).toContain(':expand-to-scroll="false"')
    // 底部按钮仍在面板里（不是放进会随整屏推出去的位置）
    expect(source).toMatch(new RegExp(`<ion-content[\\s\\S]*?</ion-content>\\s*<footer[^>]*class="${footer}"`))
  })

  it('AI 生成页的生成记录面板在默认高度下也能滚到最后一条', () => {
    const tag = modalTag(read('src/renderer/pages/mobile/MobileAIGeneratorPage.vue'), ':is-open="showHistory"')
    expect(tag).toContain(':initial-breakpoint="0.75"')
    expect(tag).toContain(':expand-to-scroll="false"')
  })
})
