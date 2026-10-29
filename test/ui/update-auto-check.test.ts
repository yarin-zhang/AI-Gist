import { createApp, defineComponent, h, nextTick } from 'vue'
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 同步状态指示器会连带初始化整套同步服务，这里只关心更新按钮
vi.mock('~/components/common/CloudSyncStatusIndicator.vue', () => ({
  default: defineComponent({ render: () => null })
}))

const RELEASE_URL = 'https://github.com/yarin-zhang/AI-Gist/releases/tag/v9.0.0'

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v9.0.0', name: '9.0.0', body: '', html_url: RELEASE_URL, published_at: '2026-10-28T00:00:00Z',
  prerelease: false, draft: false, ...overrides,
})
const respond = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body })

// 检查结果放在模块里，每个用例重新加载一份，互不影响
async function loadUpdate() {
  vi.resetModules()
  return import('../../src/renderer/composables/useUpdate')
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function focusWindow() {
  window.dispatchEvent(new Event('focus'))
}

describe('自动检查更新', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let prefs: { checkUpdates: boolean }
  let openExternal: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => respond(release()))
    vi.stubGlobal('fetch', fetchMock)
    prefs = { checkUpdates: true }
    openExternal = vi.fn(async () => ({ success: true }))
    ;(window as any).electronAPI = {
      app: { getVersion: async () => '3.1.0' },
      preferences: { get: async () => prefs },
      shell: { openExternal },
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as any).electronAPI
  })

  it('启动后等一会儿才检查，窗口刚获得焦点不提前查；查到的结果状态栏和关于页共用', async () => {
    const { startAutoUpdateCheck, useUpdate, AUTO_CHECK_DELAY } = await loadUpdate()
    const stop = startAutoUpdateCheck()

    focusWindow()
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY - 1)
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const statusBar = useUpdate()
    const about = useUpdate()
    expect(statusBar.hasUpdate.value).toBe(true)
    expect(about.latestVersion.value).toBe('v9.0.0')
    expect(about.downloadUrl.value).toBe(RELEASE_URL)
    stop()
  })

  it('一天之内切回窗口不再请求，过了一天才再查', async () => {
    const { startAutoUpdateCheck, AUTO_CHECK_DELAY, AUTO_CHECK_INTERVAL } = await loadUpdate()
    const stop = startAutoUpdateCheck()
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(AUTO_CHECK_INTERVAL / 6)
      focusWindow()
      await flush()
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(AUTO_CHECK_INTERVAL / 6)
    focusWindow()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    stop()
  })

  it('断网时不在关于页显示失败，一小时后切回窗口再试', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { startAutoUpdateCheck, useUpdate, AUTO_CHECK_DELAY, AUTO_CHECK_RETRY_INTERVAL } = await loadUpdate()
    const stop = startAutoUpdateCheck()
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY)
    await flush()

    const update = useUpdate()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(update.checkFailed.value).toBe(false)
    expect(update.hasUpdate.value).toBe(false)

    await vi.advanceTimersByTimeAsync(AUTO_CHECK_RETRY_INTERVAL)
    focusWindow()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(update.hasUpdate.value).toBe(true)
    stop()
  })

  it('关掉自动检查后不请求，重新打开后切回窗口时再查', async () => {
    prefs.checkUpdates = false
    const { startAutoUpdateCheck, AUTO_CHECK_DELAY, AUTO_CHECK_RETRY_INTERVAL } = await loadUpdate()
    const stop = startAutoUpdateCheck()
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY)
    await flush()
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_RETRY_INTERVAL)
    focusWindow()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()

    prefs.checkUpdates = true
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_RETRY_INTERVAL)
    focusWindow()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stop()
  })

  it('Mac App Store 版和 Web 端不检查', async () => {
    ;(window as any).electronAPI.app.isMacAppStore = true
    let module = await loadUpdate()
    let stop = module.startAutoUpdateCheck()
    await vi.advanceTimersByTimeAsync(module.AUTO_CHECK_DELAY)
    await flush()
    stop()

    delete (window as any).electronAPI
    module = await loadUpdate()
    stop = module.startAutoUpdateCheck()
    await vi.advanceTimersByTimeAsync(module.AUTO_CHECK_DELAY)
    await flush()
    stop()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('只有手动检查失败才在关于页提示，之后检查成功会清掉提示', async () => {
    const { useUpdate } = await loadUpdate()
    const update = useUpdate()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await update.checkForUpdates({ silent: true })
    expect(update.checkFailed.value).toBe(false)

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await update.checkForUpdates()
    expect(update.checkFailed.value).toBe(true)

    await update.checkForUpdates({ silent: true })
    expect(update.checkFailed.value).toBe(false)
  })

  describe('状态栏', () => {
    let app: ReturnType<typeof createApp> | undefined
    let container: HTMLDivElement | undefined

    afterEach(() => {
      app?.unmount()
      container?.remove()
      app = undefined
      container = undefined
    })

    async function mountStatusBar() {
      const { useUpdate } = await loadUpdate()
      const { default: i18n } = await import('../../src/renderer/i18n')
      const { default: AppStatusBar } = await import('../../src/renderer/components/layout/AppStatusBar.vue')
      i18n.global.locale.value = 'zh-CN'
      container = document.createElement('div')
      document.body.appendChild(container)
      app = createApp(defineComponent({
        setup: () => () => h(NConfigProvider, null, {
          default: () => h(NMessageProvider, null, { default: () => h(AppStatusBar) })
        })
      }))
      app.use(i18n)
      app.mount(container)
      await flush()
      return { root: container, update: useUpdate() }
    }

    it('没有新版本时只显示当前版本', async () => {
      fetchMock.mockResolvedValueOnce(respond(release({ tag_name: 'v3.1.0' })))
      const { root, update } = await mountStatusBar()
      await update.checkForUpdates({ silent: true })
      await nextTick()

      expect(root.querySelector('.app-status-bar__update')).toBeNull()
      expect(root.querySelector('.app-status-bar__version')?.textContent).toBe('v3.1.0')
    })

    it('有新版本时显示提示按钮，点一下打开这个版本的 Release 页', async () => {
      const { root, update } = await mountStatusBar()
      await update.checkForUpdates({ silent: true })
      await nextTick()

      const button = root.querySelector<HTMLButtonElement>('button.app-status-bar__update')
      expect(button?.textContent?.trim()).toBe('新版本 v9.0.0')
      button!.click()
      await flush()
      expect(openExternal).toHaveBeenCalledWith(RELEASE_URL)
    })

    it('拿不到具体版本的地址时打开最新版本的 Release 页', async () => {
      fetchMock.mockResolvedValueOnce(respond(release({ html_url: '' })))
      const { root, update } = await mountStatusBar()
      await update.checkForUpdates({ silent: true })
      await nextTick()

      root.querySelector<HTMLButtonElement>('button.app-status-bar__update')!.click()
      await flush()
      expect(openExternal).toHaveBeenCalledWith('https://github.com/yarin-zhang/AI-Gist/releases/latest')
    })
  })
})
