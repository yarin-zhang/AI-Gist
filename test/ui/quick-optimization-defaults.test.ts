import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/renderer/i18n'
import {
  QuickOptimizationService,
  buildDefaultQuickOptimizationConfigs,
} from '../../src/renderer/lib/services/quick-optimization.service'

const HAN = /[一-鿿]/

describe('default quick optimizations (#430)', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
    vi.restoreAllMocks()
  })

  it('follows the interface language instead of always being Chinese', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const) {
      i18n.global.locale.value = locale
      const defaults = buildDefaultQuickOptimizationConfigs()
      expect(defaults.map(item => item.enabled)).toEqual([true, true, true, true, false])
      for (const item of defaults) {
        expect(item.name).not.toMatch(/^quickOptimization\./)
        expect(item.prompt.match(/\{\{content\}\}/g)).toHaveLength(1)
        if (locale === 'en-US' || locale === 'it-IT') {
          expect(item.name).not.toMatch(HAN)
          expect(item.description).not.toMatch(HAN)
          expect(item.prompt).not.toMatch(HAN)
        }
      }
      // 「提取变量」要告诉模型变量的写法
      expect(defaults[3].prompt).toMatch(/\{\{[^}]+\}\}[\s\S]*\{\{content\}\}/)
    }
  })

  describe('first-use seeding', () => {
    let stored: any[]
    let service: QuickOptimizationService

    beforeEach(() => {
      localStorage.clear()
      stored = []
      service = QuickOptimizationService.getInstance()
      vi.spyOn(service, 'getAllQuickOptimizationConfigs').mockImplementation(async () => stored)
      vi.spyOn(service, 'createQuickOptimizationConfig').mockImplementation(async data => {
        const record = { ...data, id: stored.length + 1 } as any
        stored.push(record)
        return record
      })
    })

    it('adds the defaults once per device, even when called concurrently', async () => {
      i18n.global.locale.value = 'en-US'
      await Promise.all([service.ensureDefaultConfigs(), service.ensureDefaultConfigs()])
      expect(stored).toHaveLength(5)
      expect(stored[0].name).toBe('Shorter')

      // 用户删光之后不会再自动加回来
      stored = []
      await service.ensureDefaultConfigs()
      expect(stored).toHaveLength(0)
    })

    it('does not touch a list that already has actions', async () => {
      stored = [{ id: 1, name: 'Mine', prompt: '{{content}}', enabled: true, sortOrder: 1 }]
      await service.ensureDefaultConfigs()
      expect(stored).toHaveLength(1)
      expect(localStorage.getItem('ai-gist:quick-optimization-defaults-seeded')).toBe('1')
    })
  })

  it('only marks the name and template as required and confirms saves and deletes', () => {
    const modal = readFileSync('src/renderer/components/ai/QuickOptimizationConfigModal.vue', 'utf8')
    const api = readFileSync('src/renderer/lib/api/quick-optimization.api.ts', 'utf8')

    expect(modal).not.toContain('show-require-mark')
    expect(modal).toContain("t('quickOptimization.useDefaults')")
    expect(modal).toContain("'quickOptimization.workspace.created'")
    expect(modal).toContain("'quickOptimization.workspace.saved'")
    expect(modal).toContain("t('quickOptimization.workspace.deleted'")
    expect(api).toMatch(/getEnabled:[\s\S]*?ensureDefaultConfigs\(\)/)
  })
})
