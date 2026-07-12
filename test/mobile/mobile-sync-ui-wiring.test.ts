import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('mobile sync and restore UI wiring', () => {
  it('refreshes visible prompt data from database change events after a remote apply', () => {
    const source = read('src/renderer/pages/mobile/MobilePromptPage.vue')
    expect(source).toContain("onDataChange(['prompts', 'categories', 'ai_configs'], scheduleRealtimeRefresh)")
    expect(source).toContain('runRealtimeRefresh(false)')
  })

  it('does not rely on a full page reload after local or cloud restore', () => {
    const cloudPage = read('src/renderer/pages/mobile/MobileCloudBackupPage.vue')
    const settingsPage = read('src/renderer/pages/mobile/MobileSettingsPage.vue')
    expect(cloudPage).not.toContain('window.location.reload()')
    expect(settingsPage).not.toContain('window.location.reload()')
    expect(cloudPage).toContain('publishRestoredDataToCloud')
    expect(cloudPage).toContain('resumeRestoreWithMerge')
  })
})
