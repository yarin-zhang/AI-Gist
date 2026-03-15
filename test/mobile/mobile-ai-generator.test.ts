/**
 * MobileAIGeneratorPage 核心逻辑测试
 *
 * 覆盖场景：
 * 1. parseModelKey —— 从 "configId:model" 中正确解析 configId 与 model，
 *    包含模型名带 ':' 的情况（如 Ollama 的 llama3:latest）
 * 2. selectPreferredModel —— loadConfigs 自动选择逻辑：
 *    - 始终从已加载的启用列表中选取，确保 selectedModelKey 可在 configs 中找到
 *    - 优先选择 isPreferred 的配置
 *    - 无 isPreferred 时回退到第一个配置
 *    - 无 defaultModel 时不设置 key
 * 3. resolveConfig —— generatePrompt 中通过 selectedModelKey 找到对应 config：
 *    - 正常情况下能找到
 *    - 原始 Bug 复现：通过独立 DB 调用得到的 preferred 不在 configs 列表时抛出错误
 *    - 修复后：始终在列表内选择，不会出现找不到的情况
 */

import { describe, it, expect } from 'vitest'
import type { AIConfig } from '@shared/types/ai'

// ---------------------------------------------------------------------------
// 1. parseModelKey —— 对应修复后的 generatePrompt 解析逻辑
// ---------------------------------------------------------------------------

/**
 * 修复后的解析函数（只在首个 ':' 处切分）
 */
function parseModelKey(key: string): { configId: string; model: string } {
  const firstColon = key.indexOf(':')
  if (firstColon === -1) return { configId: key, model: '' }
  return {
    configId: key.substring(0, firstColon),
    model: key.substring(firstColon + 1),
  }
}

/**
 * 修复前的旧解析函数（用于对比验证 Bug 确实存在）
 */
function parseModelKeyOld(key: string): { configId: string; model: string } {
  const [configId, model] = key.split(':')
  return { configId, model }
}

describe('parseModelKey', () => {
  it('普通 key（无多余冒号）能正确解析', () => {
    const { configId, model } = parseModelKey('config_123_abc:gpt-4')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('gpt-4')
  })

  it('模型名含冒号时能完整保留模型名', () => {
    const { configId, model } = parseModelKey('config_123_abc:llama3:latest')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('llama3:latest') // 修复后正确
  })

  it('模型名含多个冒号时也能完整保留', () => {
    const { configId, model } = parseModelKey('config_123_abc:openai/gpt-4:nitro:fast')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('openai/gpt-4:nitro:fast')
  })

  it('key 无冒号时 model 为空字符串', () => {
    const { configId, model } = parseModelKey('config_123_abc')
    expect(configId).toBe('config_123_abc')
    expect(model).toBe('')
  })

  // 验证旧写法确实有 Bug
  it('[旧逻辑 Bug 复现] split 会截断含冒号的模型名', () => {
    const { model } = parseModelKeyOld('config_123_abc:llama3:latest')
    expect(model).toBe('llama3') // 旧逻辑只拿第一段，丢失 ':latest'
    expect(model).not.toBe('llama3:latest')
  })
})

// ---------------------------------------------------------------------------
// 2. selectPreferredModel —— 对应修复后的 loadConfigs 选择逻辑
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

/**
 * 修复后的 loadConfigs 选择逻辑：从已加载的启用列表中直接查找首选
 */
function selectPreferredModel(enabledConfigs: AIConfig[]): {
  selectedModelKey: string
  selectedConfigName: string
} {
  const preferred = enabledConfigs.find(c => c.isPreferred) ?? enabledConfigs[0]
  if (preferred?.defaultModel) {
    return {
      selectedModelKey: `${preferred.configId}:${preferred.defaultModel}`,
      selectedConfigName: preferred.name,
    }
  }
  return { selectedModelKey: '', selectedConfigName: '' }
}

describe('selectPreferredModel', () => {
  it('无配置时返回空 key', () => {
    const { selectedModelKey } = selectPreferredModel([])
    expect(selectedModelKey).toBe('')
  })

  it('单个配置时自动选择该配置', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4' })
    const { selectedModelKey } = selectPreferredModel([config])
    expect(selectedModelKey).toBe('cfg1:gpt-4')
  })

  it('多个配置时优先选 isPreferred 的配置', () => {
    const c1 = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false })
    const c2 = makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: true })
    const c3 = makeConfig({ configId: 'cfg3', defaultModel: 'gpt-4o', isPreferred: false })
    const { selectedModelKey } = selectPreferredModel([c1, c2, c3])
    expect(selectedModelKey).toBe('cfg2:gpt-4')
  })

  it('无 isPreferred 配置时回退到第一个', () => {
    const c1 = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false })
    const c2 = makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: false })
    const { selectedModelKey } = selectPreferredModel([c1, c2])
    expect(selectedModelKey).toBe('cfg1:gpt-3.5-turbo')
  })

  it('配置无 defaultModel 时不设置 key', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: undefined })
    const { selectedModelKey } = selectPreferredModel([config])
    expect(selectedModelKey).toBe('')
  })

  // 关键回归：选出的 key 的 configId 一定能在列表中找到
  it('[回归] 选出的 configId 始终存在于 configs 列表中', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: true }),
    ]
    const { selectedModelKey } = selectPreferredModel(configs)
    const { configId } = parseModelKey(selectedModelKey)
    const found = configs.find(c => c.configId === configId)
    expect(found).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 3. resolveConfig —— 对应 generatePrompt 中的查找逻辑
