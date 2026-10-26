import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '../src/renderer/i18n/locales/en-US.json'
import itIT from '../src/renderer/i18n/locales/it-IT.json'
import zhCN from '../src/renderer/i18n/locales/zh-CN.json'

interface Messages { [key: string]: string | Messages }

const flatten = (messages: Messages, prefix = ''): [string, string][] =>
  Object.entries(messages).flatMap(([key, value]) => (
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flatten(value, `${prefix}${key}.`)
  ))

const createTranslator = (locale: string) => createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'en-US',
  messages: { 'en-US': enUS, 'it-IT': itIT, 'zh-CN': zhCN },
}).global.t

describe('count messages pluralize (#384)', () => {
  it('uses singular nouns for 1 and plural nouns otherwise in English', () => {
    const t = createTranslator('en-US')

    expect(t('promptManagement.totalCategories', { count: 1 })).toBe('1 category total')
    expect(t('promptManagement.totalCategories', { count: 3 })).toBe('3 categories total')
    expect(t('promptManagement.categoryPromptCount', { count: 1 })).toBe('1 prompt')
    expect(t('promptManagement.categoryPromptCount', { count: 0 })).toBe('0 prompts')
    expect(t('promptEditor.variableCount', { count: 1 })).toBe('1 variable')
    expect(t('promptEditor.variableCount', { count: 2 })).toBe('2 variables')
    expect(t('promptManagement.useCount', { count: 1 })).toBe('Used 1 time')
    expect(t('promptManagement.useCount', { count: 0 })).toBe('Used 0 times')
    expect(t('promptEditor.occurrenceCount', { count: 1 })).toBe('Used 1 time in the prompt')
    expect(t('promptEditor.occurrenceCount', { count: 4 })).toBe('Used 4 times in the prompt')
    expect(t('dataBackup.backupEveryHours', { count: 1 })).toBe('Every hour')
    expect(t('dataBackup.backupEveryHours', { count: 6 })).toBe('Every 6 hours')
  })

  it('pluralizes the same messages in Italian', () => {
    const t = createTranslator('it-IT')

    expect(t('promptManagement.totalCategories', { count: 1 })).toBe('1 categoria in totale')
    expect(t('promptManagement.totalCategories', { count: 2 })).toBe('2 categorie in totale')
    expect(t('promptManagement.useCount', { count: 1 })).toBe('Usato 1 volta')
    expect(t('promptManagement.useCount', { count: 5 })).toBe('Usato 5 volte')
  })

  it('leaves single-form locales unchanged', () => {
    const t = createTranslator('zh-CN')

    expect(t('promptManagement.useCount', { count: 1 }))
      .toBe(t('promptManagement.useCount', { count: 2 }).replace('2', '1'))
  })

  it('has no English count message with a plural noun but no singular form', () => {
    const pluralNounAfterCount = /\{count\}\s+(?:[\w-]+\s+){0,3}?[a-z]+s\b/
    const offenders = flatten(enUS as Messages)
      .filter(([, value]) => !value.includes('|') && pluralNounAfterCount.test(value))
      .map(([key]) => key)

    expect(offenders).toEqual([])
  })
})
