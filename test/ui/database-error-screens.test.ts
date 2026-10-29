// 数据库打不开时的启动页和横幅：以前直接显示「[DATABASE_OPEN_FAILED] 无法打开数据库 AIGistDB v12: …」
// 这类原始报错。现在只说用户能做的事（重试 / 重启，或者关掉占着旧连接的其他窗口），
// 原始报错折叠在「技术详情」里。另外，单次数据库操作失败不能再把整个应用标成「数据没能加载」。

import { createApp, defineComponent, h, nextTick } from 'vue'
import { NConfigProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/renderer/i18n'
import { classifyDatabaseError, describeDatabaseError } from '../../src/renderer/lib/utils/database-error'

const dbMock = vi.hoisted(() => ({
  waitForInitialization: vi.fn<() => Promise<void>>(),
}))

vi.mock('../../src/renderer/lib/db', () => ({
  databaseService: { waitForInitialization: () => dbMock.waitForInitialization() },
}))

const OPEN_FAILED = '[DATABASE_OPEN_FAILED] 无法打开数据库 AIGistDB v12: [DATABASE_STORE_KEY_PATH_MISMATCH] categories 主键路径错误'
const UPGRADE_BLOCKED = '[DATABASE_UPGRADE_BLOCKED] 数据库 AIGistDB 从版本 11 升级到 12 被其他窗口或旧连接阻塞，请关闭其他应用窗口后重试'

const translate = (key: string) => (i18n.global.t as (key: string) => string)(key)

describe('database error classification', () => {
  it('only treats a blocked upgrade as "close other windows"', () => {
    expect(classifyDatabaseError(new Error(UPGRADE_BLOCKED))).toEqual({ kind: 'upgrade-blocked', detail: UPGRADE_BLOCKED })
    expect(classifyDatabaseError(new Error(OPEN_FAILED))).toEqual({ kind: 'unavailable', detail: OPEN_FAILED })
    expect(classifyDatabaseError('boom').kind).toBe('unavailable')
  })

  it('tells the user what to do in plain words', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(describeDatabaseError(classifyDatabaseError(new Error(OPEN_FAILED)), translate))
      .toBe('点「重试」；还不行就重启 AI Gist。')
    expect(describeDatabaseError(classifyDatabaseError(new Error(UPGRADE_BLOCKED)), translate))
      .toContain('关掉它们后点「重试」')

    i18n.global.locale.value = 'en-US'
    expect(describeDatabaseError(classifyDatabaseError(new Error(OPEN_FAILED)), translate))
      .toBe("Click “Retry”. If that doesn't help, restart AI Gist.")
    i18n.global.locale.value = 'zh-CN'
  })
})

describe('database error screens', () => {
  let app: ReturnType<typeof createApp> | undefined
  let container: HTMLDivElement | undefined

  const mount = async (component: unknown) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, null, { default: () => h(component as never, null, { default: () => h('main', 'app') }) }),
    }))
    app.use(i18n)
    i18n.global.locale.value = 'zh-CN'
    app.mount(container)
    for (let i = 0; i < 5; i += 1) await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    return container
  }

  const visibleText = (root: HTMLElement) => {
    const clone = root.cloneNode(true) as HTMLElement
    clone.querySelectorAll('details').forEach(details => details.remove())
    return clone.textContent || ''
  }

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    app?.unmount()
    container?.remove()
    app = undefined
    container = undefined
  })

  // 启动页在初始化结束后就会让位给应用本体（之后由横幅提示），所以这里先记下一次失败，
  // 再让启动页自己的初始化一直挂着，停在「失败」这一屏上检查文案。
  const showStartupFailure = async (message: string) => {
    dbMock.waitForInitialization.mockRejectedValueOnce(new Error(message))
    const { initDatabaseState } = await import('../../src/renderer/composables/useDatabase')
    await initDatabaseState()
    dbMock.waitForInitialization.mockReturnValue(new Promise(() => undefined))
    const { default: AppInitializer } = await import('../../src/renderer/components/common/AppInitializer.vue')
    return mount(AppInitializer)
  }

  it('shows plain wording on the startup screen and keeps the raw error collapsed', async () => {
    const root = await showStartupFailure(OPEN_FAILED)

    const text = visibleText(root)
    expect(text).toContain('数据没能加载')
    expect(text).toContain('点「重试」；还不行就重启 AI Gist。')
    expect(text).not.toMatch(/DATABASE_|IndexedDB|无法打开数据库|数据库没有打开/)

    const details = root.querySelector('details')
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(OPEN_FAILED)
  })

  it('asks to close other windows when another connection blocks the upgrade', async () => {
    const root = await showStartupFailure(UPGRADE_BLOCKED)

    const text = visibleText(root)
    expect(text).toContain('AI Gist 还在其他窗口或浏览器标签页里开着。关掉它们后点「重试」。')
    expect(text).not.toContain('DATABASE_UPGRADE_BLOCKED')
  })

  it('banner uses the same plain wording', async () => {
    dbMock.waitForInitialization.mockRejectedValue(new Error(OPEN_FAILED))
    const { initDatabaseState } = await import('../../src/renderer/composables/useDatabase')
    await initDatabaseState()
    const { default: DatabaseStatusBanner } = await import('../../src/renderer/components/common/DatabaseStatusBanner.vue')
    const root = await mount(DatabaseStatusBanner)

    const text = visibleText(root)
    expect(text).toContain('数据没能加载')
    expect(text).not.toMatch(/DATABASE_|数据库连接异常/)
    expect(root.querySelector('details')?.textContent).toContain(OPEN_FAILED)
  })

  it('does not raise the global banner when a single operation fails on a healthy database', async () => {
    dbMock.waitForInitialization.mockResolvedValue(undefined)
    const { useDatabase } = await import('../../src/renderer/composables/useDatabase')
    const { safeDbOperation, databaseError } = useDatabase()

    const result = await safeDbOperation(() => Promise.reject(new Error('ConstraintError: Key already exists')), 'fallback')

    expect(result).toBe('fallback')
    expect(databaseError.value).toBeNull()
  })

  it('still raises the banner when the database itself cannot open', async () => {
    dbMock.waitForInitialization.mockRejectedValue(new Error(OPEN_FAILED))
    const { useDatabase } = await import('../../src/renderer/composables/useDatabase')
    const { safeDbOperation, databaseError } = useDatabase()
    const operation = vi.fn(async () => 'value')

    expect(await safeDbOperation(operation, 'fallback')).toBe('fallback')
    expect(operation).not.toHaveBeenCalled()
    expect(databaseError.value).toEqual({ kind: 'unavailable', detail: OPEN_FAILED })
  })
})
