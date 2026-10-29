import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptWithRelations } from '@shared/types/database'
import i18n from '@/i18n'
import { classifyAIError, describeAIError, extractAIErrorDetail } from '@/lib/utils/ai-error'
import { describeTemplateError, readTemplateErrorLine, renderPrompt } from '@/lib/utils/prompt-template'
import { useUpdate } from '@/composables/useUpdate'

// 「暴露给用户的，一定是可以被用户自主解决的」：AI 生成、模板渲染、模型配置保存和检查更新的提示
// 只说用户能处理的事，原始报错（服务商 JSON、Nunjucks 内部信息、数据库报错、GitHub 状态码）不进界面

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const
type Locale = typeof LOCALES[number]
const HAN = /[一-鿿]/
const read = (path: string) => readFileSync(path, 'utf8')
const locale = (code: string) => JSON.parse(read(`src/renderer/i18n/locales/${code}.json`))
const lookup = (messages: Record<string, unknown>, key: string): unknown => key.split('.')
  .reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), messages)
const t = (key: string, named?: Record<string, unknown>, plural?: number) => (
  plural === undefined ? (i18n.global.t as any)(key, named ?? {}) : (i18n.global.t as any)(key, named ?? {}, plural)
) as string
const withLocale = <T>(code: Locale, run: () => T): T => {
  i18n.global.locale.value = code
  try { return run() } finally { i18n.global.locale.value = 'zh-CN' }
}

