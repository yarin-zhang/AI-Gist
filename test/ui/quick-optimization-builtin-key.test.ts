import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/renderer/i18n'
import { QuickOptimizationService } from '../../src/renderer/lib/services/quick-optimization.service'
import {
  DEFAULT_QUICK_OPTIMIZATION_ACTIONS,
  buildDefaultQuickOptimizationConfigs,
  isUnmodifiedBuiltinQuickOptimization,
  resolveQuickOptimizationBuiltinKey
} from '../../src/renderer/lib/services/quick-optimization-defaults'
import {
  getCloudSyncCategoryMergeMessages,
  getCloudSyncJoinCategoryLine,
  getCloudSyncJoinMessageLines
} from '../../src/renderer/lib/utils/cloud-sync-merge-notices'

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const

afterEach(() => {
  i18n.global.locale.value = 'zh-CN'
  vi.restoreAllMocks()
})

describe('默认快速优化动作的内置标识 (#490)', () => {
  it('预置的每个默认动作都带固定的 builtinKey，和界面语言无关', () => {
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      expect(buildDefaultQuickOptimizationConfigs().map(item => item.builtinKey))
        .toEqual(DEFAULT_QUICK_OPTIMIZATION_ACTIONS.map(action => action.key))
    }
  })

  it('认得出 5 种语言和旧版写死的中文默认动作，改过名称或模板的认不出', () => {
    for (const locale of LOCALES) {
      i18n.global.locale.value = locale
      for (const config of buildDefaultQuickOptimizationConfigs()) {
        expect(resolveQuickOptimizationBuiltinKey({ name: ` ${config.name} `, prompt: `${config.prompt}\n` })).toBe(config.builtinKey)
        expect(resolveQuickOptimizationBuiltinKey({ name: `${config.name}!`, prompt: config.prompt })).toBeUndefined()
        expect(resolveQuickOptimizationBuiltinKey({ name: config.name, prompt: `${config.prompt} 再加一句` })).toBeUndefined()
      }
    }
    expect(resolveQuickOptimizationBuiltinKey({
      name: '更简短',
      prompt: '请将以下提示词优化得更加简短和精炼，保留核心要求，去除冗余内容：\n\n{{content}}'
    })).toBe('shorter')
    // 名称和模板来自不同的动作，不算默认动作
    i18n.global.locale.value = 'en-US'
    const [shorter, richer] = buildDefaultQuickOptimizationConfigs()
    expect(resolveQuickOptimizationBuiltinKey({ name: shorter.name, prompt: richer.prompt })).toBeUndefined()
  })

  describe('编辑默认动作', () => {
    let service: QuickOptimizationService
    let existing: any
    let update: ReturnType<typeof vi.fn>

    beforeEach(() => {
      i18n.global.locale.value = 'en-US'
      const [shorter] = buildDefaultQuickOptimizationConfigs()
      existing = { ...shorter, id: 1, uuid: 'quick-1', enabled: true, sortOrder: 1 }
      service = QuickOptimizationService.getInstance()
      vi.spyOn(service, 'getQuickOptimizationConfigById').mockImplementation(async () => existing)
      update = vi.fn(async (_store: string, _id: number, data: any) => ({ ...existing, ...data }))
      vi.spyOn(service as any, 'update').mockImplementation(update as any)
    })

    it('改了名称、说明或模板就不再是内置动作，同步时不会被别的设备的默认动作覆盖', async () => {
      for (const change of [{ name: 'Short' }, { description: 'Mine' }, { prompt: 'Short: {{content}}' }]) {
        update.mockClear()
        await service.updateQuickOptimizationConfig(1, { ...existing, ...change })
        expect(update.mock.calls[0][2]).toHaveProperty('builtinKey', undefined)
      }
    })

    it('只开关、调整顺序或原样保存时保留内置标识', async () => {
      await service.updateQuickOptimizationConfig(1, { enabled: false })
      await service.updateQuickOptimizationConfig(1, { sortOrder: 3 })
      await service.updateQuickOptimizationConfig(1, {
        name: existing.name, description: existing.description, prompt: existing.prompt, enabled: true
      })
      for (const call of update.mock.calls) expect(call[2]).not.toHaveProperty('builtinKey')
      // 换成另一种语言的同一个默认动作也还算原样
      i18n.global.locale.value = 'ja-JP'
      const [shorterJa] = buildDefaultQuickOptimizationConfigs()
      expect(isUnmodifiedBuiltinQuickOptimization(shorterJa, 'shorter')).toBe(true)
      expect(isUnmodifiedBuiltinQuickOptimization(shorterJa, 'richer')).toBe(false)
    })
  })
})

