import { getCssVars } from './index'

export type ThemeSource = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type ThemeShell = 'desktop' | 'mobile'

export function resolveTheme(source: ThemeSource, prefersDark: boolean): ResolvedTheme {
  if (source === 'system') return prefersDark ? 'dark' : 'light'
  return source
}

const THEME_SWITCHING_CLASS = 'theme-switching'
let themeSwitchFrame: number | null = null

// 主题切换应一次到位。卡片、单选框等组件自带 0.3s 背景过渡，切换时会从深色
// 逐帧淡到浅色，帧被节流或恰好截图时就停在“比页面还暗”的灰色中间态（#387）。
// 切换期间暂停过渡，等新主题样式落地后的下一帧再恢复。
function suppressTransitionsDuringThemeSwitch(html: HTMLElement): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return

  html.classList.add(THEME_SWITCHING_CLASS)
  if (themeSwitchFrame !== null) window.cancelAnimationFrame(themeSwitchFrame)
  themeSwitchFrame = window.requestAnimationFrame(() => {
    themeSwitchFrame = window.requestAnimationFrame(() => {
      themeSwitchFrame = null
      html.classList.remove(THEME_SWITCHING_CLASS)
    })
  })
}

export function applyDocumentTheme(theme: ResolvedTheme, shell: ThemeShell): void {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  const isDark = theme === 'dark'

  suppressTransitionsDuringThemeSwitch(html)

  html.classList.remove('light', 'dark', 'theme-light', 'theme-dark')
  body.classList.remove('light', 'dark')
  html.classList.add(theme, `theme-${theme}`)
  body.classList.add(theme)
  html.classList.toggle('ion-palette-dark', shell === 'mobile' && isDark)
  body.style.setProperty('--theme-mode', theme)

  for (const [key, value] of Object.entries(getCssVars(theme))) {
    html.style.setProperty(`--${key}`, value)
  }
}

export function getSystemThemePreference(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}
