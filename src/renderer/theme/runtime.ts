import { getCssVars } from './index'

export type ThemeSource = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type ThemeShell = 'desktop' | 'mobile'

export function resolveTheme(source: ThemeSource, prefersDark: boolean): ResolvedTheme {
  if (source === 'system') return prefersDark ? 'dark' : 'light'
  return source
}

export function applyDocumentTheme(theme: ResolvedTheme, shell: ThemeShell): void {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  const isDark = theme === 'dark'

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