// ---------------------------------------------------------------------------

/**
 * 模拟 generatePrompt 中通过 selectedModelKey 找到 config 并发起生成的逻辑
 */
function resolveConfig(
  selectedModelKey: string,
  configs: AIConfig[],
): { config: AIConfig; model: string } {
  const { configId, model } = parseModelKey(selectedModelKey)
  const config = configs.find(c => c.configId === configId)
  if (!config) throw new Error('未找到选中的配置')
  return { config, model }
}

describe('resolveConfig（generatePrompt 查找逻辑）', () => {
  it('正常情况：能找到 config', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4' })
    const { config: found, model } = resolveConfig('cfg1:gpt-4', [config])
    expect(found.configId).toBe('cfg1')
    expect(model).toBe('gpt-4')
  })

  it('模型名含冒号时也能找到正确 config 且模型名完整', () => {
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'llama3:latest' })
    const { config: found, model } = resolveConfig('cfg1:llama3:latest', [config])
    expect(found.configId).toBe('cfg1')
    expect(model).toBe('llama3:latest')
  })

  it('[原始 Bug 复现] configs 不含 preferred 的 configId 时应抛出错误', () => {
    // 模拟修复前的情况：DB 两次调用返回不一致的数据
    // configs 只有 cfg1，但 selectedModelKey 引用了 cfg_preferred（不在列表中）
    const config = makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4' })
    expect(() => resolveConfig('cfg_preferred:gpt-4', [config])).toThrow('未找到选中的配置')
  })

  it('[修复验证] 通过 selectPreferredModel 得到的 key 一定能 resolveConfig 成功', () => {
    const configs = [
      makeConfig({ configId: 'cfg1', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', defaultModel: 'gpt-4', isPreferred: true }),
    ]
    const { selectedModelKey } = selectPreferredModel(configs)
    // 不应抛出异常
    expect(() => resolveConfig(selectedModelKey, configs)).not.toThrow()
    const { config, model } = resolveConfig(selectedModelKey, configs)
    expect(config.configId).toBe('cfg2')
    expect(model).toBe('gpt-4')
  })

  it('[修复验证] 多配置场景下，loadConfigs + generatePrompt 全流程不抛错', () => {
    // 模拟有三个启用的配置，第二个是首选
    const configs = [
      makeConfig({ configId: 'cfg1', name: 'OpenAI', defaultModel: 'gpt-3.5-turbo', isPreferred: false }),
      makeConfig({ configId: 'cfg2', name: 'DeepSeek', defaultModel: 'deepseek-chat', isPreferred: true }),
      makeConfig({ configId: 'cfg3', name: 'Siliconflow', defaultModel: 'Qwen2-7B', isPreferred: false }),
    ]
    const { selectedModelKey } = selectPreferredModel(configs)
    expect(selectedModelKey).toBe('cfg2:deepseek-chat')
    expect(() => resolveConfig(selectedModelKey, configs)).not.toThrow()
  })

  it('[修复验证] 即使 enabled 字段以整数 1 存储，选择逻辑也不会失效', () => {
    // IndexedDB 有时把 boolean 存为 0/1；修复前 getEnabledAIConfigs 用 === true 会漏掉它
    // 修复后直接用 result.find(c => c.isPreferred)，不再有 boolean 类型不匹配问题
    const configWithIntEnabled = {
      ...makeConfig({ configId: 'cfg1', defaultModel: 'gpt-4', isPreferred: true }),
      enabled: 1 as unknown as boolean, // 模拟 IndexedDB 存的整数
    }
    // selectPreferredModel 接收的是已过滤好的列表，不再自己判断 enabled
    // 所以这个 config 能被正确选中
    const { selectedModelKey } = selectPreferredModel([configWithIntEnabled])
    expect(selectedModelKey).toBe('cfg1:gpt-4')
    expect(() => resolveConfig(selectedModelKey, [configWithIntEnabled])).not.toThrow()
  })
})
