// @vitest-environment node

// 主进程原生界面（托盘、关闭确认框、文件选择框、系统通知）以前只有中文。
// 这里验证：文案表覆盖五种界面语言；语言跟随渲染进程上报的界面语言，没上报时跟随系统语言；
// 切换语言后托盘提示和菜单立刻换成新语言；文件选择框按界面语言显示标题和过滤项。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_LOCALES } from '../../src/shared/locale'
import { MAIN_STRINGS, formatMainString, type MainStrings } from '../../src/main/electron/main-strings'

const electronMock = vi.hoisted(() => ({
  systemLanguages: ['zh-Hans-CN'] as string[],
  tray: null as null | {
    tooltips: string[]
    menus: { label?: string; type?: string }[][]
  },
  openDialogOptions: [] as any[],
  saveDialogOptions: [] as any[],
}))

vi.mock('electron', () => {
  class FakeTray {
    tooltips: string[] = []
    menus: { label?: string; type?: string }[][] = []
    constructor() {
      electronMock.tray = this
    }
    setToolTip(text: string) { this.tooltips.push(text) }
    setContextMenu(menu: { items: { label?: string; type?: string }[] }) { this.menus.push(menu.items) }
    on() { /* no-op */ }
    isDestroyed() { return false }
    destroy() { /* no-op */ }
  }
  return {
    app: {
      getPreferredSystemLanguages: () => electronMock.systemLanguages,
      getLocale: () => electronMock.systemLanguages[0] ?? '',
      quit: () => undefined,
      focus: () => undefined,
    },
    Tray: FakeTray,
    Menu: { buildFromTemplate: (items: unknown[]) => ({ items }) },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => false, resize() { return this }, setTemplateImage: () => undefined }),
    },
    dialog: {
      showOpenDialog: async (options: unknown) => {
        electronMock.openDialogOptions.push(options)
        return { canceled: true, filePaths: [] }
      },
      showSaveDialog: async (options: unknown) => {
        electronMock.saveDialogOptions.push(options)
        return { canceled: true }
      },
    },
  }
})

vi.mock('../../src/main/electron/utils', () => ({
  getAppIconPath: () => '/tmp/icon.png',
  getMacTrayIconPath: () => '/tmp/trayTemplate.png',
}))

vi.mock('../../src/main/electron/shortcut-manager', () => ({
  ShortcutManager: { getInstance: () => ({ openLauncher: async () => undefined }) },
}))

vi.mock('../../src/main/data/fs-service', () => ({ fsService: {} }))

const collectStrings = (strings: MainStrings): string[] =>
  Object.values(strings).flatMap(group => Object.values(group as Record<string, string>))