describe('加入同步和分类合并的提示文案 (#490)', () => {
  const preview = {
    needsConfirmation: true,
    local: { prompts: 5, categories: 2 },
    remote: { prompts: 30, categories: 5 },
    merged: { prompts: 35, categories: 6 },
    sameNameCategories: ['写作']
  }

  it('确认框说明数量和会合并的同名分类，并写明选「暂不同步」的后果', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(getCloudSyncJoinMessageLines(preview)).toEqual([
      '本机和这个存储里都已经有数据。开始同步后两边会合并成一份，各自的提示词都会保留。',
      '',
      '提示词：本机 5 · 云端 30 · 合并后约 35',
      '分类：本机 2 · 云端 5 · 合并后约 6',
      '同名分类会合并为一个：「写作」',
      '',
      '选「暂不同步」会保存这个存储，但先不启用。'
    ])
    i18n.global.locale.value = 'en-US'
    expect(getCloudSyncJoinCategoryLine({ ...preview, sameNameCategories: ['A', 'B', 'C', 'D', 'E', 'F'] }))
      .toBe('Categories with the same name will be merged into one: “A”, “B”, “C”, “D”, “E” and others (6 in total)')
    expect(getCloudSyncJoinCategoryLine({ ...preview, sameNameCategories: [] })).toBe('')
  })

  it('同名分类合并后说明哪个分类、哪些字段以哪一边为准；只有内部字段不同时不提示', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(getCloudSyncCategoryMergeMessages({
      categoryMerges: [
        { name: '写作', keptSide: 'local', differingFields: ['color', 'description'] },
        { name: '生活', keptSide: 'remote', differingFields: ['sortOrder'] }
      ]
    })).toEqual(['同名分类「写作」已合并为一个，说明和颜色以本机的为准'])

    i18n.global.locale.value = 'en-US'
    const many = ['A', 'B', 'C', 'D'].map(name => ({ name, keptSide: 'remote' as const, differingFields: ['description'] }))
    expect(getCloudSyncCategoryMergeMessages({ categoryMerges: many })).toEqual([
      'The categories named “A” were merged into one. Kept the description from the cloud.',
      'The categories named “B” were merged into one. Kept the description from the cloud.',
      '2 more categories with the same name were merged. Where they differed, the newer copy was kept.'
    ])
    expect(getCloudSyncCategoryMergeMessages({})).toEqual([])
  })

  it('桌面和移动端添加存储时都先停用保存，看过两边的数据再启用', () => {
    for (const file of [
      'src/renderer/components/settings/DataSyncSettings.vue',
      'src/renderer/pages/mobile/settings/MobileStorageConfigPage.vue'
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/hasSyncedWithStorage\(editingId\)/)
      expect(source).toMatch(/joining \? \{ \.\.\.(data|payload), enabled: false \}/)
      expect(source).toMatch(/previewStorageJoin\(storageId\)/)
      expect(source).toMatch(/updateStorageConfig\(storageId, \{ enabled: true \}\)/)
      expect(source).toContain('getCloudSyncCategoryMergeMessages(result)')
    }
  })
})
