/**
 * 移动端"挖空"填写变量测试
 *
 * 对应 Gitea issue #87：移动端提示词详情页此前只能原样显示 `{{变量名}}`
 * 占位符文字，没有任何交互式填写能力。桌面端已经有一套成熟实现——
 * `PromptFillCanvas.vue` + `PromptVariableField.vue`，其变量解析、默认值
 * 兜底、必填校验规则都来自 `src/renderer/lib/utils/prompt-template.ts`。
 *
 * 移动端新增的 `MobilePromptDetailPage.vue` + `PromptVariableFillForm.vue`
 * 直接从同一个文件 import 这些函数（vite.config.mobile.js 里 `@`/`~` 两个别名
 * 都指向 src/renderer，这不是"重新实现一份等价逻辑"，而是字面上同一份源码），
 * 因此不可能出现两端对同一个提示词解析出不同变量列表的情况。
 *
 * 下面第一组用例直接复用桌面端已经在验证的解析/渲染函数，并用 issue 截图里
 * 那个"旅行计划助手"提示词（{{目的地}}/{{天数}}/{{月份}}/{{预算}}/{{偏好}}）
 * 作为回归样本；第二组用例是源码级 wiring 检查（与
 * test/mobile/mobile-sync-ui-wiring.test.ts 同风格），确认页面确实在复用
 * 共享逻辑而不是另起炉灶，且未填完必填变量时复制会被阻止、无变量的普通提示词
 * 保持原样。
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PromptWithRelations } from '@shared/types/database'
import {
  createPromptDraft,
  getActivePromptVariables,
  getMissingPromptVariables,
  renderPrompt,
} from '~/lib/utils/prompt-template'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const DETAIL_PAGE = 'src/renderer/pages/mobile/MobilePromptDetailPage.vue'
const FILL_FORM = 'src/renderer/components/mobile/PromptVariableFillForm.vue'

// 与 issue #87 截图完全一致的"旅行计划助手"提示词内容
const TRAVEL_PROMPT_CONTENT =
  '为{{目的地}}安排{{天数}}天行程。出发月份为{{月份}}，预算约{{预算}}，偏好{{偏好}}。' +
  '每天保留至少一段自由时间，并标出需要提前预约的项目。'

const travelPrompt = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: 'prompt-travel',
  title: '旅行计划助手',
  content: TRAVEL_PROMPT_CONTENT,
  tags: ['旅行', '计划'],
  variables: [],
  isFavorite: false,
  useCount: 12,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('mobile prompt variable fill — 挖空变量解析与渲染（与桌面端同源）', () => {
  it('从截图里的提示词解析出 5 个变量，且按正文中出现的先后顺序排列', () => {
    const variables = getActivePromptVariables(travelPrompt())
    expect(variables.map(variable => variable.name)).toEqual(['目的地', '天数', '月份', '预算', '偏好'])
    // 没有单独保存过变量schema 时，桌面端的兜底规则是：新识别出的变量默认必填
    expect(variables.every(variable => variable.required)).toBe(true)
  })

  it('草稿初始值为空字符串，必填校验会把全部 5 个变量都判定为缺失', () => {
    const variables = getActivePromptVariables(travelPrompt())
    const draft = createPromptDraft(variables, {})
    expect(draft).toEqual({ 目的地: '', 天数: '', 月份: '', 预算: '', 偏好: '' })
    expect(getMissingPromptVariables(variables, draft)).toEqual(['目的地', '天数', '月份', '预算', '偏好'])
  })

  it('填完全部变量后不再缺失，且渲染结果与桌面端 renderPrompt 替换规则一致', () => {
    const prompt = travelPrompt()
    const variables = getActivePromptVariables(prompt)
    const values = { 目的地: '京都', 天数: '5', 月份: '11月', 预算: '8000元', 偏好: '古寺与美食' }

    expect(getMissingPromptVariables(variables, values)).toEqual([])
    expect(renderPrompt(prompt, values, variables).content).toBe(
      '为京都安排5天行程。出发月份为11月，预算约8000元，偏好古寺与美食。每天保留至少一段自由时间，并标出需要提前预约的项目。'
    )
  })

  it('只填部分变量时，未填写的变量原样保留为空字符串（不会用变量名占位符顶替）', () => {
    const prompt = travelPrompt()
    const variables = getActivePromptVariables(prompt)
    const rendered = renderPrompt(prompt, { 目的地: '京都' }, variables)
    expect(rendered.content).toBe('为京都安排天行程。出发月份为，预算约，偏好。每天保留至少一段自由时间，并标出需要提前预约的项目。')
  })

  it('普通纯文本提示词（没有 {{}} 占位符）不解析出任何变量', () => {
    const plain = travelPrompt({ content: '帮我写一段关于秋天的散文。', variables: [] })
    expect(getActivePromptVariables(plain)).toEqual([])
  })
})

describe('mobile prompt variable fill — 页面接线（wiring）检查', () => {
  it('详情页直接 import 共享的解析/渲染函数，而不是自己重新实现一套正则', () => {
    const source = read(DETAIL_PAGE)
    expect(source).toContain("from '~/lib/utils/prompt-template'")
    expect(source).toContain('getActivePromptVariables')
    expect(source).toContain('createPromptDraft')
    expect(source).toContain('renderPrompt')
    // 不应该出现独立的 {{ }} 解析正则——那意味着重新发明了一套解析规则
    expect(source).not.toMatch(/\\\{\\\{/)
  })

  it('填写表单组件同样复用共享的校验/类型归一化函数', () => {
    const source = read(FILL_FORM)
    expect(source).toContain("from '~/lib/utils/prompt-template'")
    expect(source).toContain('getMissingPromptVariables')
    expect(source).toContain('normalizeVariableType')
  })

  it('复制前会校验必填变量，未填完时中止复制并提示，而不是用占位符顶替', () => {
    const source = read(DETAIL_PAGE)
    expect(source).toContain('fillFormRef.value?.validateAndFocus()')
    expect(source).toContain("'promptWorkspace.completeRequired'")
    expect(source).toContain("'promptWorkspace.renderFailed'")
    // 校验不通过必须 return，不能继续往下走到 clipboard.writeText
    expect(source).toMatch(/if \(!valid \|\| rendered\.value\.error\) \{[\s\S]*?return\n\s*\}/)
  })

  it('复制的是替换变量后的最终文本（rendered.content），有变量时不会复制原始模板', () => {
    const source = read(DETAIL_PAGE)
    expect(source).toContain('const finalContent = hasVariables ? rendered.value.content : prompt.value.content')
    expect(source).toContain('await navigator.clipboard.writeText(finalContent)')
  })

  it('没有变量的普通提示词保持原样展示 content，不套用填写变量 UI', () => {
    const source = read(DETAIL_PAGE)
    expect(source).toMatch(/<div v-else class="content-section">[\s\S]*?\{\{ prompt\.content \}\}/)
  })

  it('validateAndFocus() 把渲染错误传给填写表单，让表单自己也能满足"必填齐全且渲染无误"的契约', () => {
    const source = read(DETAIL_PAGE)
    expect(source).toContain(':render-error="rendered.error"')
    const formSource = read(FILL_FORM)
    expect(formSource).toMatch(/renderError\?:\s*string/)
    expect(formSource).toMatch(/if \(!missing\.value\.length && !props\.renderError\) return true/)
  })
})

// 第二轮修复：review 发现并复现的真实数据丢失 bug——onIonViewWillEnter 会在这个
// 页面每次重新变为激活状态时都调用 loadPrompt()（例如从"编辑"页返回），第一轮
// 实现里 draft.value = createPromptDraft(...) 是无条件执行的，导致用户已经填完
// 的草稿被静默清空。修复参照桌面端 PromptUseWorkspace.vue 的既有模式：只在
// 提示词身份（id/uuid）真正改变时才重置草稿。
describe('mobile prompt variable fill — 详情页重新进入不应清空已填草稿（issue #87 二轮修复）', () => {
  it('loadPrompt() 里 draft 的重置被"身份是否变化"的 if 包裹，不再是无条件执行的一行代码', () => {
    const source = read(DETAIL_PAGE)
    // 记忆"上一次加载的是哪个提示词"必须声明在 loadPrompt 之外（模块级变量），
    // 否则每次调用都会是全新的初始值，起不到跨调用记忆的作用。
    expect(source).toMatch(/let loadedPromptKey: string \| null = null/)
    // 重置 draft 与重置校验状态必须被同一个身份比较 if 包裹，且只有分支内才
    // 更新 loadedPromptKey——这样"相同身份"路径下三者都不会执行，草稿原样保留。
    expect(source).toMatch(
      /const promptKey = prompt\.value[\s\S]{0,80}\n\s*if \(promptKey !== loadedPromptKey\) \{\s*\n\s*draft\.value = createPromptDraft\(variables\.value, \{\}\)\s*\n\s*fillFormRef\.value\?\.resetValidation\(\)\s*\n\s*loadedPromptKey = promptKey\s*\n\s*\}/
    )
    // 锁定"拿到 prompt 后立刻无条件重置 draft"这个旧的 bug 模式不会再出现。
    expect(source).not.toMatch(
      /prompt\.value = await api\.prompts\.getById\.query\(promptId\)\s*\n\s*draft\.value = createPromptDraft/
    )
  })

  it('模拟真实复现步骤：同一提示词往返导航（详情→编辑→详情）保留草稿，切换到不同提示词才重置为默认值', () => {
    // 这里直接复用生产代码同一份 createPromptDraft/getActivePromptVariables，
    // 按 loadPrompt() 里锁定的同一套身份比较规则模拟"加载"，验证该算法本身在
    // review 描述的两个场景下都行为正确：
    //   1) 同一个提示词 id/uuid 重新加载（从编辑页返回）——草稿保留
    //   2) 换成另一个不同的提示词——草稿正确重置为新提示词的默认值
    let loadedPromptKey: string | null = null
    let draft: Record<string, any> = {}
    const load = (p: PromptWithRelations) => {
      const key = `${p.id ?? ''}:${p.uuid ?? ''}`
      if (key !== loadedPromptKey) {
        draft = createPromptDraft(getActivePromptVariables(p), {})
        loadedPromptKey = key
      }
    }

    const prompt = travelPrompt()

    // 步骤 1：首次进入详情页，填完全部 5 个变量到 "5/5 filled"
    load(prompt)
    draft = { ...draft, 目的地: '京都', 天数: '5', 月份: '11月', 预算: '8000元', 偏好: '古寺与美食' }
    expect(getMissingPromptVariables(getActivePromptVariables(prompt), draft)).toEqual([])

    // 步骤 2：导航到 /prompt/edit/2 再返回 /prompt/detail/2——同一个提示词，
    // onIonViewWillEnter 重新触发 loadPrompt()，草稿必须原样保留（不能退回 "1/5"）
    load(prompt)
    expect(draft).toEqual({ 目的地: '京都', 天数: '5', 月份: '11月', 预算: '8000元', 偏好: '古寺与美食' })

    // 步骤 3：真正切换到另一个不同的提示词——草稿要正确重置为新提示词的默认值，
    // 不能因为这次修复而"永远不重置"
    const otherPrompt = travelPrompt({
      id: 2,
      uuid: 'prompt-other',
      content: '给{{受众}}写一封{{语气}}的邮件。',
    })
    load(otherPrompt)
    expect(draft).toEqual({ 受众: '', 语气: '' })
  })
})
