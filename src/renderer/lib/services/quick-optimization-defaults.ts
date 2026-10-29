/**
 * 默认的快速优化动作及其内置标识（builtinKey）。
 *
 * 默认动作每台设备第一次打开 AI 面板时各自预置，uuid 随机、名称跟着当时的界面语言。
 * 加入同步后它们靠 builtinKey 认出是同一个动作，只保留一份 (#490)。
 * 用户改过名称、说明或模板的动作就是用户自己的动作了，不再带 builtinKey，也不参与归并。
 */

import type { CreateQuickOptimizationConfig } from '@shared/types/ai';
import i18n from '../../i18n';

/** 名称、说明和模板都在语言包 quickOptimization.defaults.<key> 下 */
export const DEFAULT_QUICK_OPTIMIZATION_ACTIONS = [
  { key: 'shorter', enabled: true },
  { key: 'richer', enabled: true },
  { key: 'general', enabled: true },
  { key: 'extractVariables', enabled: true },
  { key: 'professional', enabled: false }
] as const;

export type QuickOptimizationBuiltinKey = typeof DEFAULT_QUICK_OPTIMIZATION_ACTIONS[number]['key'];

interface DefaultActionText {
  name: string;
  description?: string;
  prompt: string;
}

/** 3.0 之前写死在代码里的中文默认动作：老用户设备上预置的就是这几条 */
const LEGACY_DEFAULT_ACTION_TEXTS: Record<QuickOptimizationBuiltinKey, DefaultActionText> = {
  shorter: {
    name: '更简短',
    description: '将提示词优化得更加简短和精炼，保留核心要求，去除冗余内容',
    prompt: '请将以下提示词优化得更加简短和精炼，保留核心要求，去除冗余内容：\n\n{{content}}'
  },
  richer: {
    name: '更丰富',
    description: '将提示词优化得略微丰富和详细一些，添加更多具体的要求和细节',
    prompt: '请将以下提示词优化得略微丰富和详细一些，添加更多具体的要求和细节，但不要过于复杂：\n\n{{content}}'
  },
  general: {
    name: '更通用',
    description: '将提示词优化得更加通用，适用于更广泛的场景和用途',
    prompt: '请将以下提示词优化得更加通用，适用于更广泛的场景和用途，但不要过于复杂：\n\n{{content}}'
  },
  extractVariables: {
    name: '提取变量',
    description: '分析提示词，将其中可以变化的部分提取为变量',
    prompt: '请分析以下提示词，将其中可以变化的、最有价值的 3~5 个部分提取为变量，使用 {{变量名}} 的格式标记：\n\n{{content}}'
  },
  professional: {
    name: '更专业',
    description: '将提示词优化得更加专业和正式，适合商业或学术场景',
    prompt: '请将以下提示词优化得更加专业和正式，适合商业或学术场景使用：\n\n{{content}}'
  }
};

type Translate = (key: string) => string;

const translate: Translate = key => (i18n.global.t as Translate)(key);

const translateIn = (locale: string): Translate => key =>
  (i18n.global.t as (key: string, named: Record<string, unknown>, options: { locale: string }) => string)(
    key,
    {},
    { locale }
  );

const readActionText = (key: QuickOptimizationBuiltinKey, t: Translate): DefaultActionText => ({
  name: t(`quickOptimization.defaults.${key}.name`),
  description: t(`quickOptimization.defaults.${key}.description`),
  prompt: t(`quickOptimization.defaults.${key}.prompt`)
});

/** 按当前界面语言生成默认动作，每条都带上内置标识 */
export function buildDefaultQuickOptimizationConfigs(t: Translate = translate): CreateQuickOptimizationConfig[] {
  return DEFAULT_QUICK_OPTIMIZATION_ACTIONS.map((action, index) => ({
    ...readActionText(action.key, t),
    enabled: action.enabled,
    sortOrder: index + 1,
    builtinKey: action.key
  }));
}

const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

let knownTexts: { key: QuickOptimizationBuiltinKey; text: DefaultActionText }[] | null = null;

/** 每个默认动作在 5 个语言包和旧版里的写法 */
const getKnownDefaultTexts = () => {
  if (!knownTexts) {
    const locales = [...i18n.global.availableLocales].map(String);
    knownTexts = DEFAULT_QUICK_OPTIMIZATION_ACTIONS.flatMap(({ key }) => [
      ...locales.map(locale => ({ key, text: readActionText(key, translateIn(locale)) })),
      { key, text: LEGACY_DEFAULT_ACTION_TEXTS[key] }
    ]);
  }
  return knownTexts;
};

/**
 * 内容还是某个默认动作原样（名称和模板与任一语言包或旧版的默认值完全一致）时返回它的内置标识；
 * 改过名称或模板的返回 undefined。
 */
export function resolveQuickOptimizationBuiltinKey(record: {
  name?: unknown;
  prompt?: unknown;
} | null | undefined): QuickOptimizationBuiltinKey | undefined {
  const name = normalizeText(record?.name);
  const prompt = normalizeText(record?.prompt);
  if (!name || !prompt) return undefined;
  return getKnownDefaultTexts().find(({ text }) =>
    normalizeText(text.name) === name && normalizeText(text.prompt) === prompt
  )?.key;
}

/**
 * 编辑后的动作还是不是原样的内置动作：名称、说明和模板要和同一种写法的默认值一致。
 * 说明也算在内，用户只改了说明也是改过。
 */
export function isUnmodifiedBuiltinQuickOptimization(
  record: { name?: unknown; description?: unknown; prompt?: unknown },
  builtinKey: string
): boolean {
  const name = normalizeText(record.name);
  const description = normalizeText(record.description);
  const prompt = normalizeText(record.prompt);
  return getKnownDefaultTexts().some(({ key, text }) =>
    key === builtinKey &&
    normalizeText(text.name) === name &&
    normalizeText(text.description) === description &&
    normalizeText(text.prompt) === prompt
  );
}
