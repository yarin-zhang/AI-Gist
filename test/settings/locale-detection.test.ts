import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyDocumentLocale,
  detectPreferredLocale,
  persistUserLocale,
  readStoredLocale,
  resolveInitialLocale,
} from '../../src/renderer/i18n/locale-detection'

const setNavigatorLanguages = (languages: string[]) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '')
}

describe('detectPreferredLocale', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('把 iOS 上报的 zh-Hans-CN 识别为简体中文', () => {
    setNavigatorLanguages(['zh-Hans-CN'])
    expect(detectPreferredLocale()).toBe('zh-CN')
  })

  it.each(['zh-Hant', 'zh-Hant-TW', 'zh-TW', 'zh-HK', 'zh-Hant-HK', 'zh-MO'])(
    '把 %s 识别为繁体中文',
    tag => {
      setNavigatorLanguages([tag])
      expect(detectPreferredLocale()).toBe('zh-TW')
    }
  )

  it.each([
    ['ja', 'ja-JP'],
    ['ja-JP', 'ja-JP'],
    ['en', 'en-US'],
    ['en-GB', 'en-US'],
  ])('把 %s 识别为 %s', (tag, expected) => {
    setNavigatorLanguages([tag])
    expect(detectPreferredLocale()).toBe(expected)
  })

  it('跳过不支持的语言，取偏好列表里第一个支持的语言', () => {
    setNavigatorLanguages(['ko-KR', 'de-DE', 'ja-JP', 'en-US'])
    expect(detectPreferredLocale()).toBe('ja-JP')
  })

  it('全部不支持时回退到英文', () => {
    setNavigatorLanguages(['ko-KR', 'de-DE'])
    expect(detectPreferredLocale()).toBe('en-US')
  })
})

describe('语言持久化', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('没有用户选择时跟随系统语言，且不写入存储', () => {
    setNavigatorLanguages(['zh-Hans-CN'])
    expect(resolveInitialLocale()).toBe('zh-CN')
    expect(localStorage.getItem('locale')).toBeNull()
  })

  it('用户显式选择的语言优先于系统语言', () => {
    setNavigatorLanguages(['zh-Hans-CN'])
    persistUserLocale('en-US')
    expect(readStoredLocale()).toBe('en-US')
    expect(resolveInitialLocale()).toBe('en-US')
  })

  it('忽略旧版本自动探测写下的、没有来源标记的 locale', () => {
    // 旧版 iOS 构建里 navigator.language 恒为 en-US，会把 en-US 永久写死
    localStorage.setItem('locale', 'en-US')
    setNavigatorLanguages(['zh-Hans-CN'])
    expect(readStoredLocale()).toBeNull()
    expect(resolveInitialLocale()).toBe('zh-CN')
  })

  it('忽略存储里不受支持的语言值', () => {
    localStorage.setItem('locale', 'ko-KR')
    localStorage.setItem('locale-source', 'user')
    setNavigatorLanguages(['ja-JP'])
    expect(readStoredLocale()).toBeNull()
    expect(resolveInitialLocale()).toBe('ja-JP')
  })
})

describe('applyDocumentLocale', () => {
  it.each([
    ['zh-CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
  ] as const)('把 %s 写成 <html lang="%s">，供 :lang() 选择 CJK 字体', (locale, lang) => {
    applyDocumentLocale(locale)
    expect(document.documentElement.lang).toBe(lang)
  })
})