describe('main-process string table', () => {
  it('covers all five UI languages with the same non-empty keys', () => {
    expect(Object.keys(MAIN_STRINGS).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    const shape = (strings: MainStrings) =>
      Object.entries(strings).map(([group, values]) => `${group}:${Object.keys(values).sort().join(',')}`)

    for (const locale of SUPPORTED_LOCALES) {
      expect(shape(MAIN_STRINGS[locale])).toEqual(shape(MAIN_STRINGS['zh-CN']))
      for (const value of collectStrings(MAIN_STRINGS[locale])) {
        expect(value.trim(), `${locale} has an empty string`).not.toBe('')
      }
    }
  })

  it('has no Chinese in the English and Italian tables', () => {
    for (const locale of ['en-US', 'it-IT'] as const) {
      for (const value of collectStrings(MAIN_STRINGS[locale])) {
        expect(value, `${locale}: ${value}`).not.toMatch(/[一-鿿]/)
      }
    }
  })

  it('fills the file format placeholder', () => {
    expect(formatMainString(MAIN_STRINGS['zh-CN'].fileDialog.formatFiles, { format: 'JSON' })).toBe('JSON 文件')
    expect(formatMainString(MAIN_STRINGS['en-US'].fileDialog.formatFiles, { format: 'CSV' })).toBe('CSV files')
    expect(formatMainString(MAIN_STRINGS['it-IT'].fileDialog.formatFiles, { format: 'CSV' })).toBe('File CSV')
  })
})

describe('main-process UI locale', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.systemLanguages = ['zh-Hans-CN']
    electronMock.tray = null
    electronMock.openDialogOptions = []
    electronMock.saveDialogOptions = []
  })

  it('follows the system language until the renderer reports one', async () => {
    const { getMainLocale, initMainLocale } = await import('../../src/main/electron/main-locale')

    electronMock.systemLanguages = ['ja-JP', 'en-US']
    expect(getMainLocale()).toBe('ja-JP')
    electronMock.systemLanguages = ['zh-Hant-TW']
    expect(getMainLocale()).toBe('zh-TW')
    electronMock.systemLanguages = ['ko-KR']
    expect(getMainLocale()).toBe('en-US')

    initMainLocale('it-IT')
    expect(getMainLocale()).toBe('it-IT')
    initMainLocale('not-a-locale')
    expect(getMainLocale()).toBe('en-US')
  })

  it('ignores unknown or unchanged locales and notifies listeners on a real change', async () => {
    const { onMainLocaleChange, setUiLocale, getMainLocale } = await import('../../src/main/electron/main-locale')
    const listener = vi.fn()
    const stop = onMainLocaleChange(listener)

    expect(setUiLocale('fr-FR')).toBe(false)
    expect(setUiLocale('en-US')).toBe(true)
    expect(setUiLocale('en-US')).toBe(false)
    expect(getMainLocale()).toBe('en-US')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('en-US')

    stop()
    setUiLocale('ja-JP')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the tray tooltip and menu when the UI language changes', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const { initMainLocale, setUiLocale } = await import('../../src/main/electron/main-locale')
      const { trayManager } = await import('../../src/main/electron/tray-manager')
      initMainLocale('zh-CN')

      expect(trayManager.createTray()).toBe(true)
      const tray = electronMock.tray!
      expect(tray.menus.at(-1)!.map(item => item.label).filter(Boolean)).toEqual(['打开 AI Gist', '退出'])

      setUiLocale('en-US')
      expect(tray.menus.at(-1)!.map(item => item.label).filter(Boolean)).toEqual(['Open AI Gist', 'Quit'])
      expect(tray.tooltips.at(-1)).toBe('AI Gist')

      trayManager.destroy()
      setUiLocale('ja-JP')
      // 托盘销毁后不再响应语言切换
      expect(tray.menus.at(-1)!.map(item => item.label).filter(Boolean)).toEqual(['Open AI Gist', 'Quit'])
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('titles the import and export pickers in the UI language', async () => {
    const { initMainLocale } = await import('../../src/main/electron/main-locale')
    const { DataManagementService } = await import('../../src/main/data/data-management-service')
    const service = new DataManagementService()

    initMainLocale('en-US')
    await service.selectImportFile('json')
    await service.selectExportPath('ai-gist-2026-10-29.csv')
    await service.selectExportPath('ai-gist-2026-10-29')

    expect(electronMock.openDialogOptions[0]).toMatchObject({
      title: 'Choose a file to import',
      filters: [{ name: 'JSON files', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }],
    })
    expect(electronMock.saveDialogOptions[0]).toMatchObject({
      title: 'Choose where to export',
      filters: [{ name: 'CSV files', extensions: ['csv'] }, { name: 'All files', extensions: ['*'] }],
    })
    expect(electronMock.saveDialogOptions[1].filters.map((filter: { name: string }) => filter.name))
      .toEqual(['CSV files', 'JSON files', 'All files'])

    initMainLocale('zh-TW')
    await service.selectImportFile('csv')
    expect(electronMock.openDialogOptions[1]).toMatchObject({
      title: '選擇要匯入的檔案',
      filters: [{ name: 'CSV 檔案' }, { name: '所有檔案' }],
    })
  })
})
