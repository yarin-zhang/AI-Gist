/**
 * #473：英文 / 意大利语 / 日语下的溢出和截断。这里按源码断言关键的布局规则，
 * 实际效果在 390 / 360 宽度下用浏览器逐页检查过。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const styles = (path: string) => [...read(path).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')

describe('移动端长文字布局', () => {
  it('设置行：右侧的值可以收缩省略，标题至少保留最长一个词，不在单词中间拆开', () => {
    const css = read('src/renderer/assets/styles/mobile-v5.css')
    expect(css).toMatch(/\.m-row > \.end \{[^}]*flex: 0 1 auto;[^}]*min-width: 0;/)
    expect(css).toMatch(/\.m-row:has\(> \.end > span:not\(\.m-pill\)\) > \.title \{\s*min-width: min-content;/)
  })

  it('编辑页工具栏放不下时换行，字数靠右', () => {
    const css = styles('src/renderer/pages/mobile/MobilePromptEditPage.vue')
    expect(css).toMatch(/\.editor-toolbar \{[^}]*flex-wrap: wrap;/)
    expect(css).toMatch(/\.editor-toolbar__meta \{[^}]*margin-left: auto;/)
  })

  it('筛选面板里的长分类、长标签不超出面板，末尾省略', () => {
    const sheet = read('src/renderer/components/mobile/prompt/MobilePromptFilterSheet.vue')
    expect(sheet).toContain('<span class="filter-sheet__label">{{ item.name }}</span>')
    expect(styles('src/renderer/components/mobile/prompt/MobilePromptFilterSheet.vue')).toMatch(/\.filter-sheet__chips \.m-chip \{[^}]*max-width: 100%;/)
  })

  it('试运行和 AI 生成的模型胶囊：图标不被挤小，先显示模型名', () => {
    expect(styles('src/renderer/components/mobile/prompt/MobileTryRunSheet.vue')).toMatch(/\.run-sheet__model ion-icon \{\s*flex: none;/)
    expect(styles('src/renderer/pages/mobile/MobileAIGeneratorPage.vue')).toMatch(/\.composer__model ion-icon \{\s*flex: none;/)
    expect(read('src/renderer/components/mobile/prompt/useMobileModels.ts')).toContain('`${current.model} · ${current.config.name}`')
  })

  it('首页列表行和双列卡片里的长分类名以省略号结尾', () => {
    expect(styles('src/renderer/pages/mobile/MobilePromptPage.vue')).toMatch(/\.prompt-row__caption \{[^}]*text-overflow: ellipsis;/)
    expect(styles('src/renderer/components/mobile/MobileWaterfallView.vue')).toMatch(/\.waterfall__category \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/)
  })
})
