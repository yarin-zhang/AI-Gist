import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformDetector } from '@shared/platform'
import { DataManagementAPI } from '../../src/renderer/lib/api/data-management.api'

describe('DataManagementAPI Web file fallback', () => {
  beforeEach(() => {
    ;(PlatformDetector as any)._platform = null
    ;(window as any).electronAPI = undefined
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn()
    })
  })

  it('uses a browser download token when Electron save dialogs are unavailable', async () => {
    const filePath = await DataManagementAPI.selectExportPath('ai-gist-export.json')
    expect(filePath).toBe('web-download:ai-gist-export.json')
  })

  it('downloads JSON content from Web export tokens', async () => {
    const click = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { value: click })
      }
      return element
    })

    const result = await DataManagementAPI.exportDataToFile(
      { categories: [], prompts: [], aiConfigs: [] },
      'web-download:ai-gist-export.json',
      'json'
    )

    expect(result).toBe(true)
    expect(click).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})


describe('DataManagementAPI Web import picker', () => {
  beforeEach(() => {
    ;(PlatformDetector as any)._platform = null
    ;(window as any).electronAPI = undefined
  })

  it('settles with null when the user cancels the file picker instead of leaving the button spinning (#441)', async () => {
    let picker: HTMLInputElement | undefined
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'input') {
        picker = element as HTMLInputElement
        Object.defineProperty(element, 'click', { value: vi.fn() })
      }
      return element
    })

    const selection = DataManagementAPI.selectImportFile('json')
    picker?.dispatchEvent(new Event('cancel'))

    await expect(selection).resolves.toBeNull()
    vi.restoreAllMocks()
  })

  it('reports a cancelled import without an error message', async () => {
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'input') {
        Object.defineProperty(element, 'click', { value: () => element.dispatchEvent(new Event('cancel')) })
      }
      return element
    })

    const result = await DataManagementAPI.importFullBackup()

    expect(result).toMatchObject({ success: false, cancelled: true, errorCode: 'cancelled' })
    vi.restoreAllMocks()
  })
})
