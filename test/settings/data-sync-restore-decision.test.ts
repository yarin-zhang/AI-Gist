/**
 * 桌面端从备份恢复后同步会停下来，等用户选择覆盖云端还是与云端合并。
 * 之前只有移动端能选，桌面端的状态卡片和状态栏照样显示「已同步」，同步就一直悄悄停着。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('desktop restore decision', () => {
  it('lets the user choose on the data sync status card instead of offering a sync that cannot run', () => {
    const source = read('src/renderer/components/settings/DataSyncSettings.vue')
    const card = source.slice(source.indexOf('<section class="ui-panel sync-status"'), source.indexOf('</section>'))

    expect(card).toContain(`v-if="dataSyncStatusKind === 'restorePaused'"`)
    expect(card).toContain("t('cloudBackup.overwriteCloud')")
    expect(card).toContain("t('cloudBackup.mergeWithCloud')")
    // 「立即同步」在另一个分支里，等选择时不显示
    expect(card.indexOf("t('dataSync.syncNow')")).toBeGreaterThan(card.indexOf('v-else-if='))

    expect(source).toContain("case 'restorePaused': return t('dataSync.diagnosis.restoreDecision.title');")
    expect(source).toContain("case 'restorePaused': return t('cloudBackup.restoreDecisionDescription');")
    expect(source).toContain('cloudSyncService.resumeRestoreWithMerge(storageId, options)')
    expect(source).toContain('cloudSyncService.publishRestoredDataToCloud(storageId, options)')
    // 覆盖云端要先确认，确认按钮是红色的
    expect(source).toMatch(/const confirmRestoreOverwrite = \(\) => \{\s*dialog\.warning\(\{[\s\S]*?positiveButtonProps: \{ type: 'error' \}/)
    // 还在等选择的存储，菜单里的「立即同步」和错误详情里的「重新同步」都不可用
    expect(source).toContain('disabled: !config.enabled || isAwaitingRestoreDecision(config.id)')
    expect(source).toContain('v-if="!isAwaitingRestoreDecision(syncErrorStorageId)"')
  })

  it('shows the waiting state in the status bar, which opens data sync settings', () => {
    const source = read('src/renderer/components/common/CloudSyncStatusIndicator.vue')
    expect(source).toContain("case 'restorePaused': return 'restorePaused';")
    expect(source).toContain("t('dataSync.indicatorShortRestorePaused')")
    expect(source).toContain("case 'restorePaused': return t('cloudBackup.restoreDecisionDescription');")
  })

  it('explains the choice right after restoring a local backup', () => {
    const source = read('src/renderer/components/settings/DataManagementSettings.vue')
    const handler = source.slice(source.indexOf('const handleRestoreBackup'), source.indexOf('const handleDeleteBackup'))
    expect(handler).toContain('cloudSyncService.getPendingRestoreDecisions().length > 0')
    expect(handler).toContain("title: t('cloudBackup.restoreDecisionTitle')")
    expect(handler).toContain("emit('navigate-section', 'cloud-backup')")
  })

  it('has the status bar text in every locale', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']) {
      const messages = JSON.parse(read(`src/renderer/i18n/locales/${locale}.json`))
      expect(messages.dataSync.indicatorShortRestorePaused, locale).toBeTruthy()
    }
  })
})
