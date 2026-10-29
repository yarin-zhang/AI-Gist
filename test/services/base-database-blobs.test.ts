/**
 * iOS（WebKit）的 IndexedDB：从库里读出的图片 Blob 原样写回后，约半秒内读不出来（NotFoundError），再写也会失败。
 * 写回带图记录前先把图片换成内存里的副本。WebKit 的问题只能在 iOS 上复现，这里核对换副本这一步本身。
 */
import { describe, expect, it } from 'vitest'
import { BaseDatabaseService } from '../../src/renderer/lib/services/base-database.service'

class BlobHelpers extends BaseDatabaseService {
  detach<T>(value: T) { return this.detachStoredBlobs(value) }
  merge<T extends Record<string, any>>(current: T, detached: Partial<T> | null) { return this.withDetachedBlobs(current, detached) }
}

const bytesOf = (blob: Blob) => new Promise<number[]>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer)))
  reader.onerror = reject
  reader.readAsArrayBuffer(blob)
})
const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
const jpg = () => new Blob([new Uint8Array([4, 5])], { type: 'image/jpeg' })

describe('写回带图片的记录', () => {
  const helpers = new BlobHelpers()

  it('图片换成新的 Blob，内容、类型和其他字段都不变', async () => {
    const stored = { id: 1, title: '海报', updatedAt: new Date('2026-10-29T00:00:00Z'), imageBlobs: [png(), jpg()] }

    const detached = await helpers.detach(stored)

    expect(detached.imageBlobs[0]).not.toBe(stored.imageBlobs[0])
    expect(detached.imageBlobs.map(blob => blob.type)).toEqual(['image/png', 'image/jpeg'])
    expect(await Promise.all(detached.imageBlobs.map(bytesOf))).toEqual([[1, 2, 3], [4, 5]])
    expect(detached).toMatchObject({ id: 1, title: '海报', updatedAt: stored.updatedAt })
  })

  it('没有图片的数据原样返回', async () => {
    const record = { id: 2, title: '纯文字', tags: ['a'] }
    expect(await helpers.detach(record)).toBe(record)
    expect(await helpers.detach(null)).toBeNull()
  })

  it('写回时用准备好的副本；期间图片被改过（类型、大小对不上）就保留库里当前的', () => {
    const current = { id: 1, content: '正文', imageBlobs: [png(), jpg()] }
    const sameImages = { id: 1, imageBlobs: [png(), jpg()] }
    const otherImages = { id: 1, imageBlobs: [new Blob([new Uint8Array([9])], { type: 'image/gif' })] }

    expect(helpers.merge(current, sameImages).imageBlobs).toBe(sameImages.imageBlobs)
    expect(helpers.merge(current, otherImages).imageBlobs).toBe(current.imageBlobs)
    expect(helpers.merge(current, null)).toBe(current)
    expect(helpers.merge(current, sameImages).content).toBe('正文')
  })
})
