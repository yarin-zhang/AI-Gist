import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { PromptService } from '../../src/renderer/lib/services/prompt.service'
import { CategoryService } from '../../src/renderer/lib/services/category.service'
import { CliBridgeError, dispatchCliBridgeAction } from '../../src/renderer/lib/services/cli-bridge-executor.service'

describe('cli-bridge-executor whitelist actions', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
    // PromptService/CategoryService 是模块级单例，一旦初始化就会绑定到当时的 indexedDB 连接；
    // 这里重置私有静态字段，确保每个测试都拿到绑定到全新 IDBFactory 的实例。
    ;(PromptService as any).instance = undefined
    ;(CategoryService as any).instance = undefined
  })

  it('responds to system.ping', async () => {
    await expect(dispatchCliBridgeAction('system.ping', {})).resolves.toEqual({ ok: true })
  })

  it('rejects unknown actions with a CliBridgeError', async () => {
    await expect(dispatchCliBridgeAction('prompt.explode', {})).rejects.toMatchObject({
      code: 'UNKNOWN_ACTION',
    })
  })

  it('creates and reads back a prompt by numeric id and by UUID', async () => {
    const created = await dispatchCliBridgeAction('prompt.create', {
      title: 'Release notes',
      content: 'Summarize {{topic}} for {{audience}}.',
      tags: ['writing'],
    })
    expect(created.id).toBeTypeOf('number')
    expect(created.uuid).toBeTypeOf('string')

    const byId = await dispatchCliBridgeAction('prompt.get', { ref: String(created.id) })
    expect(byId.title).toBe('Release notes')

    const byUuid = await dispatchCliBridgeAction('prompt.get', { ref: created.uuid })
    expect(byUuid.id).toBe(created.id)
  })

  it('throws NOT_FOUND for a missing prompt reference', async () => {
    await expect(dispatchCliBridgeAction('prompt.get', { ref: '999999' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('resolves a category by name when creating a prompt ("categoryRef")', async () => {
    const category = await dispatchCliBridgeAction('category.create', { name: 'Marketing' })

    const prompt = await dispatchCliBridgeAction('prompt.create', {
      title: 'Campaign brief',
      content: 'Draft a brief for {{campaign}}.',
      categoryRef: 'Marketing',
    })

    expect(prompt.categoryId).toBe(category.id)

    const filtered = await dispatchCliBridgeAction('prompt.list', { categoryRef: 'Marketing' })
    expect(filtered.data.map((p: any) => p.id)).toContain(prompt.id)
  })

  it('"挖空": prompt.variable.sync auto-creates stubs for undefined {{name}} placeholders only', async () => {
    const prompt = await dispatchCliBridgeAction('prompt.create', {
      title: 'Templated prompt',
      content: 'Hello {{name}}, welcome to {{place}}.',
    })

    await dispatchCliBridgeAction('prompt.variable.add', {
      ref: String(prompt.id),
      name: 'name',
      type: 'text',
    })

    const syncResult = await dispatchCliBridgeAction('prompt.variable.sync', { ref: String(prompt.id) })
    expect(syncResult.created.map((v: any) => v.name)).toEqual(['place'])

    const variables = await dispatchCliBridgeAction('prompt.variable.list', { ref: String(prompt.id) })
    expect(variables.map((v: any) => v.name).sort()).toEqual(['name', 'place'])

    // 再次同步不应该重复创建
    const secondSync = await dispatchCliBridgeAction('prompt.variable.sync', { ref: String(prompt.id) })
    expect(secondSync.created).toEqual([])
  })

  it('fills a prompt with variable values and increments useCount', async () => {
    const prompt = await dispatchCliBridgeAction('prompt.create', {
      title: 'Greeting',
      content: 'Hello {{name}}!',
    })

    const filled = await dispatchCliBridgeAction('prompt.fill', {
      ref: String(prompt.id),
      variables: { name: 'World' },
    })
    expect(filled.filledContent).toBe('Hello World!')

    const refreshed = await dispatchCliBridgeAction('prompt.get', { ref: String(prompt.id) })
    expect(refreshed.useCount).toBe(1)
  })

  it('removes a variable by name and rejects removing an unknown one', async () => {
    const prompt = await dispatchCliBridgeAction('prompt.create', {
      title: 'Has a variable',
      content: '{{foo}}',
    })
    await dispatchCliBridgeAction('prompt.variable.add', { ref: String(prompt.id), name: 'foo' })

    await dispatchCliBridgeAction('prompt.variable.remove', { ref: String(prompt.id), name: 'foo' })
    expect(await dispatchCliBridgeAction('prompt.variable.list', { ref: String(prompt.id) })).toEqual([])

    await expect(
      dispatchCliBridgeAction('prompt.variable.remove', { ref: String(prompt.id), name: 'missing' })
    ).rejects.toBeInstanceOf(CliBridgeError)
  })

  it('deletes a prompt', async () => {
    const prompt = await dispatchCliBridgeAction('prompt.create', { title: 'Temp', content: 'x' })
    await dispatchCliBridgeAction('prompt.delete', { ref: String(prompt.id) })
    await expect(dispatchCliBridgeAction('prompt.get', { ref: String(prompt.id) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
