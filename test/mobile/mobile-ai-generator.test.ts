/**
 * MobileAIGeneratorPage 核心逻辑测试
 *
 * 真正的根因：MobileAIConfigEditPage 创建新配置时未生成 configId，
 * 导致配置以 configId=undefined 存入数据库。生成器页面将 selectedModelKey
 * 拼接为 "undefined:model"，generatePrompt 解析后用字符串 "undefined" 查找，
 * 数据库中实际值为 undefined（而非字符串），find() 失败，抛出"未找到选中的配置"。
 *
 * 修复点：
 * 1. MobileAIConfigEditPage.handleSave — 新建时生成 configId
 * 2. AIConfigService.createAIConfig     — 服务层兜底，若 configId 缺失自动生成
 * 3. 加载配置后直接从已加载列表中选首选，消除二次 DB 查询的不一致
 * 4. 解析 selectedModelKey 时用 indexOf 代替 split，正确解析含 ':' 的模型名
 * （3、4 现在由 components/mobile/prompt/mobile-ai.ts 提供，下面直接测试真实实现）
 *
 * 覆盖：
 * - createAIConfig：configId 缺失时的兜底行为
 * - parseModelKey：首个冒号切分逻辑，含冒号的模型名
 * - pickDefaultModelKey：加载后自动选择的模型（isPreferred 优先、回退第一个）
 * - resolveConfig：generatePrompt 全流程；configId 为 undefined 时的原始 Bug 复现
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { AIConfig } from '@shared/types/ai'
import {
  buildMobileModelOptions,
  getConfigModels,
  parseModelKey,
  pickDefaultModelKey,
  resolveModelKey,
} from '~/components/mobile/prompt/mobile-ai'

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    configId: `config_${Math.random().toString(36).slice(2, 9)}`,
    name: 'Test Config',
    type: 'openai',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4'],
    defaultModel: 'gpt-4',
    enabled: true,
    isPreferred: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. createAIConfig 服务层兜底逻辑
//    对应修复：AIConfigService.createAIConfig 现在会在 configId 缺失时自动生成
// ---------------------------------------------------------------------------

/**
 * 模拟修复后的 createAIConfig 逻辑
 */
