/**
 * Jinja 模板的 list / dict 变量（#476）：界面上按文本填写，渲染前换成数组 / 对象，
 * `{% for %}` 不会再把输入逐字符展开。桌面端和移动端共用 renderPrompt，两端一致。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PromptWithRelations } from '@shared/types/database'
import { parseJinjaVariableValue, renderPrompt } from '~/lib/utils/prompt-template'

const releaseNotes = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: 'jinja-1',
  title: 'Jinja: release notes',
  content: '{% for item in items %}- {{ item }}\n{% endfor %}',
  isJinjaTemplate: true,
  tags: [],
  variables: [{ name: 'items', type: 'list', required: false } as any],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('parseJinjaVariableValue', () => {
  it('list 按行拆分，去掉首尾空白和空行', () => {
    expect(parseJinjaVariableValue('list', 'Login fix\n  Dark mode \n\n')).toEqual(['Login fix', 'Dark mode'])
    expect(parseJinjaVariableValue('list', 'a\r\nb')).toEqual(['a', 'b'])
    expect(parseJinjaVariableValue('list', '')).toEqual([])
  })

  it('list 也接受 JSON 数组；不合法时按行拆分', () => {
    expect(parseJinjaVariableValue('list', '["a", "b, c"]')).toEqual(['a', 'b, c'])
    expect(parseJinjaVariableValue('list', '[not json')).toEqual(['[not json'])
  })

  it('dict 只接受 JSON 对象，解析不了时保持原文', () => {
    expect(parseJinjaVariableValue('dict', '{"lang": "Go"}')).toEqual({ lang: 'Go' })
    expect(parseJinjaVariableValue('dict', 'lang: Go')).toBe('lang: Go')
  })

  it('已经是数组 / 非字符串的值原样返回', () => {
    expect(parseJinjaVariableValue('list', ['x'])).toEqual(['x'])
    expect(parseJinjaVariableValue('list', 3)).toBe(3)
  })
})

describe('renderPrompt 渲染 Jinja 列表变量', () => {
  it('每行一项渲染成列表，而不是逐字符展开', () => {
    expect(renderPrompt(releaseNotes(), { items: 'Login fix\nDark mode' }).content).toBe('- Login fix\n- Dark mode\n')
  })

  it('没有填写时循环为空，不会把空字符串当成一项', () => {
    expect(renderPrompt(releaseNotes(), { items: '' }).content).toBe('')
  })

  it('普通文本变量不受影响', () => {
    const prompt = releaseNotes({
      content: '{% for c in name %}{{ c }}.{% endfor %}',
      variables: [{ name: 'name', type: 'str', required: false } as any],
    })
    expect(renderPrompt(prompt, { name: 'ab' }).content).toBe('a.b.')
  })
})

describe('移动端填写面板', () => {
  const form = readFileSync('src/renderer/components/mobile/PromptVariableFillForm.vue', 'utf8')

  it('list 变量用多行输入，并提示每行一项', () => {
    expect(form).toContain("if (variable.type === 'list') return 'list'")
    expect(form).toContain("kindOf(variable) === 'textarea' || kindOf(variable) === 'list'")
    expect(form).toContain("t('promptFill.listHint')")
  })
})

describe('桌面端变量面板也说明 list / dict 怎么填', () => {
  const fields = readFileSync('src/renderer/components/prompts/VariableFieldList.vue', 'utf8')

  it('Jinja 的 list / dict 变量下面给出填写格式提示', () => {
    expect(fields).toContain('<p v-if="isJinjaCode(variable)" class="ui-help">{{ jinjaHint(variable) }}</p>')
    expect(fields).toContain("String(variable.type) === 'list' ? t('promptFill.listHint') : t('promptFill.dictHint')")
  })

  it('移动端的 dict 变量同样有提示', () => {
    const form = readFileSync('src/renderer/components/mobile/PromptVariableFillForm.vue', 'utf8')
    expect(form).toContain(`<p v-else-if="variable.type === 'dict'" class="fill-field__hint">{{ t('promptFill.dictHint') }}</p>`)
  })

  it.each(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'])('%s 的 dict 提示里示例的大括号原样显示', async locale => {
    const { default: i18n } = await import('~/i18n')
    i18n.global.locale.value = locale as never
    const text = String(i18n.global.t('promptFill.dictHint'))
    expect(text).toContain('{"name": "Ada"}')
    expect(String(i18n.global.t('promptFill.listHint'))).toBeTruthy()
    i18n.global.locale.value = 'zh-CN' as never
  })
})
