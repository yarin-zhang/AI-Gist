/**
 * 移动端细节（Gitea issue #477）：
 * 1. 首页列表底部给悬浮新建按钮留出空间；
 * 2. 使用页图片预览居中、有关闭按钮、能下滑关闭；
 * 3. 没填标题时自动标题去掉 {{变量}} 语法，卡片摘要不再重复标题；
 * 4. AI 生成页手动保存后留在对话里；
 * 5. 编辑页描述在底部面板里编辑，不再用系统弹窗。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { autoPromptTitle, plainTemplateText, promptSnippet } from '~/components/mobile/prompt/prompt-meta'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('列表底部避让悬浮按钮', () => {
  const css = read('src/renderer/assets/styles/mobile-v5.css')
  const promptPage = read('src/renderer/pages/mobile/MobilePromptPage.vue')

  it('有悬浮按钮的列表底部留白包含按钮高度', () => {
    expect(css).toMatch(/--m-fab-clearance:\s*calc\(var\(--m-tabbar-clearance\) \+ 22px \+ 56px\)/)
    expect(css).toMatch(/\.m-body--fab\s*\{\s*padding-bottom:\s*calc\(var\(--m-fab-clearance\)/)
    // 悬浮按钮的位置和留白用的是同一组尺寸
    expect(css).toMatch(/\.m-fab\s*\{[^}]*bottom:\s*calc\(var\(--m-tabbar-clearance\) \+ 22px\)[^}]*height:\s*56px/)
    expect(promptPage).toContain('class="m-body m-body--tabbed m-body--fab list-body"')
  })
})

describe('使用页图片预览', () => {
  const page = read('src/renderer/pages/mobile/MobilePromptDetailPage.vue')

  it('不再把图片放进 ion-content，用自己的容器在安全区内居中', () => {
    const modal = page.match(/<ion-modal[^>]*image-preview-modal[\s\S]*?<\/ion-modal>/)?.[0] || ''
    expect(modal).not.toContain('<ion-content')
    expect(modal).toContain('class="preview-shell"')
    expect(page).toMatch(/\.preview-shell\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/)
    expect(page).toMatch(/\.preview-shell\s*\{[^}]*safe-area-inset-top/)
  })

  it('有带无障碍名称的关闭按钮，也能下滑关闭', () => {
    expect(page).toMatch(/class="preview-close" :aria-label="t\('common.close'\)" @click.stop="closeImagePreview"/)
    expect(page).toMatch(/@touchstart="onPreviewTouchStart"[\s\S]*@touchend="onPreviewTouchEnd"/)
    expect(page).toContain('if (previewDrag.value > PREVIEW_DISMISS_DISTANCE) closeImagePreview()')
  })
})

describe('没填标题时的自动标题', () => {
  it('去掉变量语法，只留变量名', () => {
    expect(autoPromptTitle('帮我把 {{主题}} 做成一张小红书封面，风格 {{风格}}', '未命名'))
      .toBe('帮我把 主题 做成一张小红书封面，风格 风格')
    expect(plainTemplateText('Write a {{ tone }} email {% if formal %}politely{% endif %}')).toBe('Write a tone email politely')
  })

  it('取第一行有字的内容，太长时截短，没有内容时用兜底标题', () => {
    expect(autoPromptTitle('\n\n第二行才有字\n第三行', '未命名')).toBe('第二行才有字')
    expect(autoPromptTitle('a'.repeat(40), '未命名')).toBe(`${'a'.repeat(30)}…`)
    expect(autoPromptTitle('{% if x %}{% endif %}\n', '未命名')).toBe('未命名')
  })

  it('标题是从第一行自动生成的时候，卡片摘要从第二行开始，不重复标题', () => {
    const content = '帮我把 {{主题}} 做成一张小红书封面，风格 {{风格}}'
    expect(promptSnippet({ title: autoPromptTitle(content, ''), content, description: '' })).toBe('')
    // 早先直接用原文当标题的旧数据
    expect(promptSnippet({ title: content, content, description: '' })).toBe('')
    // 截短的自动标题
    const long = `${'很长的第一行'.repeat(8)}\n第二行`
    expect(promptSnippet({ title: autoPromptTitle(long, ''), content: long, description: '' })).toBe('第二行')
  })

  it('用户自己写的标题、有描述时，摘要照旧', () => {
    expect(promptSnippet({ title: '封面', content: '第一行\n第二行', description: '' })).toBe('第一行 第二行')
    expect(promptSnippet({ title: '', content: '第一行\n第二行', description: '' })).toBe('第二行')
    expect(promptSnippet({ title: '第一行', content: '第一行', description: '描述' })).toBe('描述')
  })

  it('编辑页保存时用这套自动标题', () => {
    const form = read('src/renderer/components/mobile/prompt/useMobilePromptForm.ts')
    expect(form).toContain('form.value.title.trim() || autoPromptTitle(form.value.content, options.fallbackTitle)')
  })
})

describe('AI 生成页手动保存', () => {
  const page = read('src/renderer/pages/mobile/MobileAIGeneratorPage.vue')

  it('保存后留在对话里，不再直接返回列表', () => {
    const savePrompt = page.match(/const savePrompt = async[\s\S]*?\n\}\n/)?.[0] || ''
    expect(savePrompt).toContain('await persist(turn)')
    expect(savePrompt).not.toContain('finishAndReturnToPrompts')
    // 保存过的最新结果显示「编辑 / 完成」，「完成」才返回列表
    expect(page).toMatch(/<template v-if="isSaved\(turn\)">[\s\S]*?@click="editSaved"[\s\S]*?@click="finishAndReturnToPrompts"/)
  })
})

describe('编辑页描述', () => {
  const page = read('src/renderer/pages/mobile/MobilePromptEditPage.vue')

  it('在底部面板里编辑，文本框随内容撑高', () => {
    expect(page).toContain('@click="showDescriptionSheet = true"')
    expect(page).toMatch(/<ion-modal class="m-sheet-modal" :is-open="showDescriptionSheet"[\s\S]*?<textarea ref="descriptionRef" v-model="form.description"[\s\S]*?@input="autoGrowDescription"/)
    expect(page).not.toMatch(/name: 'description',\s*type: 'textarea'/)
  })
})
