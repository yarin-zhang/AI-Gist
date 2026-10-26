/**
 * 卡片底部「分类 + 标签 + +N」一行的空间分配。
 *
 * 规则：标签按完整宽度展示，放不下的整体收进 `+N`，而不是把每个标签都压成一个字；
 * 分类允许收缩到 `minWidth`（带省略号），把空间让给前面的标签。
 */
export interface TaxonomyFitInput {
    /** 这一行可用的总宽度 */
    available: number
    /** 相邻元素之间的间距 */
    gap: number
    /** 不可收缩的前置元素宽度（例如快捷键标签） */
    leading: number[]
    /** 分类标签：自然宽度与允许收缩到的最小宽度 */
    category?: { natural: number; minWidth: number }
    /** 各标签的自然宽度，按展示顺序 */
    tags: number[]
    /** 隐藏 `hidden` 个标签时 `+N` 的宽度 */
    overflowWidth: (hidden: number) => number
}

const rowWidth = (widths: number[], gap: number) => (
    widths.length ? widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1) : 0
)

/** 返回能完整显示的标签数量；其余标签收进 `+N` */
export function fitTaxonomyTags(input: TaxonomyFitInput): number {
    const { available, gap, leading, category, tags, overflowWidth } = input
    const fixed = category
        ? [...leading, Math.min(category.natural, category.minWidth)]
        : [...leading]

    for (let visible = tags.length; visible > 0; visible -= 1) {
        const hidden = tags.length - visible
        const widths = [...fixed, ...tags.slice(0, visible)]
        if (hidden > 0) widths.push(overflowWidth(hidden))
        if (rowWidth(widths, gap) <= available) return visible
    }
    return 0
}
