import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Gitea #382: a default "text" variable rendered as a single-line <input>, which silently
// replaced every newline of a pasted diff with a space. Vitest has no SFC transform here, so
// these checks pin the wiring; the helpers are covered in test/prompt-template.test.ts.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const FIELDS = read('src/renderer/components/prompts/VariableFieldList.vue')
const PAGE = read('src/renderer/components/prompts/PromptPage.vue')
const LAUNCHER = read('src/renderer/components/shortcuts/LauncherInlineFill.vue')
const MOBILE_FORM = read('src/renderer/components/mobile/PromptVariableFillForm.vue')
const MOBILE_PAGE = read('src/renderer/pages/mobile/MobilePromptDetailPage.vue')
const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']

describe('multi-line variable fill wiring (#382)', () => {
  it('desktop variable panel renders text variables as a textarea when placement or value is multi-line', () => {
    expect(FIELDS).toContain('props.multilineNames.has(variable.name) || expanded.value.has(variable.name) || hasLineBreak(stringValue(variable))')
    expect(PAGE).toContain('findMultilineVariableNames(form.value.content)')
  })

  it('desktop variable panel intercepts multi-line pastes before the <input> flattens them', () => {
    expect(FIELDS).toContain('onPaste: (event: ClipboardEvent) => handlePaste(event, variable)')
    expect(FIELDS).toContain('event.preventDefault()')
  })

  it('launcher inline fill uses the placement hint and keeps pasted newlines', () => {
    expect(LAUNCHER).toContain('findMultilineVariableStarts(')
    expect(LAUNCHER).toContain('multilineStarts.value.has(segment.start)')
    expect(LAUNCHER).toContain('@paste="handlePaste($event, segment.name)"')
    expect(LAUNCHER).toContain('event.preventDefault()')
  })

  it('mobile form applies the same rule and keeps pasted newlines', () => {
    expect(MOBILE_PAGE).toContain(":content=\"prompt?.isJinjaTemplate ? '' : prompt?.content\"")
    expect(MOBILE_FORM).toContain('findMultilineVariableNames(')
    expect(MOBILE_FORM).toContain('@paste="handlePaste(variable, $event)"')
    expect(MOBILE_FORM).toContain('event.preventDefault()')
    // 切成多行文本框后给出提示，焦点和光标挪到新的文本框里
    expect(MOBILE_FORM).toContain("t('promptFill.switchedToMultiline')")
    expect(MOBILE_FORM).toContain('textarea.setSelectionRange(caret, caret)')
  })

  it.each(LOCALES)('%s has the switched-to-multi-line notice', locale => {
    const messages = JSON.parse(read(`src/renderer/i18n/locales/${locale}.json`))
    expect(messages.promptFill.switchedToMultiline).toBeTruthy()
  })
})
