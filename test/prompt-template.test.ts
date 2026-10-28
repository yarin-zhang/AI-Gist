import { describe, expect, it } from 'vitest'
import type { PromptWithRelations } from '../src/shared/types/database'
import type { EditablePromptVariable } from '../src/renderer/lib/utils/prompt-template'
import {
  buildPromptResultSegments,
  createPromptDraft,
  createVariable,
  findEditingVariableSegment,
  findMultilineVariableNames,
  findMultilineVariableStarts,
  getActivePromptVariables,
  getMissingPromptVariables,
  getUnfilledPromptVariables,
  hasLineBreak,
  isVariableConfigured,
  normalizeVariableType,
  parsePromptTemplate,
  reconcilePromptVariables,
  removeVariableOccurrences,
  renderPrompt,
  replaceVariableName,
  unwrapVariableOccurrences,
  validateVariableName,
} from '../src/renderer/lib/utils/prompt-template'

const prompt = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: 'prompt-1',
  title: 'Template',
  content: 'Hello {{name}}',
  tags: [],
  variables: [],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('prompt template core', () => {
  it('parses Unicode, whitespace and repeated placeholders in document order', () => {
    const parsed = parsePromptTemplate('请让 {{ 角色 }} 向 {{name}} 介绍 {{角色}}。')
    expect(parsed.variableNames).toEqual(['角色', 'name'])
    expect(parsed.occurrences.get('角色')).toHaveLength(2)
    expect(parsed.segments.filter(segment => segment.kind === 'variable')).toMatchObject([
      { name: '角色', occurrence: 0, firstOccurrence: true },
      { name: 'name', occurrence: 0, firstOccurrence: true },
      { name: '角色', occurrence: 1, firstOccurrence: false },
    ])
  })

  it('reports unclosed placeholders without changing their text', () => {
    const content = 'Hello {{name\nNext line'
    const parsed = parsePromptTemplate(content)
    expect(parsed.diagnostics).toHaveLength(1)
    expect(parsed.segments).toEqual([{ kind: 'text', text: content, start: 0, end: content.length }])
  })

  it('reconciles active variables while retaining unused configurations', () => {
    const reconciled = reconcilePromptVariables('Hello {{name}} and {{topic}}', [
      { name: 'name', type: 'textarea', required: false, description: 'Name hint' },
      { name: 'old', type: 'select', required: true, options: ['A'] },
    ])
    expect(reconciled.active).toMatchObject([
      { name: 'name', type: 'textarea', required: false, description: 'Name hint' },
      { name: 'topic', type: 'text', required: true },
    ])
    expect(reconciled.unused).toMatchObject([{ name: 'old' }])
  })

  it('drops transient names typed into a placeholder but keeps created or configured ones', () => {
    const retained = new Set(['Variable 1'])
    const retainUnused = (variable: EditablePromptVariable) => retained.has(variable.name) || isVariableConfigured(variable)
    let variables: EditablePromptVariable[] = [createVariable('Variable 1')]

    for (const typed of ['t', 'to', 'top', 'topi', 'topic', 'a', 'au', 'audience']) {
      variables = reconcilePromptVariables(`Write about {{${typed}}}`, variables, { retainUnused }).all
    }
    expect(variables.map(variable => variable.name)).toEqual(['audience', 'Variable 1'])

    const configured = { ...createVariable('tone'), type: 'select', options: ['Formal'] }
    const reconciled = reconcilePromptVariables('{{voice}}', [configured, createVariable('draft')], { retainUnused })
    expect(reconciled.unused.map(variable => variable.name)).toEqual(['tone'])
  })

  it('treats any non-default property as a configured variable', () => {
    expect(isVariableConfigured(createVariable('name'))).toBe(false)
    expect(isVariableConfigured({ ...createVariable('name'), description: 'Who' })).toBe(true)
    expect(isVariableConfigured({ ...createVariable('name'), required: false })).toBe(true)
    expect(isVariableConfigured({ ...createVariable('name'), type: 'textarea' })).toBe(true)
    expect(isVariableConfigured({ ...createVariable('name'), validation: {} })).toBe(false)
  })

  it('renames and removes every occurrence atomically', () => {
    const content = '{{ name }} greets {{name}} and {{other}}'
    expect(replaceVariableName(content, 'name', '角色')).toBe('{{角色}} greets {{角色}} and {{other}}')
    expect(removeVariableOccurrences(content, 'name')).toBe(' greets  and {{other}}')
  })

  it('normalizes legacy types and creates typed defaults', () => {
    expect(normalizeVariableType('int')).toBe('number')
    expect(normalizeVariableType('bool')).toBe('boolean')
    expect(createPromptDraft([
      { name: 'count', type: 'number', required: true, defaultValue: '0' },
      { name: 'enabled', type: 'boolean', required: true, defaultValue: 'true' },
    ])).toEqual({ count: '0', enabled: true })
  })

  it('treats zero and false as filled required values', () => {
    const variables = [
      { name: 'count', type: 'number', required: true },
      { name: 'enabled', type: 'boolean', required: true },
      { name: 'subject', type: 'text', required: true },
    ]
    expect(getMissingPromptVariables(variables, { count: 0, enabled: false, subject: '' })).toEqual(['subject'])
  })

  it('derives only referenced variables for regular prompts and renders repeated values', () => {
    const source = prompt({
      content: '{{name}} / {{ name }}',
      variables: [
        { uuid: 'v1', promptId: 1, name: 'name', type: 'text', required: true, createdAt: new Date(), updatedAt: new Date() },
        { uuid: 'v2', promptId: 1, name: 'unused', type: 'text', required: true, createdAt: new Date(), updatedAt: new Date() },
      ],
    })
    expect(getActivePromptVariables(source).map(variable => variable.name)).toEqual(['name'])
    expect(renderPrompt(source, { name: 'Ada' }).content).toBe('Ada / Ada')
  })
})

