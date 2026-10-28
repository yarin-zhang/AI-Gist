import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/prompts/PromptPage.vue'),
  'utf8'
)

describe('Issue #176：历史回滚必须确认', () => {
  it('恢复历史版本前显示确认对话框，确认后才写入并保存为新版本', () => {
    expect(page).toContain("content: t('promptManagement.rollbackConfirmation')")
    expect(page).toMatch(/const restoreVersion = \(version: PromptHistory\) => \{\s*dialog\.warning\(\{[\s\S]*?onPositiveClick: async \(\) => \{[\s\S]*?await saveChanges\(\)/)
    expect(page).toContain("pendingChangeDescription = t('promptHistory.restoredFrom', { version: version.version })")
  })
})
