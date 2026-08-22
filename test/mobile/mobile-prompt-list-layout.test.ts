import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const promptPage = readFileSync(
  resolve(process.cwd(), 'src/renderer/pages/mobile/MobilePromptPage.vue'),
  'utf8'
)

describe('移动端提示词列表布局', () => {
  it('限制提示词标题最多显示两行并使用省略号', () => {
    expect(promptPage).toMatch(/<h2 class="prompt-title">\{\{ prompt\.title \|\| getFirstLineOfContent\(prompt\.content\) \}\}<\/h2>/)

    const titleStyle = promptPage.match(/\.prompt-title\s*\{([^}]*)\}/)?.[1] || ''
    expect(titleStyle).toContain('-webkit-line-clamp: 2')
    expect(titleStyle).toContain('text-overflow: ellipsis')
    expect(titleStyle).toContain('overflow: hidden')
  })
})
