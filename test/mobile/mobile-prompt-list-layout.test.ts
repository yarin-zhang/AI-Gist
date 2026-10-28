import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const promptPage = read('src/renderer/pages/mobile/MobilePromptPage.vue')
const waterfall = read('src/renderer/components/mobile/MobileWaterfallView.vue')
const filterSheet = read('src/renderer/components/mobile/prompt/MobilePromptFilterSheet.vue')

describe('移动端提示词首页（V5-M-List / V5-M-ListRows）', () => {
  it('默认双列，标题栏右侧是搜索、切换显示方式和筛选三个圆按钮，不再显示条数副标题', () => {
    expect(promptPage).toContain("return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'waterfall'")
    expect(promptPage).toContain('@click="toggleSearch"')
    expect(promptPage).toContain("@click=\"viewMode = viewMode === 'waterfall' ? 'list' : 'waterfall'\"")
    expect(promptPage).toContain('@click="openFilterSheet"')
    expect(promptPage).not.toContain('mobilePrompt.usedToday')
    expect(promptPage).not.toContain(':subtitle=')
  })

  it('搜索框点放大镜才展开，「取消」清空并收起', () => {
    expect(promptPage).toContain('<div v-if="searchOpen" class="search-row">')
    expect(promptPage).toMatch(/const closeSearch = \(\) => \{\s*searchOpen\.value = false/)
  })

  it('分类用文字页签切换：全部 / 收藏 / 各分类三选一', () => {
    expect(promptPage).toContain('<nav ref="scopeTabsRef" class="m-tabs"')
    expect(promptPage).toMatch(/const selectScope = \(scope[^)]*\) => \{\s*selectedCategory\.value = typeof scope === 'number' \? scope : null\s*showFavoritesOnly\.value = scope === 'favorites'/)
  })

  it('列表行标题单行省略，第二行是分类和变量数，有附图的带缩略图', () => {
    expect(promptPage).toContain("promptDisplayTitle(prompt, t('promptLibrary.untitled'))")
    const titleStyle = promptPage.match(/\.prompt-row__title\s*\{([^}]*)\}/)?.[1] || ''
    expect(titleStyle).toContain('white-space: nowrap')
    expect(titleStyle).toContain('text-overflow: ellipsis')
    expect(promptPage).toContain('class="prompt-row__thumb"')
    expect(promptPage).toContain("`${category} · ${t('promptLibrary.variableCount', { count })}`")
  })

  it('双列卡片：有附图的以图作封面，没有的显示正文摘录并标出变量', () => {
    expect(waterfall).toContain('class="m-wf"')
    expect(waterfall).toContain('<span v-if="segment.variable" class="m-var m-var--name">{{ segment.text }}</span>')
    expect(waterfall).toContain('usePromptCovers(() => props.prompts)')
  })

  it('底部是「AI 生成」胶囊和圆形新建按钮，不再有 AI 入口卡片和悬浮按钮', () => {
    expect(promptPage).toMatch(/class="m-ai" @click="navigateToAIGenerator"/)
    expect(promptPage).toMatch(/class="m-add"[^>]*@click="handleCreate"/)
    expect(promptPage).not.toMatch(/ai-entry|class="m-fab"|m-wash/)
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
    // 显示方式里双列排在前面
    expect(filterSheet.indexOf("'update:viewMode', 'waterfall'")).toBeLessThan(filterSheet.indexOf("'update:viewMode', 'list'"))
  })
})
