import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')
const locales = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'it-IT']

describe('prompt title and updated field labels (#379)', () => {
  it('labels the title field and table columns with field names, not the page title', () => {
    const header = readRendererFile('components/prompts/PromptHeader.vue')
    const table = readRendererFile('components/prompts/PromptTable.vue')

    expect(header).toContain(`:aria-label="t('promptPage.titleLabel')"`)
    expect(header).not.toContain(`t('promptManagement.title')`)
    expect(table).not.toContain(`t('promptManagement.title')`)
    expect(table).not.toContain(`t('promptManagement.update')`)
    expect(table).toContain(`t('promptManagement.titleLabel')`)
    expect(table).toContain(`t('promptManagement.updatedLabel')`)
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
