import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const promptPage = read('src/renderer/pages/mobile/MobilePromptPage.vue')
const filterSheet = read('src/renderer/components/mobile/prompt/MobilePromptFilterSheet.vue')

describe('移动端提示词列表布局（V5-M-List）', () => {
  it('卡片标题单行显示并使用省略号，没有标题时用正文第一行代替', () => {
    expect(promptPage).toContain("promptDisplayTitle(prompt, t('promptLibrary.untitled'))")

    const titleStyle = promptPage.match(/\.prompt-card__title\s*\{([^}]*)\}/)?.[1] || ''
    expect(titleStyle).toContain('white-space: nowrap')
    expect(titleStyle).toContain('text-overflow: ellipsis')
    expect(titleStyle).toContain('overflow: hidden')
  })

  it('大标题下显示条数和今天的使用次数', () => {
    expect(promptPage).toContain("import { countPromptUsageToday } from '~/lib/utils/prompt-usage'")
    expect(promptPage).toContain("t('mobilePrompt.listCount', { count: libraryTotal.value })")
    expect(promptPage).toContain("t('mobilePrompt.usedToday', { count: usedToday.value })")
  })

  it('页面自带 AI 入口卡片和新建悬浮按钮，不再依赖旧的浮动导航', () => {
    expect(promptPage).toMatch(/class="ai-entry" @click="navigateToAIGenerator"/)
    expect(promptPage).toMatch(/class="m-fab"[^>]*@click="handleCreate"/)
    expect(promptPage).not.toMatch(/floating-prompt-actions|mobile-floating-nav|useCollapsingHeader/)
  })

  it('保留下拉刷新、无限加载和左滑编辑删除', () => {
    expect(promptPage).toContain('<ion-refresher slot="fixed" @ionRefresh="handleRefresh">')
    expect(promptPage).toContain('@ionInfinite="loadMore"')
    expect(promptPage).toMatch(/<ion-item-options side="end">[\s\S]*?handleEdit\(prompt\)[\s\S]*?handleDelete\(prompt\)/)
  })

  it('筛选面板覆盖显示方式、排序、分类、标签和收藏，改动后列表立即重新加载', () => {
    for (const binding of ['v-model:view-mode', 'v-model:sort-type', 'v-model:category', 'v-model:tag', 'v-model:favorites-only']) {
      expect(promptPage).toContain(binding)
    }
    expect(promptPage).toContain('watch([selectedCategory, selectedTag, showFavoritesOnly, sortType], () => {')
    expect(filterSheet).toContain("t('mobilePrompt.showResults', { count: resultCount })")
    expect(filterSheet).toContain("@click=\"emit('reset')\"")
  })
})
