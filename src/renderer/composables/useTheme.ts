import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { GlobalTheme } from 'naive-ui'
import { darkTheme, lightTheme } from 'naive-ui'
import { getThemeOverrides, getCssVars } from '../theme'

// 主题类型
export type SystemTheme = 'light' | 'dark' | 'system'

// 主题枚举
export enum ThemeNameEnum {
	Dark = "dark",
	Light = "light"
}

// 颜色处理函数
function colorToArray(color: string): number[] {
	if (color.startsWith('rgb')) {
		const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
		if (match) {
			return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
		}
	}
	return [0, 0, 0]
}

function exposure(color: string, amount: number): string {
	if (color.startsWith('rgb')) {
		const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
		if (match) {
			const r = parseInt(match[1])
			const g = parseInt(match[2])
			const b = parseInt(match[3])
			
			const factor = 1 + amount
			const newR = Math.min(255, Math.round(r * factor))
			const newG = Math.min(255, Math.round(g * factor))
			const newB = Math.min(255, Math.round(b * factor))
			
			return `rgb(${newR}, ${newG}, ${newB})`
		}
	}
	return color
}

function getThemeColors(colors: Record<string, string>) {
	const colorActions = [
		{ scene: "", handler: (color: string) => color },
		{ scene: "Suppl", handler: (color: string) => exposure(color, 0.1) },
		{ scene: "Hover", handler: (color: string) => exposure(color, 0.08) },
		{ scene: "Pressed", handler: (color: string) => exposure(color, -0.05) }
	]

	const themeColor: Record<string, string> = {}

	for (const colorName in colors) {
		const colorValue = colors[colorName]

		colorActions.forEach(action => {
			const colorKey = `${colorName}Color${action.scene}`
			themeColor[colorKey] = action.handler(colorValue)
		})
	}

	return themeColor
}

// 主题状态
const isDarkMode = ref(false)
const currentTheme = ref<SystemTheme>('system')
const themeSource = ref<'system' | 'light' | 'dark'>('system')

// 主题状态
const themeName = ref<ThemeNameEnum>(ThemeNameEnum.Light)

// 主题变化监听器清理函数
let removeThemeListener: (() => void) | null = null

/**
 * 主题管理 Composable
 * 提供系统主题检测、NaiveUI 主题切换和主题状态管理
 * 同时集成 主题功能
 */
