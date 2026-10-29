/**
 * #474：同步失败卡片里「诊断说明」和「下次重试时间」的拼接不再出现「。；」，
 * 错误详情弹窗里列出实际错误。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { joinSentences } from '~/pages/mobile/settings/shared'

describe('joinSentences', () => {
  it('中文、日文句号后直接接下一句，不加分号或空格', () => {
    expect(joinSentences('应用会自动重试。', '下次重试：15分钟后', 'zh-CN')).toBe('应用会自动重试。下次重试：15分钟后')
    expect(joinSentences('再試行します。', '次回の再試行：15 分後', 'ja-JP')).toBe('再試行します。次回の再試行：15 分後')
  })

  it('其他语言用一个空格隔开；第一句没有句末标点时补上', () => {
    expect(joinSentences('Retrying.', 'Next retry in 15 minutes.', 'en-US')).toBe('Retrying. Next retry in 15 minutes.')
    expect(joinSentences('Network error', 'Next retry in 15 minutes.', 'en-US')).toBe('Network error. Next retry in 15 minutes.')
    expect(joinSentences('网络错误', '下次重试：15分钟后', 'zh-CN')).toBe('网络错误。下次重试：15分钟后')
  })
})

describe('同步错误详情', () => {
  it('弹窗里只有说明和建议，原始错误只在「复制」出来的详情里', () => {
    const shared = readFileSync('src/renderer/pages/mobile/settings/shared.ts', 'utf8')
    expect(shared).not.toContain('errorDetailLabel')
    expect(shared).not.toMatch(/message: \[[^\]]*rawError/)
    expect(shared).toContain('void copyText(diagnosis.copyText)')
  })

  it('手动同步遇到应用自己会恢复的失败时只提示稍后再同步', () => {
    const shared = readFileSync('src/renderer/pages/mobile/settings/shared.ts', 'utf8')
    expect(shared).toMatch(/options\.quietWhenRecoverable && diagnosis\.quiet/)
    for (const page of ['MobileDataSyncPage.vue', 'MobileStorageConfigPage.vue']) {
      expect(readFileSync(`src/renderer/pages/mobile/settings/${page}`, 'utf8')).toContain('quietWhenRecoverable: true')
    }
  })
})