describe('findEditingVariableSegment', () => {
  const { segments } = parsePromptTemplate('请翻译成 {{yuyan}}，风格 {{tone}}')
  const yuyanStart = '请翻译成 '.length
  const yuyanEnd = yuyanStart + '{{yuyan}}'.length

  it('returns the placeholder whose braces surround the cursor', () => {
    expect(findEditingVariableSegment(segments, [yuyanStart + 4])?.name).toBe('yuyan')
  })

  it('ignores cursors on placeholder boundaries or outside placeholders', () => {
    expect(findEditingVariableSegment(segments, [yuyanStart])).toBeNull()
    expect(findEditingVariableSegment(segments, [yuyanEnd])).toBeNull()
    expect(findEditingVariableSegment(segments, [1])).toBeNull()
  })

  it('checks every selection endpoint', () => {
    const toneInside = segments.filter(segment => segment.kind === 'variable')[1].start + 3
    expect(findEditingVariableSegment(segments, [0, toneInside])?.name).toBe('tone')
  })
})

describe('findMultilineVariableStarts', () => {
  const startsOf = (content: string) => {
    const { segments } = parsePromptTemplate(content)
    const starts = findMultilineVariableStarts(content, segments)
    return segments
      .filter(segment => segment.kind === 'variable')
      .map(segment => [segment.name, starts.has(segment.start)])
  }

  it('flags a placeholder on its own line or inside a fenced code block (#382)', () => {
    expect(startsOf('Review this:\n```diff\n{{diff}}\n```\nFocus on {{focus}}.')).toEqual([
      ['diff', true],
      ['focus', false],
    ])
    expect(startsOf('Context:\n  {{context}}  \nThanks')).toEqual([['context', true]])
    expect(startsOf('```ts\nconst x = {{value}}\n```')).toEqual([['value', true]])
    expect(startsOf('~~~\n{{a}} and {{b}}')).toEqual([['a', true], ['b', true]])
  })

  it('keeps placeholders in running text and fence info strings single-line', () => {
    expect(startsOf('Translate {{text}} into {{language}}')).toEqual([
      ['text', false],
      ['language', false],
    ])
    expect(startsOf('{{a}} {{b}}')).toEqual([['a', false], ['b', false]])
    expect(startsOf('```{{lang}}\ncode\n```\n{{after}} text')).toEqual([
      ['lang', false],
      ['after', false],
    ])
  })

  it('aggregates by variable name for list-style fill forms', () => {
    expect([...findMultilineVariableNames('Say {{x}}\n{{x}}\n{{y}} here')]).toEqual(['x'])
    expect(hasLineBreak('a\r\nb')).toBe(true)
    expect(hasLineBreak('ab')).toBe(false)
    expect(hasLineBreak(3)).toBe(false)
  })
})

