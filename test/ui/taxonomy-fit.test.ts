import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fitTaxonomyTags } from '../../src/renderer/lib/utils/taxonomy-fit'

const overflowWidth = () => 24

describe('prompt card taxonomy fitting', () => {
  it('shows every tag when the row has room', () => {
    expect(fitTaxonomyTags({
      available: 300, gap: 5, leading: [],
      category: { natural: 80, minWidth: 72 },
      tags: [40, 40, 40],
      overflowWidth,
    })).toBe(3)
  })

  it('folds whole tags into +N instead of squeezing each one', () => {
    // 72 (category min) + 50 + 50 + 24 (+N) + 3 gaps = 211
    expect(fitTaxonomyTags({
      available: 215, gap: 5, leading: [],
      category: { natural: 140, minWidth: 72 },
      tags: [50, 50, 50, 50, 50],
      overflowWidth,
    })).toBe(2)
  })

  it('lets a short category keep its natural width', () => {
    expect(fitTaxonomyTags({
      available: 120, gap: 5, leading: [],
      category: { natural: 40, minWidth: 72 },
      tags: [70],
      overflowWidth,
    })).toBe(1)
  })

  it('reserves space for fixed leading chips', () => {
    expect(fitTaxonomyTags({
      available: 200, gap: 5, leading: [90],
      category: { natural: 120, minWidth: 72 },
      tags: [50, 50],
      overflowWidth,
    })).toBe(0)
  })

  it('handles rows without a category', () => {
    expect(fitTaxonomyTags({
      available: 105, gap: 5, leading: [],
      tags: [50, 50, 50],
      overflowWidth,
    })).toBe(1)
  })

  it('wires the card footer and table cells to the overflow-safe layout', () => {
    const list = readFileSync('src/renderer/components/prompt-management/PromptList.vue', 'utf8')
    const taxonomy = readFileSync('src/renderer/components/prompt-management/PromptCardTaxonomy.vue', 'utf8')

    expect(list).toContain('<PromptCardTaxonomy')
    expect(taxonomy).toContain('fitTaxonomyTags(')
    expect(taxonomy).toContain('ResizeObserver')
    // 表格分类名单独包一层 NEllipsis，才能真正出现省略号并在悬停时显示全名
    expect(list).toMatch(/h\(NEllipsis, \{ class: 'table-category-name'/)
    expect(list).toMatch(/h\(NFlex, \{ size: 5, wrap: false, align: 'center', class: 'table-tags' \}/)
  })
})
