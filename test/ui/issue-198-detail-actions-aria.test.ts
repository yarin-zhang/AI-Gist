import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = resolve(process.cwd(), 'src/renderer/pages/mobile/MobilePromptDetailPage.vue')

describe('Issue #198 mobile prompt detail actions', () => {
  it('names favorite and more actions for assistive technologies and tooltips', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain(":aria-label=\"t('promptManagement.detailModal.favorite')\"")
    expect(source).toContain(":title=\"t('promptManagement.detailModal.favorite')\"")
    expect(source).toContain(":aria-label=\"t('promptManagement.moreOptions')\"")
    expect(source).toContain(":title=\"t('promptManagement.moreOptions')\"")
  })
})
