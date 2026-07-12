import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('prompt realtime sync details', () => {
  it('centers the compact create icon without retaining the hidden label gap', () => {
    const page = readRendererFile('pages/PromptManagementPage.vue')

    expect(page).toMatch(/@media \(max-width: 1120px\)[\s\S]*?\.page-actions :deep\(\.n-button\)\s*\{[^}]*width:\s*32px[^}]*padding:\s*0/s)
    expect(page).toMatch(/\.page-actions :deep\(\.n-button__icon\)\s*\{[^}]*margin:\s*0/s)
  })

  it('refreshes workspace and legacy views from committed database change events', () => {
    const page = readRendererFile('pages/PromptManagementPage.vue')
    const list = readRendererFile('components/prompt-management/PromptList.vue')

    for (const source of [page, list]) {
      expect(source).toContain("import { onDataChange } from '@/lib/services/data-change-events'")
      expect(source).toContain("['prompts', 'categories', 'promptVariables']")
    }
    expect(page).toContain('workspaceRefreshPending')
    expect(list).toContain('realtimeRefreshPending')
    expect(page).toContain('reconcileSelection()')
    expect(list).toContain('await runRealtimeRefresh(true)')
    expect(list).toContain('await loadPrompts(true, showLoading)')
  })

  it('keeps a previous successful sync green while only a routine check is scheduled', () => {
    const indicator = readRendererFile('components/common/CloudSyncStatusIndicator.vue')
    const pendingScheduled = indicator.indexOf("status.value.status === 'scheduled' && status.value.pendingChanges")
    const priorSuccess = indicator.indexOf('status.value.lastResult?.success || status.value.lastSyncAt')
    const routineScheduled = indicator.indexOf("status.value.status === 'scheduled') return 'scheduled'", priorSuccess)

    expect(indicator).toContain('CircleCheck')
    expect(pendingScheduled).toBeGreaterThan(-1)
    expect(priorSuccess).toBeGreaterThan(pendingScheduled)
    expect(routineScheduled).toBeGreaterThan(priorSuccess)
  })
})