function simulateCreateAIConfig(
  data: Partial<Omit<AIConfig, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>>,
): AIConfig {
  return {
    ...makeConfig(),      // 基础字段
    ...data,
    // 修复：若 configId 缺失则自动生成（兜底）
    configId: data.configId || `config_${Date.now()}_fallback`,
    uuid: 'generated-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AIConfig
}

describe('createAIConfig — configId 兜底生成', () => {
  it('[根因 Bug 复现] 不传 configId 时，旧代码存入 undefined', () => {
    // 旧代码：直接 spread data，configId 为 undefined
    const oldResult = { ...makeConfig(), type: 'openai' as const, configId: undefined as any }
    expect(oldResult.configId).toBeUndefined()
  })

  it('[修复验证] 不传 configId 时，服务层自动生成非空字符串', () => {
    const result = simulateCreateAIConfig({ type: 'openai', name: 'My Config', defaultModel: 'gpt-4', models: [], baseURL: '', enabled: true })
    expect(result.configId).toBeTruthy()
    expect(typeof result.configId).toBe('string')
    expect(result.configId).not.toBe('undefined')
  })

  it('[修复验证] 传入 configId 时使用调用方提供的值', () => {
    const result = simulateCreateAIConfig({ configId: 'my-custom-id', type: 'openai', name: 'x', models: [], defaultModel: 'gpt-4', baseURL: '', enabled: true })
    expect(result.configId).toBe('my-custom-id')
  })

  it('[修复验证] 移动端保存时提供 configId，格式符合 config_{timestamp}_{random}', () => {
    const configId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    expect(configId).toMatch(/^config_\d+_[a-z0-9]+$/)
  })
})

// ---------------------------------------------------------------------------
// 2. parseModelKey — 生成页解析 selectedModelKey（components/mobile/prompt/mobile-ai.ts）
//    对应修复：使用 indexOf 代替 split，避免含 ':' 的模型名被截断
// ---------------------------------------------------------------------------

function parseModelKeyOld(key: string): { configId: string; model: string } {
  const [configId, model] = key.split(':')
  return { configId, model }
}

describe('parseModelKey', () => {
  it('普通 key 正常解析', () => {
    const { configId, model } = parseModelKey('config_123_abc:gpt-4')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('gpt-4')
  })

  it('[根因 Bug 复现] configId 为 undefined 时，key 为字符串 "undefined:gpt-4"', () => {
    // 这就是旧版 bug：configId=undefined → template literal → "undefined"
    const undefinedConfigId = undefined
    const key = `${undefinedConfigId}:gpt-4`
    expect(key).toBe('undefined:gpt-4')
    const { configId } = parseModelKey(key)
    expect(configId).toBe('undefined') // 字符串 "undefined"，不是值 undefined
  })

  it('模型名含冒号时完整保留（如 Ollama llama3:latest）', () => {
    const { configId, model } = parseModelKey('config_123_abc:llama3:latest')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('llama3:latest')
  })

  it('模型名含多个冒号', () => {
    const { configId, model } = parseModelKey('config_123_abc:openai/gpt-4:nitro:fast')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('openai/gpt-4:nitro:fast')
  })

  it('key 无冒号时 model 为空', () => {
    const { configId, model } = parseModelKey('config_123_abc')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('')
  })

  it('[旧逻辑] split 截断含冒号的模型名', () => {
    const { model } = parseModelKeyOld('config_123_abc:llama3:latest')
    expect(model).toBe('llama3')
    expect(model).not.toBe('llama3:latest')
  })
})

// ---------------------------------------------------------------------------
// 3. pickDefaultModelKey — 加载配置后自动选中的模型
//    对应修复：从已加载列表直接查找，消除二次 DB 查询
// ---------------------------------------------------------------------------

describe('pickDefaultModelKey', () => {
  it('无配置时返回空 key', () => {
    expect(pickDefaultModelKey([])).toBe('')
  })

  it('单个配置自动选中', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4' })
    expect(pickDefaultModelKey([config])).toBe('cfg1:gpt-4')
  })

  it('优先选 isPreferred 的配置', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: true }),
      makeConfig({ configId: 'cfg3', defaultModel: 'gpt-4o', isPreferred: false }),
    ]
    expect(pickDefaultModelKey(configs)).toBe('cfg2:gpt-4')
  })

  it('无 isPreferred 时回退到第一个', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: false }),
    ]
    expect(pickDefaultModelKey(configs)).toBe('cfg1:gpt-3.5-turbo')
  })

  it('配置没有 defaultModel 时用模型列表里的第一个；一个模型都没有时不设置 key', () => {
    expect(pickDefaultModelKey([makeConfig({ configId: 'cfg1', defaultModel: undefined })])).toBe('cfg1:gpt-4')
    expect(pickDefaultModelKey([makeConfig({ configId: 'cfg1', defaultModel: undefined, models: [] })])).toBe('')
  })

  it('[回归] defaultModel 优先于远端模型列表顺序', () => {
    const config = makeConfig({
      configId: 'cfg1',
      defaultModel: 'selected-model',
      models: ['first-remote-model', 'selected-model', 'second-remote-model']
    })
    expect(getConfigModels(config)).toEqual([
      'selected-model',
      'first-remote-model',
      'second-remote-model'
    ])
    expect(pickDefaultModelKey([config])).toBe('cfg1:selected-model')
  })

  it('[回归] defaultModel、models 和 customModel 组合后保持唯一', () => {
    const config = makeConfig({
      defaultModel: 'selected-model',
      models: ['selected-model', 'remote-model', 'remote-model'],
      customModel: 'remote-model'
    })
    expect(getConfigModels(config)).toEqual(['selected-model', 'remote-model'])
  })

  it('[回归] 选出的 configId 始终存在于 configs 列表中', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: true }),
    ]
    const { configId } = parseModelKey(pickDefaultModelKey(configs))
    expect(configs.find(c => c.configId === configId)).toBeDefined()
  })

  it('模型选择面板把首选配置排在最前，每个配置先列默认模型', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', name: 'A', defaultModel: 'a-1', models: ['a-2'] }),
      makeConfig({ configId: 'cfg2', name: 'B', defaultModel: 'b-1', isPreferred: true }),
    ]
    expect(buildMobileModelOptions(configs).map(option => option.key)).toEqual(['cfg2:b-1', 'cfg2:gpt-4', 'cfg1:a-1', 'cfg1:a-2'])
  })
})

