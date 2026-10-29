import { app } from 'electron';
import type { SupportedLocale } from '@shared/types/preferences';
import { isSupportedLocale, pickSupportedLocale } from '@shared/locale';
import { MAIN_STRINGS, type MainStrings } from './main-strings';

/**
 * 主进程原生界面的语言。
 *
 * 用户的语言选择保存在渲染进程里（localStorage），主进程拿不到，所以由渲染进程在启动和
 * 切换语言时把当前界面语言上报过来（偏好设置里的 uiLocale 负责跨启动保存）。还没上报过
 * （首次启动、渲染进程尚未加载）时按系统语言选，规则和渲染进程的 locale-detection 一致。
 *
 * 这个模块刻意不依赖 preferences-manager：文件选择框等模块只需要文案，不应该因此在加载时
 * 就去读写配置文件。
 */

type LocaleListener = (locale: SupportedLocale) => void;

let uiLocale: SupportedLocale | null = null;
const listeners = new Set<LocaleListener>();

function systemLanguages(): string[] {
  try {
    const preferred = app.getPreferredSystemLanguages();
    if (preferred.length) return preferred;
  } catch (error) {
    console.warn('读取系统语言列表失败:', error);
  }
  try {
    return [app.getLocale()];
  } catch {
    return [];
  }
}

/** 启动时恢复上次保存的界面语言 */
export function initMainLocale(saved: unknown): void {
  uiLocale = isSupportedLocale(saved) ? saved : null;
}

export function getMainLocale(): SupportedLocale {
  return uiLocale ?? pickSupportedLocale(systemLanguages());
}

export function getMainStrings(locale: SupportedLocale = getMainLocale()): MainStrings {
  return MAIN_STRINGS[locale];
}

/**
 * 记录渲染进程当前的界面语言，并通知托盘等原生界面刷新。
 * @returns 语言有变化时返回 true，调用方据此决定是否保存到偏好设置
 */
export function setUiLocale(locale: unknown): boolean {
  if (!isSupportedLocale(locale) || locale === uiLocale) return false;
  uiLocale = locale;
  for (const listener of listeners) {
    try {
      listener(locale);
    } catch (error) {
      console.error('刷新原生界面语言失败:', error);
    }
  }
  return true;
}

export function onMainLocaleChange(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
