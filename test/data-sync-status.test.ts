import { describe, expect, it } from 'vitest'
import {
  resolveDataSyncAlertType,
  resolveDataSyncStatusKind,
  type DataSyncStatusInput,
} from '../src/renderer/lib/utils/data-sync-status'

// Base input representing the common "nothing unusual is going on" case; each test
// overrides only the fields relevant to the scenario under test.
const baseInput: DataSyncStatusInput = {
  hasScheduledRetry: false,
  isError: false,
  canAutoRetryError: false,
  autoSyncEnabled: true,
  isSyncing: false,
  pendingChanges: false,
  hasSucceededBefore: false,
  hasStorageConfigs: true,
}

describe('resolveDataSyncStatusKind + resolveDataSyncAlertType', () => {
  it('reproduces the reported bug scenario: a successful sync on one of several storages must not be reported as fully up to date', () => {
    // Multi-storage setup (e.g. WebDAV + iCloud both enabled): the user hits the newly
    // prominent "Sync Now" button on just one storage. That storage's sync succeeds
    // (status becomes 'success'), but other storages still have unsynced local changes,
    // so pendingChanges stays true. The banner must stay in the "pending" state -- not
    // silently promote itself to "current" -- or the user is misled into thinking
    // everything is synced when it is not.
    const input: DataSyncStatusInput = {
      ...baseInput,
      isSyncing: false,
      pendingChanges: true,
      hasSucceededBefore: true, // status === 'success' implies lastResult.success / lastSyncAt
    }

    const kind = resolveDataSyncStatusKind(input)
    const alertType = resolveDataSyncAlertType(kind, input.canAutoRetryError)

    expect(kind).toBe('pending')
    expect(alertType).toBe('info')
    // The core invariant the review flagged as blocking: title and color must never
    // disagree about whether sync is actually finished.
    expect(alertType).not.toBe('success')
  })

  it('reports success only once there are no pending local changes left', () => {
    const input: DataSyncStatusInput = {
      ...baseInput,
      pendingChanges: false,
      hasSucceededBefore: true,
    }
    expect(resolveDataSyncStatusKind(input)).toBe('current')
    expect(resolveDataSyncAlertType('current', input.canAutoRetryError)).toBe('success')
  })

  it('keeps a routine scheduled check green once a prior sync succeeded and nothing is pending', () => {
    // This is the item-4 regression this PR set out to fix: a routine auto-sync check
    // being scheduled (no unsynced local edits) must not force the banner back to info
    // once there is already a successful sync on record.
    const input: DataSyncStatusInput = {
      ...baseInput,
      pendingChanges: false,
      hasSucceededBefore: true,
    }
    const kind = resolveDataSyncStatusKind(input)
    expect(kind).toBe('current')
    expect(resolveDataSyncAlertType(kind, input.canAutoRetryError)).toBe('success')
  })

  it('prioritizes a scheduled auto-retry over everything else', () => {
    const input: DataSyncStatusInput = {
      ...baseInput,
      hasScheduledRetry: true,
      isError: true,
      pendingChanges: true,
      hasSucceededBefore: true,
    }
    expect(resolveDataSyncStatusKind(input)).toBe('retryScheduled')
    expect(resolveDataSyncAlertType('retryScheduled', input.canAutoRetryError)).toBe('warning')
  })

  it('splits error severity by whether the diagnosis says it can auto-retry', () => {
    const recoverable: DataSyncStatusInput = { ...baseInput, isError: true, canAutoRetryError: true }
    const fatal: DataSyncStatusInput = { ...baseInput, isError: true, canAutoRetryError: false }

    expect(resolveDataSyncStatusKind(recoverable)).toBe('error')
    expect(resolveDataSyncAlertType('error', true)).toBe('warning')

    expect(resolveDataSyncStatusKind(fatal)).toBe('error')
    expect(resolveDataSyncAlertType('error', false)).toBe('error')
  })

  it('shows paused warning whenever auto-sync is disabled, even with pending changes or a prior success', () => {
    const input: DataSyncStatusInput = {
      ...baseInput,
      autoSyncEnabled: false,
      pendingChanges: true,
      hasSucceededBefore: true,
    }
    expect(resolveDataSyncStatusKind(input)).toBe('paused')
    expect(resolveDataSyncAlertType('paused', input.canAutoRetryError)).toBe('warning')
  })

  it('shows syncing info while an active sync is in flight, regardless of pending changes', () => {
    const input: DataSyncStatusInput = {
      ...baseInput,
      isSyncing: true,
      pendingChanges: true,
    }
    expect(resolveDataSyncStatusKind(input)).toBe('syncing')
    expect(resolveDataSyncAlertType('syncing', input.canAutoRetryError)).toBe('info')
  })

  it('falls back to ready/notConfigured when nothing has ever synced', () => {
    const ready: DataSyncStatusInput = { ...baseInput, hasStorageConfigs: true }
    const notConfigured: DataSyncStatusInput = { ...baseInput, hasStorageConfigs: false }

    expect(resolveDataSyncStatusKind(ready)).toBe('ready')
    expect(resolveDataSyncAlertType('ready', ready.canAutoRetryError)).toBe('info')

    expect(resolveDataSyncStatusKind(notConfigured)).toBe('notConfigured')
    expect(resolveDataSyncAlertType('notConfigured', notConfigured.canAutoRetryError)).toBe('info')
  })

  it('never resolves an alert type of success for any kind other than current', () => {
    const nonCurrentKinds = ['retryScheduled', 'paused', 'syncing', 'pending', 'ready', 'notConfigured'] as const
    for (const kind of nonCurrentKinds) {
      expect(resolveDataSyncAlertType(kind, false)).not.toBe('success')
      expect(resolveDataSyncAlertType(kind, true)).not.toBe('success')
    }
  })
})