describe('final result with unfilled variables (#381)', () => {
  const source = prompt({
    content: 'You are a senior {{language}} engineer.\nFocus areas: {{ focus }}\nTone: {{tone}} ({{language}})',
    variables: [
      { ...createVariable('language') },
      { ...createVariable('focus'), required: false },
      { ...createVariable('tone'), required: false, defaultValue: 'calm' },
    ] as any,
  })

  it('keeps unfilled placeholders instead of rendering them as blanks', () => {
    expect(buildPromptResultSegments(source, { language: '  ', focus: '' })).toEqual([
      { kind: 'text', text: 'You are a senior ' },
      { kind: 'unfilled', name: 'language', raw: '{{language}}', required: true },
      { kind: 'text', text: ' engineer.\nFocus areas: ' },
      { kind: 'unfilled', name: 'focus', raw: '{{ focus }}', required: false },
      { kind: 'text', text: '\nTone: calm (' },
      { kind: 'unfilled', name: 'language', raw: '{{language}}', required: true },
      { kind: 'text', text: ')' },
    ])
  })

  it('joins filled segments to exactly the copied content', () => {
    const values = { language: 'Go', focus: 'security', tone: 'direct' }
    expect(buildPromptResultSegments(source, values)).toEqual([
      { kind: 'text', text: renderPrompt(source, values).content },
    ])
  })

  it('lists variables that would render blank, counting defaults and booleans as filled', () => {
    const variables = [
      ...getActivePromptVariables(source),
      { ...createVariable('enabled'), type: 'boolean' },
    ]
    expect(getUnfilledPromptVariables(variables, { language: '', focus: ' ', enabled: false }).map(item => item.name))
      .toEqual(['language', 'focus'])
  })

  it('leaves Jinja output to the template engine', () => {
    const jinja = prompt({ isJinjaTemplate: true, content: 'Hello {{ name }}' })
    expect(buildPromptResultSegments(jinja, { name: '' })).toEqual([{ kind: 'text', text: 'Hello ' }])
  })
})

describe('默认值：正文里的 {{名称:默认值}} 和空值回落（#482）', () => {
  it('按第一个冒号拆出变量名和默认值，全角冒号也算，同名变量合并成一个', () => {
    const parsed = parsePromptTemplate('分支 {{主分支:main}}，前缀 {{前缀：thoxvi}}，时间 {{时间:9:00}}，再用 {{主分支}}')
    expect(parsed.variableNames).toEqual(['主分支', '前缀', '时间'])
    expect(Object.fromEntries(parsed.inlineDefaults)).toEqual({ 主分支: 'main', 前缀: 'thoxvi', 时间: '9:00' })
    expect(parsed.occurrences.get('主分支')?.length).toBe(2)
  })

  it('冒号前面是空的不算默认值写法', () => {
    expect(parsePromptTemplate('{{:x}}').variableNames).toEqual([':x'])
  })

  it('填写时用正文里的默认值兜底，变量设置里填了默认值的以设置为准', () => {
    const p = prompt({
      content: '{{主分支:main}} {{数量:6}}',
      variables: [{ ...createVariable('数量'), defaultValue: '8' }],
    })
    const variables = getActivePromptVariables(p)
    expect(variables.map(variable => [variable.name, variable.defaultValue])).toEqual([['主分支', 'main'], ['数量', '8']])
    expect(renderPrompt(p, createPromptDraft(variables)).content).toBe('main 8')
  })

  it('正文里的默认值不写回变量设置', () => {
    const { active } = reconcilePromptVariables('{{主分支:main}}', [])
    expect(active[0].defaultValue).toBe('')
  })

  it('有默认值的必填变量空着也不算未填，复制时用默认值', () => {
    const p = prompt({ content: '{{主分支:main}} {{名字}}' })
    const variables = getActivePromptVariables(p)
    expect(getMissingPromptVariables(variables, { 主分支: '', 名字: '' })).toEqual(['名字'])
    expect(renderPrompt(p, { 主分支: '  ', 名字: 'Ada' }).content).toBe('main Ada')
  })

  it('上次留空或清空过的字段重新填上默认值，填过的值不动', () => {
    const variables = [{ ...createVariable('a'), defaultValue: 'A' }, { ...createVariable('b'), defaultValue: 'B' }, createVariable('c')]
    expect(createPromptDraft(variables, { a: '', b: 'mine', c: '' })).toEqual({ a: 'A', b: 'mine', c: '' })
  })

  it('改名保留默认值，删除变量时正文换成默认值', () => {
    expect(replaceVariableName('{{旧:main}} {{旧}}', '旧', '新')).toBe('{{新:main}} {{新}}')
    expect(replaceVariableName('{{旧：值}}', '旧', '新')).toBe('{{新：值}}')
    expect(unwrapVariableOccurrences('用 {{分支:main}} 和 {{分支}}', '分支')).toBe('用 main 和 分支')
  })

  it('变量名里不能有冒号', () => {
    expect(validateVariableName('主分支:main', [])).toBe('invalid')
    expect(validateVariableName('主分支：main', [])).toBe('invalid')
  })
})
