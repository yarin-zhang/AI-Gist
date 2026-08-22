import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const setupIonic = readFileSync('src/renderer/setup-ionic.ts', 'utf8')

describe('网页移动版 Ionic 模式', () => {
  it('只为 Web 平台固定使用 iOS 模式', () => {
    expect(setupIonic).toContain("import { PlatformDetector } from '@shared/platform'")
    expect(setupIonic).toContain("PlatformDetector.isWeb() ? { mode: 'ios' as const } : undefined")
    expect(setupIonic).toContain('app.use(IonicVue, ionicConfig)')
  })
})
