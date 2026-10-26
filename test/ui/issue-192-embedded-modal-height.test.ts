/**
 * 回归测试：GitHub issue #192 —— 从卡片「编辑」直接打开提示词弹窗时，
 * 「补充信息 → 基本信息」区域只有正常高度的一半左右。
 *
 * 原因：嵌入式 CommonModal 用 getBoundingClientRect 量容器高度，而外层 NModal
 * 进场动画带 scale(0.5)，第一次测量拿到的是缩小后的尺寸；transform 恢复时
 * ResizeObserver 不会触发，contentHeight 就一直停在错误值上。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const commonModal = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/common/CommonModal.vue'),
  'utf8'
)

describe('Issue #192：嵌入式弹窗按布局高度计算内容区', () => {
  it('用不受 transform 影响的 offsetHeight 测量容器', () => {
    expect(commonModal).toContain('embeddedHeight.value = containerRef.value?.offsetHeight || 0')
    expect(commonModal).not.toMatch(/embeddedHeight\.value\s*=.*getBoundingClientRect/)
  })
})