export function useTheme() {
	
	// NaiveUI 主题配置（保留原有逻辑）
	const naiveTheme = computed<GlobalTheme | null>(() => {
		return isDarkMode.value ? darkTheme : null
	})

	// 主题配置
	// const naiveTheme = computed(() => isDark.value ? darkTheme : lightTheme)

	// 主题类名（用于根元素）
	const themeClass = computed(() => {
		return isDarkMode.value ? 'dark' : 'light'
	})

	// 主题计算属性
	const isDark = computed(() => themeName.value === ThemeNameEnum.Dark)

	/**
	 * 设置 CSS 全局变量（主题功能）
	 */
	const setCssGlobalVars = () => {
		if (typeof document !== 'undefined') {
			const html = document.documentElement
			const styleObject = getCssVars(themeName.value)
			
			// 设置主题类名
			html.classList.remove('theme-light', 'theme-dark')
			html.classList.add(`theme-${themeName.value}`)
			
			// 设置暗色模式类名
			if (isDark.value) {
				html.classList.add('dark')
			} else {
				html.classList.remove('dark')
			}
			
			// 设置 CSS 变量
			for (const [key, value] of Object.entries(styleObject)) {
				html.style.setProperty(`--${key}`, value)
			}
		}
	}

	/**
	 * 初始化主题
	 */
	const initTheme = async () => {
		try {
			// 获取系统当前主题信息
			const themeInfo = await window.electronAPI.theme.getInfo()
			isDarkMode.value = themeInfo.isDarkTheme
			currentTheme.value = themeInfo.currentTheme
			themeSource.value = themeInfo.themeSource as 'system' | 'light' | 'dark'
			
			// 同步 主题状态
			themeName.value = isDarkMode.value ? ThemeNameEnum.Dark : ThemeNameEnum.Light
			
			console.log('主题初始化完成:', {
				isDarkMode: isDarkMode.value,
				currentTheme: currentTheme.value,
				themeSource: themeSource.value,
				themeName: themeName.value
			})

			// 设置页面根元素的主题类名
			updateBodyTheme()
			
			// 设置 CSS 变量
			setCssGlobalVars()
			
			// 监听主题变化
			setupThemeListener()
		} catch (error) {
			console.error('初始化主题失败:', error)
			// 降级处理：使用系统默认主题
			isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches
			themeName.value = isDarkMode.value ? ThemeNameEnum.Dark : ThemeNameEnum.Light
			updateBodyTheme()
			setCssGlobalVars()
		}
	}

	/**
	 * 设置主题来源
	 * @param source 主题来源：'system' | 'light' | 'dark'
	 */
	const setThemeSource = async (source: 'system' | 'light' | 'dark') => {
		try {
			const newTheme = await window.electronAPI.theme.setSource(source)
			themeSource.value = source
			currentTheme.value = newTheme
			
			// 立即获取更新后的主题信息
			const themeInfo = await window.electronAPI.theme.getInfo()
			isDarkMode.value = themeInfo.isDarkTheme
			
			// 同步 主题状态
			themeName.value = isDarkMode.value ? ThemeNameEnum.Dark : ThemeNameEnum.Light
			
			updateBodyTheme()
			setCssGlobalVars()
			
			console.log('主题来源已更新:', {
				source,
				newTheme,
				isDarkMode: isDarkMode.value,
				themeName: themeName.value
			})
		} catch (error) {
			console.error('设置主题来源失败:', error)
		}
	}

	/**
	 * 主题切换函数
	 */
	const toggleTheme = () => {
		themeName.value = isDark.value ? ThemeNameEnum.Light : ThemeNameEnum.Dark
		// 同步到系统主题
		const newSource = isDark.value ? 'dark' : 'light'
		setThemeSource(newSource)
	}

	/**
	 * 设置 主题
	 */
	const setTheme = (theme: ThemeNameEnum) => {
		themeName.value = theme
		// 同步到系统主题
		const newSource = theme === ThemeNameEnum.Dark ? 'dark' : 'light'
		setThemeSource(newSource)
	}

	/**
	 * 获取 主题覆盖配置
	 */
	const getThemeOverridesConfig = () => {
		return getThemeOverrides(themeName.value)
	}

	/**
	 * 设置系统主题监听器
	 */
	const setupThemeListener = () => {
		// 清理之前的监听器
		if (removeThemeListener) {
			removeThemeListener()
		}

		// 设置新的监听器
		removeThemeListener = window.electronAPI.theme.onThemeChanged((data) => {
			console.log('接收到主题变化:', data)
			isDarkMode.value = data.themeInfo.isDarkTheme
			currentTheme.value = data.theme
			themeSource.value = data.themeInfo.themeSource
			
			// 同步 主题状态
			themeName.value = isDarkMode.value ? ThemeNameEnum.Dark : ThemeNameEnum.Light
			
			updateBodyTheme()
			setCssGlobalVars()
		})
	}

	/**
	 * 更新页面根元素的主题类名
	 */
	const updateBodyTheme = () => {
		const html = document.documentElement
		const body = document.body
		
		// 移除之前的主题类
		html.classList.remove('light', 'dark')
		body.classList.remove('light', 'dark')
		
		// 添加新的主题类
		html.classList.add(themeClass.value)
		body.classList.add(themeClass.value)
		
		// 设置CSS自定义属性
		body.style.setProperty('--theme-mode', themeClass.value)
	}

	/**
	 * 获取当前主题信息
	 */
	const getThemeInfo = () => {
		return {
			isDarkMode: isDarkMode.value,
			currentTheme: currentTheme.value,
			themeSource: themeSource.value,
			themeClass: themeClass.value,
			themeName: themeName.value
		}
	}

	/**
	 * 清理主题监听器
	 */
	const cleanup = () => {
		if (removeThemeListener) {
			removeThemeListener()
			removeThemeListener = null
		}
	}

	// 监听 主题变化
	watch(themeName, () => {
		setCssGlobalVars()
	}, { immediate: true })

	// 组件卸载时清理
	onUnmounted(() => {
		cleanup()
	})

	return {
		// 响应式状态（原有）
		isDarkMode: computed(() => isDarkMode.value),
		currentTheme: computed(() => currentTheme.value),
		themeSource: computed(() => themeSource.value),
		naiveTheme,
		themeClass,
		
		// 主题状态
		themeName,
		isDark,
		
		// 方法（原有）
		initTheme,
		setThemeSource,
		toggleTheme,
		getThemeInfo,
		cleanup,
		
		// 主题方法
		setTheme,
		getThemeOverrides: getThemeOverridesConfig,
		getCssVars: () => getCssVars(themeName.value)
	}
}

// 全局主题状态（可选，用于跨组件共享）
export const globalTheme = {
	isDarkMode,
	currentTheme,
	themeSource,
	themeName
} 