import { describe, expect, it, vi } from 'vitest'
import { openShellPath } from '../../src/main/electron/shell-operation-result'

describe('Electron shell operation result', () => {
  it('treats Electron openPath empty-string result as success', async () => {
    const openPath = vi.fn().mockResolvedValue('')

    await expect(openShellPath('C:\\AI Gist\\backups', openPath)).resolves.toEqual({ success: true })
    expect(openPath).toHaveBeenCalledWith('C:\\AI Gist\\backups')
  })

  it('preserves Electron openPath error text as a failure', async () => {
    const openPath = vi.fn().mockResolvedValue('Access denied')

    await expect(openShellPath('C:\\AI Gist\\backups', openPath)).resolves.toEqual({
      success: false,
      error: 'Access denied'
    })
  })
})
