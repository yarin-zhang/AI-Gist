import type { AIConfig } from '@shared/types/ai'

/**
 * 模型配置的编辑规则，桌面向导和移动端编辑页共用。
 *
 * 旧版本有一个单独的「自定义模型」字段，现在只保留可用模型列表一种添加方式：
 * 打开旧配置时把它并进列表；没有默认模型时它就是默认模型。保存时清掉这个字段，
 * 免得用户删掉的模型又从它冒出来。
 */
export function mergeLegacyCustomModel(
  config?: Pick<AIConfig, 'models' | 'defaultModel' | 'customModel'> | null,
): { models: string[]; defaultModel: string } {
  const defaultModel = config?.defaultModel || config?.customModel || config?.models?.[0] || ''
  const models = [...new Set([...(config?.models || []), config?.customModel, defaultModel]
    .filter((model): model is string => Boolean(model)))]
  return { models, defaultModel }
}

/** 还没有别的启用配置时，新加的这个就是 AI 功能实际在用的，应当直接设为首选 */
export function shouldPreferNewConfig(existing: Pick<AIConfig, 'enabled'>[]): boolean {
  return !existing.some(config => config.enabled)
}