describe('AI 生成失败只说原因，服务商原文留在技术详情', () => {
  const wrapped = 'Error invoking remote method \'ai:generate-prompt-stream\': Error: 生成失败: 生成失败: 401 {"error":{"message":"Incorrect API key provided: sk-test-1234567890abcdef"}}'

  it('去掉 Electron IPC 和主进程叠加的「生成失败:」包装后再归类', () => {
    expect(classifyAIError(wrapped)).toBe('auth')
    const detail = extractAIErrorDetail(wrapped)
    expect(detail).toBe('401 Incorrect API key provided: sk-****')
    expect(detail).not.toContain('生成失败')
    expect(detail).not.toContain('Error invoking remote method')
  })

  it('没有报错原文时不说「未知错误」，也不让用户去看不存在的技术详情', () => {
    for (const code of LOCALES) {
      withLocale(code, () => {
        const diagnosis = describeAIError('', {}, t)
        expect(diagnosis.kind).toBe('generic')
        expect(diagnosis.detail).toBe('')
        expect(diagnosis.message).toBe(t('aiError.generic.messageNoDetail'))
        expect(diagnosis.message).not.toBe(t('aiError.generic.message'))
        if (code === 'en-US' || code === 'it-IT') expect(diagnosis.message).not.toMatch(HAN)
      })
    }
  })

  it('主进程不再给服务商的报错套「生成失败:」', () => {
    const dir = 'src/main/ai/providers'
    const files = ['src/main/ai/ai-service-manager.ts', ...readdirSync(dir).map(name => join(dir, name))]
    for (const file of files) {
      expect(read(file), file).not.toMatch(/生成失败: \$\{/)
      expect(read(file), file).not.toContain('ERROR_MESSAGES.GENERATION_FAILED')
    }
  })
})

describe('模板渲染失败：说第几行、该检查什么', () => {
  const jinja = (content: string): PromptWithRelations => ({
    id: 1, uuid: 'p', title: 'T', content, isJinjaTemplate: true, variables: [],
  } as unknown as PromptWithRelations)

  it('报错里不再有「模板渲染失败:」和 Nunjucks 的路径，保留行号', () => {
    const rendered = renderPrompt(jinja('第一行\n\n{% iff ready %}{% endif %}'), {}, [])
    expect(rendered.error).toBeTruthy()
    expect(rendered.error).not.toContain('模板渲染失败')
    expect(rendered.error).not.toContain('(unknown path)')
    expect(readTemplateErrorLine(rendered.error)).toBe(3)
  })

  it('有行号时说第几行，没有行号时给通用说明，都不带引擎原文', () => {
    const withLine = renderPrompt(jinja('第一行\n\n{% iff ready %}{% endif %}'), {}, []).error
    const withoutLine = renderPrompt(jinja('你好 {{ name '), {}, []).error
    expect(readTemplateErrorLine(withoutLine)).toBeNull()

    expect(withLocale('zh-CN', () => describeTemplateError(withLine, t)))
      .toBe('模板第 3 行有语法错误，检查 {{ }} 和 {% %} 是否成对')
    expect(withLocale('zh-CN', () => describeTemplateError(withoutLine, t)))
      .toBe('模板有语法错误，检查 {{ }} 和 {% %} 是否成对')
    expect(withLocale('en-US', () => describeTemplateError(withLine, t)))
      .toBe('Line 3 of the template has a syntax error. Check that {{ }} and {% %} come in pairs.')

    for (const code of LOCALES) {
      withLocale(code, () => {
        for (const error of [withLine, withoutLine]) {
          const text = describeTemplateError(error, t)
          expect(text).not.toMatch(/promptWorkspace\.|unknown path|unexpected|expected|parse/i)
          if (code === 'en-US' || code === 'it-IT') expect(text).not.toMatch(HAN)
        }
      })
    }
  })

  it('桌面端、移动端和启动器都用同一句说明', () => {
    const sites = [
      'src/renderer/components/prompts/PromptPage.vue',
      'src/renderer/components/prompts/PromptFillBody.vue',
      'src/renderer/pages/mobile/MobilePromptDetailPage.vue',
      'src/renderer/components/mobile/PromptVariableFillForm.vue',
      'src/renderer/components/shortcuts/PromptLauncher.vue',
    ]
    for (const file of sites) {
      const source = read(file)
      expect(source, file).toContain('describeTemplateError(')
      expect(source, file).not.toContain('renderFailedWithError')
    }
    expect(read('src/renderer/components/shortcuts/PromptLauncher.vue'))
      .toContain('executionError.value = describeTemplateError(rendered.error, t)')
  })
})

describe('模型配置、快速优化和移动端生成的保存失败提示不拼原始报错', () => {
  it('提示里不再追加 error.message', () => {
    const files = [
      'src/renderer/composables/ai/useAIConfigWorkspace.ts',
      'src/renderer/composables/ai/useAIConfigEditor.ts',
      'src/renderer/components/ai/QuickOptimizationConfigModal.vue',
      'src/renderer/pages/mobile/MobileAIGeneratorPage.vue',
    ]
    for (const file of files) {
      const source = read(file)
      expect(source, file).not.toMatch(/message\.error\([^\n]*\.message/)
      expect(source, file).not.toMatch(/showToast\(`/)
      expect(source, file).not.toContain('common.unknownError')
    }
    expect(read('src/renderer/pages/ModelsPage.vue')).not.toContain(':description="loadError"')
  })

  it('失败文案是完整的一句话，五种语言都没有拼接用的冒号和 {error}', () => {
    const keys = [
      'aiConfig.updateFailed', 'aiConfig.setFailed', 'aiConfig.clearFailed', 'aiConfig.deleteFailed',
      'aiConfig.saveFailed', 'aiConfig.connectionTestFailed', 'quickOptimization.workspace.saveFailed', 'aiGenerator.saveFailed',
    ]
    for (const code of LOCALES) {
      const messages = locale(code)
      for (const key of keys) {
        const value = lookup(messages, key)
        expect(typeof value, `${code} ${key}`).toBe('string')
        expect(value as string, `${code} ${key}`).not.toMatch(/[:：]\s*$/)
        expect(value as string, `${code} ${key}`).not.toContain('{error}')
      }
    }
  })
})

describe('文案改成用户的说法', () => {
  it('简体中文按产品要求改写', () => {
    const zh = locale('zh-CN')
    expect(zh.aiConfig.workspace.disablePreferredMessage).toBe('禁用后它不再是首选，AI 功能会改用其他已启用的配置。')
    expect(zh.aiConfig.workspace.chooseProviderDesc).toBe('先选择服务类型，下一步会显示需要填写的内容。')
    expect(zh.aiConfig.customEndpoint).toBe('自定义服务地址（可选）')
    expect(zh.aiConfig.useOfficialEndpoint).toBe('留空使用官方地址')
    expect(zh.aiConfig.workspace.officialEndpoint).toBe('使用官方地址')
    expect(withLocale('zh-CN', () => t('promptEditor.unclosedVariable', { count: 2 }, 2))).toBe('有 2 个变量少了结尾的 }}')
  })

  it('其他语言同步改写，不再出现「端点」一类的说法', () => {
    for (const code of ['zh-CN', 'zh-TW'] as const) {
      const messages = locale(code)
      for (const key of ['aiConfig.customEndpoint', 'aiConfig.useOfficialEndpoint', 'aiConfig.workspace.officialEndpoint']) {
        expect(lookup(messages, key) as string, `${code} ${key}`).not.toMatch(/端点|端點/)
      }
    }
    expect(withLocale('en-US', () => t('promptEditor.unclosedVariable', { count: 1 }, 1))).toBe('1 variable is missing its closing }}')
    expect(withLocale('en-US', () => t('promptEditor.unclosedVariable', { count: 3 }, 3))).toBe('3 variables are missing their closing }}')
    expect(withLocale('it-IT', () => t('promptEditor.unclosedVariable', { count: 3 }, 3))).toBe('3 variabili senza }} di chiusura')
  })

  it('新增文案五种语言都有，删掉的键都不在了', () => {
    for (const code of LOCALES) {
      const messages = locale(code)
      for (const key of ['promptGenerate.failedWith', 'aiError.generic.messageNoDetail', 'promptWorkspace.renderFailedAtLine']) {
        expect(typeof lookup(messages, key), `${code} ${key}`).toBe('string')
      }
      expect(lookup(messages, 'promptWorkspace.renderFailedWithError'), code).toBeUndefined()
      expect(lookup(messages, 'common.unknownError'), code).toBeUndefined()
    }
  })
})

describe('检查更新：失败只给一句能照着做的说明', () => {
  const release = (overrides: Record<string, unknown> = {}) => ({
    tag_name: 'v9.0.0', name: '9.0.0', body: '', html_url: 'https://example.com/r', published_at: '2026-10-01T00:00:00Z',
    prerelease: false, draft: false, ...overrides,
  })
  const respond = (body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) => ({
    ok: init.ok ?? true, status: init.status ?? 200, statusText: init.statusText ?? 'OK', json: async () => body,
  })
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    ;(window as any).electronAPI = { app: { getVersion: async () => '3.0.0' } }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as any).electronAPI
  })

  it('GitHub 限流（403）和断网都只标记失败，不把状态码或浏览器报错交给界面', async () => {
    fetchMock.mockResolvedValueOnce(respond({ message: 'API rate limit exceeded' }, { ok: false, status: 403, statusText: 'rate limit exceeded' }))
    const update = useUpdate()
    const limited = await update.checkForUpdates()
    expect(limited).toEqual({ success: false, data: null })
    expect(update.checkFailed.value).toBe(true)
    expect(update.checking.value).toBe(false)

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const offline = await update.checkForUpdates()
    expect(offline).toEqual({ success: false, data: null })
    expect(update.checkFailed.value).toBe(true)
  })

  it('最新的是预发布或草稿版本时按「已是最新」处理', async () => {
    fetchMock.mockResolvedValueOnce(respond(release({ prerelease: true })))
    const update = useUpdate()
    const result = await update.checkForUpdates()
    expect(result.success).toBe(true)
    expect(result.data?.hasUpdate).toBe(false)
    expect(update.hasUpdate.value).toBe(false)
    expect(update.checkFailed.value).toBe(false)
  })

  it('没写更新说明时留空，不塞一句固定的中文', async () => {
    fetchMock.mockResolvedValueOnce(respond(release({ body: '  ' })))
    const update = useUpdate()
    const result = await update.checkForUpdates()
    expect(result.data?.hasUpdate).toBe(true)
    expect(update.releaseNotes.value).toBe('')
  })

  it('检查还没结束时再点一次，什么都不做也不提示', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const update = useUpdate()
    const first = update.checkForUpdates()
    await Promise.resolve()
    const second = await update.checkForUpdates()
    expect(second).toEqual({ success: false, data: null, skipped: true })
    resolve(respond(release()))
    expect((await first).success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('关于页失败时只在页面上说一次，不再弹出原始报错', () => {
    for (const file of ['src/renderer/components/settings/AboutSettings.vue', 'src/renderer/pages/mobile/MobileAboutPage.vue']) {
      const source = read(file)
      expect(source, file).toContain("t('about.checkFailed')")
      expect(source, file).not.toContain('result.error')
      expect(source, file).not.toContain('checkError')
    }
    const composable = read('src/renderer/composables/useUpdate.ts')
    for (const text of ['正在检查更新中', '最新发布版本是预发布版本或草稿版本', '暂无更新说明', '打开下载页面失败\'', 'GitHub API 请求失败']) {
      expect(composable).not.toContain(text)
    }
  })
})
