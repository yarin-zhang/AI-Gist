import { createApp, defineComponent, h, nextTick } from 'vue'
import { NButton, NTooltip } from 'naive-ui'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * 回归测试：Gitea issue #16 —— 快速优化提示词面板的快捷操作 chip
 * 曾经用 `:disabled="!config.description"` 控制"无描述时不弹出提示"。
 *
 * 在真实打包后的 Electron 生产环境（file:// 加载、CSS 提取为独立文件）
 * 里用 Chrome DevTools Protocol 直接派发真实鼠标事件验证过：当
 * `config.description` 是"非空但全是空白字符"的字符串（例如
 * `'   '`，可能来自绕过表单 trim 校验的写入路径，如备份导入/跨设备
 * 同步）时，naive-ui 的 NTooltip `disabled` 仍判定为“未禁用”，于是
 * 真的渲染出一个 `display:block` 但内容为空白的 `.n-tooltip` 弹出框，
 * 与 issue 截图中的空白提示框完全一致。
 *
 * 修复后的组件改用 `v-if="config.description?.trim()"` 包裹
 * NTooltip，本测试复刻同样的结构，确保：
 * 1. 描述是纯空白/未定义时，压根不渲染 NTooltip（不会有任何弹出框）。
 * 2. 描述有实际内容时，NTooltip 正常渲染且内容已 trim。
 */
describe('quick optimization chip tooltip never renders blank', () => {
  let app: ReturnType<typeof createApp> | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    app?.unmount()
    container?.remove()
    app = undefined
    container = undefined
  })

  const mountChip = (description: string | undefined) => {
    container = document.createElement('div')
    document.body.appendChild(container)

    app = createApp(defineComponent({
      setup: () => () => description?.trim()
        ? h(NTooltip, { show: true, to: false }, {
          trigger: () => h(NButton, { size: 'small', secondary: true }, { default: () => '更清晰' }),
          default: () => description.trim(),
        })
        : h(NButton, { size: 'small', secondary: true }, { default: () => '更清晰' }),
    }))

    app.mount(container)
  }

  it('renders no tooltip node at all for a whitespace-only description', async () => {
    mountChip('   ')
    await nextTick()
    await nextTick()

    expect(container!.querySelector('.n-tooltip')).toBeNull()
    expect(container!.querySelector('button')).not.toBeNull()
  })

  it('renders no tooltip node at all for an undefined description', async () => {
    mountChip(undefined)
    await nextTick()
    await nextTick()

    expect(container!.querySelector('.n-tooltip')).toBeNull()
    expect(container!.querySelector('button')).not.toBeNull()
  })

  it('renders a tooltip with trimmed, non-blank text for a real description', async () => {
    mountChip('  理顺逻辑并消除模糊表述  ')
    await nextTick()
    await nextTick()

    const tooltip = container!.querySelector('.n-tooltip')
    expect(tooltip).not.toBeNull()
    expect(tooltip!.textContent).toBe('理顺逻辑并消除模糊表述')
  })
})
