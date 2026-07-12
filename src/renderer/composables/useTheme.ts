import { computed, ref } from 'vue'
import type { GlobalTheme } from 'naive-ui'
import { darkTheme } from 'naive-ui'
import { PlatformDetector } from '@shared/platform'
import { preferencesClient } from '../lib/platform/preferences'
import { getThemeOverrides, getCssVars } from '../theme'
import {
	applyDocumentTheme,
	getSystemThemePreference,
	resolveTheme,
	type ResolvedTheme,
	type ThemeSource
} from '../theme/runtime'

export type SystemTheme = ResolvedTheme | 'system'

export enum ThemeNameEnum {
	Dark = 'dark',
	Light = 'light'
}

const initialTheme: ResolvedTheme = getSystemThemePreference() ? 'dark' : 'light'
const isDarkMode = ref(initialTheme === 'dark')
const currentTheme = ref<SystemTheme>(initialTheme)
const themeSource = ref<ThemeSource>('system')
const themeName = ref<ThemeNameEnum>(initialTheme === 'dark' ? ThemeNameEnum.Dark : ThemeNameEnum.Light)

let removeThemeListener: (() => void) | null = null

function getShell() {
	return PlatformDetector.isMobileShell() ? 'mobile' as const : 'desktop' as const
}

function applyResolvedTheme(theme: ResolvedTheme): void {
	isDarkMode.value = theme === 'dark'
	currentTheme.value = theme
	themeName.value = theme === 'dark' ? ThemeNameEnum.Dark : ThemeNameEnum.Light
	applyDocumentTheme(theme, getShell())
}

function setupSystemThemeListener(): void {
	removeThemeListener?.()
	removeThemeListener = null

	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
	const handleChange = (event: MediaQueryListEvent) => {
		if (themeSource.value === 'system') applyResolvedTheme(event.matches ? 'dark' : 'light')
	}
	mediaQuery.addEventListener('change', handleChange)
	removeThemeListener = () => mediaQuery.removeEventListener('change', handleChange)
}

function setupElectronThemeListener(): void {
	removeThemeListener?.()
	removeThemeListener = null
	if (!window.electronAPI?.theme) return

	removeThemeListener = window.electronAPI.theme.onThemeChanged((data) => {
		themeSource.value = data.themeInfo.themeSource as ThemeSource
		applyResolvedTheme(data.themeInfo.isDarkTheme ? 'dark' : 'light')
	})
}

export function useTheme() {
	const naiveTheme = computed<GlobalTheme | null>(() => isDarkMode.value ? darkTheme : null)
	const themeClass = computed(() => isDarkMode.value ? 'dark' : 'light')
	const isDark = computed(() => themeName.value === ThemeNameEnum.Dark)

	const initTheme = async () => {
		try {
			if (window.electronAPI?.theme) {
				const themeInfo = await window.electronAPI.theme.getInfo()
				themeSource.value = themeInfo.themeSource as ThemeSource
				applyResolvedTheme(themeInfo.isDarkTheme ? 'dark' : 'light')
				setupElectronThemeListener()
				return
			}

			const legacySource = localStorage.getItem('theme') as ThemeSource | null
			const preferences = await preferencesClient.get()
			const storedSource = legacySource || preferences.themeSource
			themeSource.value = storedSource && ['system', 'light', 'dark'].includes(storedSource)
				? storedSource
				: 'system'
			localStorage.setItem('theme', themeSource.value)
			if (preferences.themeSource !== themeSource.value) {
				await preferencesClient.set({ themeSource: themeSource.value })
			}
			applyResolvedTheme(resolveTheme(themeSource.value, getSystemThemePreference()))
			setupSystemThemeListener()
		} catch (error) {
			console.error('初始化主题失败:', error)
			themeSource.value = 'system'
			applyResolvedTheme(resolveTheme('system', getSystemThemePreference()))
			setupSystemThemeListener()
		}
	}

	const setThemeSource = async (source: ThemeSource) => {
		try {
			themeSource.value = source
			if (!window.electronAPI?.theme) {
				localStorage.setItem('theme', source)
				await preferencesClient.set({ themeSource: source })
				applyResolvedTheme(resolveTheme(source, getSystemThemePreference()))
				setupSystemThemeListener()
				return
			}

			await window.electronAPI.theme.setSource(source)
			const themeInfo = await window.electronAPI.theme.getInfo()
			themeSource.value = themeInfo.themeSource as ThemeSource
			applyResolvedTheme(themeInfo.isDarkTheme ? 'dark' : 'light')
			setupElectronThemeListener()
		} catch (error) {
			console.error('设置主题来源失败:', error)
		}
	}

	const toggleTheme = () => {
		void setThemeSource(isDark.value ? 'light' : 'dark')
	}

	const setTheme = (theme: ThemeNameEnum) => {
		void setThemeSource(theme)
	}

	const getThemeInfo = () => ({
		isDarkMode: isDarkMode.value,
		currentTheme: currentTheme.value,
		themeSource: themeSource.value,
		themeClass: themeClass.value,
		themeName: themeName.value
	})

	const cleanup = () => {
		removeThemeListener?.()
		removeThemeListener = null
	}

	return {
		isDarkMode: computed(() => isDarkMode.value),
		currentTheme: computed(() => currentTheme.value),
		themeSource: computed(() => themeSource.value),
		naiveTheme,
		themeClass,
		themeName,
		isDark,
		initTheme,
		setThemeSource,
		toggleTheme,
		getThemeInfo,
		cleanup,
		setTheme,
		getThemeOverrides: () => getThemeOverrides(themeName.value),
		getCssVars: () => getCssVars(themeName.value)
	}
}

export const globalTheme = {
	isDarkMode,
	currentTheme,
	themeSource,
	themeName
}