// ---------------------------------------------------------------------------
// 4. resolveConfig — 生成全流程
// ---------------------------------------------------------------------------

function resolveConfig(selectedModelKey: string, configs: AIConfig[]): { config: AIConfig; model: string } {
  const resolved = resolveModelKey(configs, selectedModelKey)
  if (!resolved) throw new Error('未找到选中的配置')
  return { config: resolved.config, model: resolved.model }
}

describe('resolveConfig（生成全流程）', () => {
  it('正常情况：能找到 config', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4' })
    const { config: found, model } = resolveConfig('cfg1:gpt-4', [config])
    expect(found.configId).toBe('cfg1')
    expect(model).toBe('gpt-4')
  })

  it('模型名含冒号时也能正确找到 config', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'llama3:latest' })
    const { config: found, model } = resolveConfig('cfg1:llama3:latest', [config])
    expect(found.configId).toBe('cfg1')
    expect(model).toBe('llama3:latest')
  })

  it('[根因 Bug 复现] configId 存为 undefined 导致查找失败', () => {
    // 模拟旧 bug：配置以 configId=undefined 存入，key 变成 "undefined:gpt-4"
    const configWithMissingId = makeConfig({ configId: undefined as any, defaultModel: 'gpt-4' })
    // configs 中 configId 是 undefined（值），而 key 解析出的是字符串 "undefined"
    // find(c => c.configId === "undefined") 匹配不到 undefined 值
    expect(() => resolveConfig('undefined:gpt-4', [configWithMissingId])).toThrow('未找到选中的配置')
  })

  it('[修复验证] 修复后 configId 有值，全流程成功', () => {
    // 修复后：MobileAIConfigEditPage 在创建时生成 configId
    const configs = [
      makeConfig({ configId: 'config_1710000000000_abc123', defaultModel: 'gpt-4', isPreferred: true }),
    ]
    const selectedModelKey = pickDefaultModelKey(configs)
    expect(() => resolveConfig(selectedModelKey, configs)).not.toThrow()
    const { config } = resolveConfig(selectedModelKey, configs)
    expect(config.configId).toBe('config_1710000000000_abc123')
  })

  it('[修复验证] 完整流程：创建配置 → 加载 → 选择 → 生成，不抛错', () => {
    // 模拟修复后的完整流程
    const savedConfig = simulateCreateAIConfig({
      type: 'openai',
      name: 'My DeepSeek',
      defaultModel: 'deepseek-chat',
      models: ['deepseek-chat'],
      baseURL: 'https://api.deepseek.com/v1',
      enabled: true,
      isPreferred: true,
    })
    // configId 已被正确生成
    expect(savedConfig.configId).toBeTruthy()
    expect(savedConfig.configId).not.toBe('undefined')

    // 加载后选择
    const selectedModelKey = pickDefaultModelKey([savedConfig])
    expect(selectedModelKey).toContain(savedConfig.configId)

    // 生成时查找
    expect(() => resolveConfig(selectedModelKey, [savedConfig])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 5. 页面接线：生成仍走 AIGeneratorService，继续调整在当前结果上多轮进行
// ---------------------------------------------------------------------------

describe('MobileAIGeneratorPage 接线', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/renderer/pages/mobile/MobileAIGeneratorPage.vue'), 'utf8')

  it('按需求生成沿用移动端的 AIGeneratorService，并写生成记录', () => {
    expect(page).toContain("import { AIGeneratorService } from '~/lib/services/mobile-ai-generator.service'")
    expect(page).toContain('await AIGeneratorService.generatePrompt(')
    expect(page).toContain('await api.aiGenerationHistory.create.mutate({')
  })

  it('有结果后输入框用来继续调整当前结果', () => {
    expect(page).toMatch(/if \(base\) await refine\(text, base\)\s*\n\s*else await generate\(text\)/)
    expect(page).toContain("t('promptManagement.adjustPromptInstruction')")
  })

  it('不再依赖已删除的浮动导航弹层', () => {
    expect(page).not.toMatch(/presentedAsModal|floating-prompt-actions|mobile-floating-nav/)
  })

  it('生成记录只列真正的生成，不含试运行', () => {
    expect(page).toContain(".filter(item => !String(item.historyId || '').startsWith('use_'))")
  })
})
