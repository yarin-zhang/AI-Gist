import { describe, expect, it } from 'vitest'
import { dataOperationLock } from '~/lib/services/data-operation-lock'

describe('data operation lock', () => {
  it('serializes backup reads and restore writes', async () => {
    const events: string[] = []
    let releaseRead!: () => void
    let notifyReadStarted!: () => void
    const readStarted = new Promise<void>(resolve => { notifyReadStarted = resolve })
    const readGate = new Promise<void>(resolve => { releaseRead = resolve })

    const backupRead = dataOperationLock.runExclusive(async () => {
      events.push('read-start')
      notifyReadStarted()
      await readGate
      events.push('read-end')
    })
    await readStarted
    const restoreWrite = dataOperationLock.runExclusive(async () => {
      events.push('write-start')
      events.push('write-end')
    })

    await Promise.resolve()
    expect(events).toEqual(['read-start'])
    releaseRead()
    await Promise.all([backupRead, restoreWrite])
    expect(events).toEqual(['read-start', 'read-end', 'write-start', 'write-end'])
  })
})
