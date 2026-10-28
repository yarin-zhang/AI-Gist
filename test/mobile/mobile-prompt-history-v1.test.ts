/**
 * #411：移动端新建提示词也记下 v1「创建」，修改时的版本规则和桌面端相同（共用 writePromptHistory）。
 */
import { readFileSync } from 'node:fs'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptWithRelations } from '@shared/types/database'

const mocks = vi.hoisted(() => ({
  histories: [] as any[],
  createHistory: vi.fn(),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    prompts: {
      create: { mutate: (...args: unknown[]) => mocks.createPrompt(...args) },
      update: { mutate: (...args: unknown[]) => mocks.updatePrompt(...args) },
    },
    promptHistories: {
      getByPromptId: { query: async () => mocks.histories },
      create: { mutate: (...args: unknown[]) => mocks.createHistory(...args) },
    },
  },
}))

const { useMobilePromptForm } = await import('~/components/mobile/prompt/useMobilePromptForm')

const labels = {
  changeDescription: '编辑更新',
  fallbackTitle: '提示词',
  createdDescription: '创建',
  beforeEditDescription: '修改前的内容',
}

const storedPrompt = (overrides: Partial<PromptWithRelations> = {}) => ({
  id: 3,
  uuid: 'p3',
  title: '周报',
  description: '旧描述',
  content: '原来的正文 {{name}}',
  tags: [],
  variables: [],
  isJinjaTemplate: false,
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
}) as PromptWithRelations

const recorded = () => mocks.createHistory.mock.calls.map(([record]) => ({
  version: record.version,
  content: record.content,
  changeDescription: record.changeDescription,
}))

beforeEach(() => {
  mocks.histories = []
  mocks.createHistory.mockReset().mockImplementation(async (record: any) => {
    mocks.histories.push({ ...record, id: mocks.histories.length + 1 })
    return record
  })
  mocks.createPrompt.mockReset().mockImplementation(async (data: any) => ({ ...data, id: 9 }))
  mocks.updatePrompt.mockReset().mockImplementation(async ({ id, data }: any) => ({ ...data, id }))
})

describe('mobile prompt form version history', () => {
  it('records the created content as v1, like the desktop', async () => {
    const form = useMobilePromptForm()
    form.load(null)
    form.form.value.title = '新提示词'
    form.form.value.content = '第一版正文'
    await nextTick()
    await form.save(labels)
    expect(recorded()).toEqual([{ version: 1, content: '第一版正文', changeDescription: '创建' }])
    expect(mocks.createHistory.mock.calls[0][0].promptId).toBe(9)
  })

  it('backfills the content before the first edit of a prompt that has no history yet', async () => {
    const form = useMobilePromptForm()
    form.load(storedPrompt())
    await nextTick()
    form.form.value.content = '改过的正文'
    await nextTick()
    await form.save(labels)
    expect(recorded()).toEqual([
      { version: 1, content: '原来的正文 {{name}}', changeDescription: '修改前的内容' },
      { version: 2, content: '改过的正文', changeDescription: '编辑更新' },
    ])
  })

  it('writes no version when the save itself fails', async () => {
    mocks.updatePrompt.mockReset().mockRejectedValue(new Error('db locked'))
    const form = useMobilePromptForm()
    form.load(storedPrompt())
    await nextTick()
    form.form.value.content = '改过的正文'
    await expect(form.save(labels)).rejects.toThrow('db locked')
    expect(mocks.createHistory).not.toHaveBeenCalled()
  })

  it('reuses the desktop history writer instead of keeping a copy', () => {
    const mobile = readFileSync('src/renderer/components/mobile/prompt/useMobilePromptForm.ts', 'utf8')
    const desktop = readFileSync('src/renderer/composables/prompt/usePromptEditor.ts', 'utf8')
    const page = readFileSync('src/renderer/pages/mobile/MobilePromptEditPage.vue', 'utf8')
    expect(mobile).toContain("import { writePromptHistory } from '~/lib/utils/prompt-history'")
    expect(desktop).toContain("import { writePromptHistory } from '@/lib/utils/prompt-history'")
    expect(mobile).not.toContain('promptHistories.create')
    expect(desktop).not.toContain('promptHistories.create')
    expect(page).toContain("createdDescription: t('promptHistory.createdVersion')")
    expect(page).toContain("beforeEditDescription: t('promptHistory.beforeEdit')")
  })
})
