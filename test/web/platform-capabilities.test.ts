import { beforeEach, describe, expect, it } from 'vitest'
import { PlatformDetector } from '@shared/platform'

function setNavigatorValue(key: keyof Navigator, value: unknown) {
  Object.defineProperty(window.navigator, key, {
    value,
    configurable: true
  })
}

function setViewportSignals({
  width = 1024,
  coarsePointer = false,
  hoverNone = false
}: {
  width?: number
  coarsePointer?: boolean
  hoverNone?: boolean
} = {}) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true
  })

  window.matchMedia = ((query: string) => ({
    matches:
      (query.includes('max-width') && width <= 768) ||
      (query.includes('pointer: coarse') && coarsePointer) ||
      (query.includes('hover: none') && hoverNone),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })) as any
}

describe('PlatformDetector web capability matrix', () => {
  beforeEach(() => {
    ;(PlatformDetector as any)._platform = null
    ;(window as any).electronAPI = undefined
    ;(window as any).Capacitor = undefined
    setNavigatorValue('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36')
    setNavigatorValue('maxTouchPoints', 0)
    setViewportSignals()
  })

  it('defaults plain browsers to the Web desktop shell', () => {
    expect(PlatformDetector.getPlatform()).toBe('web')
    expect(PlatformDetector.getShell()).toBe('desktop')

    const capabilities = PlatformDetector.getCapabilities()
    expect(capabilities.desktopShell).toBe(true)
    expect(capabilities.mobileShell).toBe(false)
    expect(capabilities.localDatabase).toBe(true)
    expect(capabilities.fileImport).toBe(true)
    expect(capabilities.fileExport).toBe(true)
    expect(capabilities.localBackupDirectory).toBe(false)
    expect(capabilities.globalShortcuts).toBe(false)
    expect(capabilities.tray).toBe(false)
    expect(capabilities.startup).toBe(false)
    expect(capabilities.systemProxy).toBe(false)
    expect(capabilities.icloud).toBe(false)
    expect(capabilities.webdavSync).toBe(true)
    expect(capabilities.aiProxy).toBe(true)
  })

  it('uses the mobile shell for Web mobile browsers while keeping Web capabilities', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
    setNavigatorValue('maxTouchPoints', 5)
    setViewportSignals({ width: 390, coarsePointer: true, hoverNone: true })

    expect(PlatformDetector.getPlatform()).toBe('web')
    expect(PlatformDetector.getShell()).toBe('mobile')
    expect(PlatformDetector.isMobile()).toBe(false)
    expect(PlatformDetector.isMobileShell()).toBe(true)

    const capabilities = PlatformDetector.getCapabilities()
    expect(capabilities.desktopShell).toBe(false)
    expect(capabilities.mobileShell).toBe(true)
    expect(capabilities.webBackend).toBe(true)
    expect(capabilities.aiProxy).toBe(true)
    expect(capabilities.icloud).toBe(false)
    expect(capabilities.globalShortcuts).toBe(false)
  })

  it('uses the mobile shell for narrow coarse-pointer Web devices', () => {
    setViewportSignals({ width: 430, coarsePointer: true, hoverNone: true })

    expect(PlatformDetector.getPlatform()).toBe('web')
    expect(PlatformDetector.getShell()).toBe('mobile')
  })

  it('keeps narrow desktop browser windows on the desktop shell when they use a fine pointer', () => {
    setViewportSignals({ width: 430, coarsePointer: false, hoverNone: false })

    expect(PlatformDetector.getPlatform()).toBe('web')
    expect(PlatformDetector.getShell()).toBe('desktop')
  })

  it('keeps Electron detection available when no build target is injected', () => {
    ;(window as any).electronAPI = {}
    ;(PlatformDetector as any)._platform = null

    expect(PlatformDetector.getPlatform()).toBe('electron')
    expect(PlatformDetector.getCapabilities().globalShortcuts).toBe(true)
  })

  it('disables external updates and direct iCloud access in Mac App Store builds', () => {
    ;(window as any).electronAPI = { app: { isMacAppStore: true } }
    ;(PlatformDetector as any)._platform = null

    const capabilities = PlatformDetector.getCapabilities()
    expect(capabilities.electronUpdates).toBe(false)
    expect(capabilities.icloud).toBe(false)
    expect(capabilities.webdavSync).toBe(true)
  })

  it('keeps native mobile shells separate from Web', () => {
    ;(window as any).Capacitor = { getPlatform: () => 'ios' }
    ;(PlatformDetector as any)._platform = null

    expect(PlatformDetector.getPlatform()).toBe('ios')
    expect(PlatformDetector.getShell()).toBe('mobile')
    expect(PlatformDetector.getCapabilities().icloud).toBe(true)
  })
})
