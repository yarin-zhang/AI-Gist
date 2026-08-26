import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const editModal = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/prompt-management/PromptEditModal.vue'),
  'utf8'
)

describe('Issue #176：历史回滚必须确认', () => {
  it('在应用历史版本前显示确认对话框，并在确认后关闭预览', () => {
    expect(editModal).toContain("content: t('promptManagement.rollbackConfirmation')")
    expect(editModal).toContain('applyHistoryRollback(history)')
    expect(editModal).toContain('@click="rollbackToHistory(previewHistory!, closePreviewModal)"')
  })
})
