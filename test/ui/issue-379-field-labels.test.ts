import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')
const locales = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'it-IT']

describe('prompt title and updated field labels (#379)', () => {
  it('labels the title field and table columns with field names, not the page title', () => {
    const editModal = readRendererFile('components/prompt-management/PromptEditModal.vue')
    const list = readRendererFile('components/prompt-management/PromptList.vue')

    expect(editModal).toContain(`:label="t('promptManagement.titleLabel')" path="title"`)
    expect(editModal).not.toContain(`:label="t('promptManagement.title')"`)
    expect(list).not.toContain(`t('promptManagement.title')`)
    expect(list).not.toContain(`t('promptManagement.update')`)
    expect(list.match(/t\('promptManagement\.titleLabel'\)/g)?.length).toBe(2)
    expect(list.match(/t\('promptManagement\.updatedLabel'\)/g)?.length).toBe(2)
  })

  it.each(locales)('keeps field labels distinct from the page title in %s', (locale) => {
    const messages = JSON.parse(readRendererFile(`i18n/locales/${locale}.json`)).promptManagement

    expect(messages.titleLabel).toBeTruthy()
    expect(messages.updatedLabel).toBeTruthy()
    expect(messages.titleLabel).not.toBe(messages.title)
  })

  it('reads "Updated" in the English table header', () => {
    const messages = JSON.parse(readRendererFile('i18n/locales/en-US.json')).promptManagement

    expect(messages.titleLabel).toBe('Title')
    expect(messages.updatedLabel).toBe('Updated')
  })
})
