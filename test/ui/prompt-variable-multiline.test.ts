import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Gitea #382: a default "text" variable rendered as a single-line <input>, which silently
// replaced every newline of a pasted diff with a space. Vitest has no SFC transform here, so
// these checks pin the wiring; the helpers are covered in test/prompt-template.test.ts.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const FIELD = read('src/renderer/components/prompt-management/PromptVariableField.vue')
const CANVAS = read('src/renderer/components/prompt-management/PromptFillCanvas.vue')
const MOBILE_FORM = read('src/renderer/components/mobile/PromptVariableFillForm.vue')
const MOBILE_PAGE = read('src/renderer/pages/mobile/MobilePromptDetailPage.vue')
const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']

describe('multi-line variable fill wiring (#382)', () => {
  it('desktop field renders text variables as a textarea when placement or value is multi-line', () => {
    expect(FIELD).toContain("normalizedType.value === 'text' && (props.multiline || expanded.value) ? 'textarea'")
    expect(FIELD).toMatch(/watch\(stringValue, value => \{ if \(hasLineBreak\(value\)\) expanded\.value = true \}/)
    expect(FIELD).toContain(":type=\"displayType === 'textarea' ? 'textarea' : 'text'\"")
  })

  it('desktop field intercepts multi-line pastes before the <input> flattens them', () => {
    expect(FIELD).toContain('onPaste: handlePaste')
    expect(FIELD).toContain('event.preventDefault()')
    expect(FIELD).toContain("t('promptFill.switchedToMultiline')")
  })

  it('fill canvas passes the placement hint for each occurrence', () => {
    expect(CANVAS).toContain(':multiline="multilineStarts.has(segment.start)"')
    expect(CANVAS).toContain('findMultilineVariableStarts(')
  })

  it('mobile form applies the same rule and keeps pasted newlines', () => {
    expect(MOBILE_PAGE).toContain(":content=\"prompt?.isJinjaTemplate ? '' : prompt?.content\"")
    expect(MOBILE_FORM).toContain('findMultilineVariableNames(')
    expect(MOBILE_FORM).toContain('@paste="handlePaste(variable, $event)"')
  })

  it.each(LOCALES)('%s has the switched-to-multi-line notice', locale => {
    const messages = JSON.parse(read(`src/renderer/i18n/locales/${locale}.json`))
    expect(messages.promptFill.switchedToMultiline).toBeTruthy()
  })
})
