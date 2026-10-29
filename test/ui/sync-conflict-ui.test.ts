import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8')

describe('sync conflict UI (V5-Conflict)', () => {
  it('mounts one conflict modal in the desktop shell and opens it from the status bar and sync settings', () => {
    const main = read('pages/MainPage.vue')
    const indicator = read('components/common/CloudSyncStatusIndicator.vue')
    const settings = read('components/settings/DataSyncSettings.vue')

    expect(main).toContain('<SyncConflictModal />')
    expect(indicator).toContain("if (status.value.status === 'conflict')")
    expect(indicator).toContain('syncConflict.open(status.value.storageId)')
    expect(settings).toContain('@click="syncConflict.open(syncStatus.storageId)"')
    expect(settings).toContain('resolveDataSyncStatusKind(createDataSyncStatusInput(syncStatus.value, {')
    expect(read('lib/utils/data-sync-status.ts')).toContain("hasPendingConflict: snapshot.status === 'conflict'")
    expect(settings).toContain("if (result.action === 'conflict-pending')")
  })

  it('offers the four strategies with smart merge preselected and blocks incomplete manual choices', () => {
    const modal = read('components/sync/SyncConflictModal.vue')

    expect(modal).toContain('width="var(--overlay-width-wizard)"')
    expect(modal).toContain("strategy.value = 'smart'")
    for (const strategy of ['local', 'remote', 'smart', 'manual']) {
      expect(modal).toContain(`value: '${strategy}' as const`)
    }
    expect(modal).toContain(":disabled=\"!pending || (strategy === 'manual' && missingCount > 0)\"")
    expect(modal).toContain('cloudSyncService.resolveConflicts(pending.value.storageId')
    expect(modal).toContain("if (result.action === 'conflict-pending')")
  })

  it('lets each manual row expand into a side-by-side preview of both versions (#447)', () => {
    const modal = read('components/sync/SyncConflictModal.vue')

    expect(modal).toContain('@click="toggleExpanded(item.id)"')
    expect(modal).toContain(':aria-expanded="!!expanded[item.id]"')
    expect(modal).toContain('v-for="side in comparisonSides(item)"')
    expect(modal).toContain('local: item.localPreview,')
    expect(modal).toContain('remote: item.remotePreview,')
    // 统计写成完整短句，不再用「+」「~」符号
    const zhCN = JSON.parse(readFileSync('src/renderer/i18n/locales/zh-CN.json', 'utf8'))
    expect(zhCN.syncConflict.added).not.toMatch(/^[+~]/)
    expect(zhCN.syncConflict.updated).not.toMatch(/^[+~]/)
    expect(zhCN.syncConflict.useRemote).toContain('云端')
  })

  it('ships a mobile conflict sheet with the same decisions', () => {
    const sheet = read('components/mobile/settings/SyncConflictSheet.vue')

    expect(sheet).toContain('class="m-sheet-modal"')
    expect(sheet).toContain('cloudSyncService.resolveConflicts(pending.value.storageId')
    expect(sheet).toContain("strategy.value = 'smart'")

    const syncPage = read('pages/mobile/settings/MobileDataSyncPage.vue')
    expect(syncPage).toContain('<SyncConflictSheet :is-open="conflictSheetOpen"')
    expect(syncPage).toContain("if (consumeConflictSheetRequest() && syncStatus.value.status === 'conflict') openConflictSheet()")
  })

  it('writes the stats as full sentences, shows seconds and the newer side on both platforms (#489)', () => {
    const modal = read('components/sync/SyncConflictModal.vue')
    const sheet = read('components/mobile/settings/SyncConflictSheet.vue')

    for (const source of [modal, sheet]) {
      // 统计按单复数写成完整句子
      expect(source).toContain("t('syncConflict.deleted', { count: pending.summary.deleted }, pending.summary.deleted)")
      expect(source).toContain("t('syncConflict.added', { count: pending.summary.added }, pending.summary.added)")
      // 两边时间共用同一套规则：同一分钟内到秒，标出较新的一边，删除的一边写删除时间
      expect(source).toContain('describeConflictVersionTimes(item, String(locale.value))')
      expect(source).toContain("t('syncConflict.newer')")
      expect(source).toContain("t('syncConflict.deletedAtTime', { time })")
      expect(source).not.toContain('formatFriendlyDate')
    }

    const zhCN = JSON.parse(readFileSync('src/renderer/i18n/locales/zh-CN.json', 'utf8'))
    expect(zhCN.syncConflict.deleted).toBe('云端删除了 {count} 条')
    expect(zhCN.syncConflict.added).toBe('云端新增了 {count} 条')
    const enUS = JSON.parse(readFileSync('src/renderer/i18n/locales/en-US.json', 'utf8'))
    expect(enUS.syncConflict.deleted).toContain(' | ')
  })

  it('tells the deleting device that a record came back, on desktop and mobile (#489)', () => {
    const indicator = read('components/common/CloudSyncStatusIndicator.vue')
    const mobileShell = read('pages/MobileMainPage.vue')
    const mobileStatus = read('pages/mobile/settings/shared.ts')

    expect(indicator).toContain('useCloudSyncResultNotices(messages => messages.forEach(text => message.info(text)))')
    expect(indicator).toContain('getCloudSyncRecordChangeMessages(status.value.lastResult)')
    expect(mobileShell).toContain('useCloudSyncResultNotices(messages => {')
    expect(mobileStatus).toContain('getCloudSyncRecordChangeMessages(status.lastResult)')
  })

  it('removes the unused legacy conflict dialog', () => {
    expect(existsSync('src/renderer/components/settings/ConflictResolutionDialog.vue')).toBe(false)
  })
})
