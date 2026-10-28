import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// #453：放用户数据的 .ui-tag 要把文字套进 .ui-tag__text，空间不够时省略、悬停 title 给全文
const read = (path: string) => readFileSync(path, 'utf8')
const HEADER = read('src/renderer/components/prompts/PromptHeader.vue')
const DEFINITIONS = read('src/renderer/components/prompts/VariableDefinitionList.vue')
const USAGE = read('src/renderer/components/prompts/UsageHistoryDrawer.vue')
const MODEL = read('src/renderer/components/models/ModelDetail.vue')

/** 取出某个 v-for 标签从开始到结束的整段模板 */
const tagBlock = (source: string, marker: string) => {
  const start = source.indexOf(marker)
  expect(start, marker).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('</span>', source.indexOf('ui-tag__text', start)) + 7)
}

describe('user data tags shrink with an ellipsis and show the full text on hover (#453)', () => {
  it('prompt header category and tags, in both view and edit mode', () => {
    expect(HEADER).toContain('<span v-if="currentCategory" class="ui-tag" :title="currentCategory.name">')
    expect(HEADER).toContain('<span class="ui-tag__text">{{ currentCategory.name }}</span>')
    const tagTitles = HEADER.match(/<span v-for="tag in form\.tags" :key="tag" class="ui-tag" :title="`#\$\{tag\}`">/g) || []
    expect(tagTitles).toHaveLength(2)
    expect(HEADER.match(/<span class="ui-tag__text">#\{\{ tag \}\}<\/span>/g) || []).toHaveLength(2)
    // 编辑模式的分类按钮本身已经截断，悬停也给全名
    expect(HEADER).toContain(':title="currentCategory?.name || t(\'promptLibrary.uncategorized\')"')
    // 描述和标题一样，没有空格的超长文字也会换行（#465 的相邻处）
    expect(HEADER).toMatch(/\.prompt-header__description \{[^}]*overflow-wrap: anywhere/)
  })

  it('variable options in the definition list', () => {
    const block = tagBlock(DEFINITIONS, 'v-for="(option, index) in variable.options || []"')
    expect(block).toContain(':title="option"')
    expect(block).toContain('<span class="ui-tag__text">{{ option }}</span>')
  })

  it('filled values in the usage history drawer', () => {
    const block = tagBlock(USAGE, 'v-for="[name, value] in valueEntries(record)"')
    expect(block).toContain(":title=\"t('promptUsage.valuePair', { name, value })\"")
    expect(block).toContain("<span class=\"ui-tag__text\">{{ t('promptUsage.valuePair', { name, value }) }}</span>")
    // 不再硬切到 40 个字（切掉了也看不出来），由样式省略
    expect(USAGE).not.toContain('.slice(0, 40)')
  })

  it('model IDs in the model detail', () => {
    const block = tagBlock(MODEL, 'v-for="model in modelOptions"')
    expect(block).toContain(':title="model.value"')
    expect(block).toContain('<span class="ui-tag__text">{{ model.value }}</span>')
  })
})
