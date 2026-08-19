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
})
