import type { GlobalThemeOverrides } from "naive-ui"
import tokens from "../design-tokens.json"

// 生成主题颜色变体
function generateColorVariants(baseColor: string) {
  return {
    base: baseColor,
    hover: adjustBrightness(baseColor, 0.1),
    pressed: adjustBrightness(baseColor, -0.05),
    suppl: adjustBrightness(baseColor, 0.15)
  }
}

// 调整颜色亮度
function adjustBrightness(color: string, factor: number): string {
  if (color.startsWith('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      const r = parseInt(match[1])
      const g = parseInt(match[2])
      const b = parseInt(match[3])
      
      const brightnessFactor = 1 + factor
      const newR = Math.min(255, Math.max(0, Math.round(r * brightnessFactor)))
      const newG = Math.min(255, Math.max(0, Math.round(g * brightnessFactor)))
      const newB = Math.min(255, Math.max(0, Math.round(b * brightnessFactor)))
      
      return `rgb(${newR}, ${newG}, ${newB})`
    }
  }
  return color
}

// 获取 NaiveUI 主题覆盖配置
export function getThemeOverrides(themeName: 'light' | 'dark'): GlobalThemeOverrides {
  const palette = tokens.palette[themeName]
  const { surface, content, accent, border, interactive } = palette

  // 生成颜色变体
  const primaryColors = generateColorVariants(accent.primary)
  const successColors = generateColorVariants(accent.success)
  const warningColors = generateColorVariants(accent.warning)
  const errorColors = generateColorVariants(accent.error)
  const infoColors = generateColorVariants(accent.info)

  return {
    common: {
      // 主色调
      primaryColor: primaryColors.base,
      primaryColorHover: primaryColors.hover,
      primaryColorPressed: primaryColors.pressed,
      primaryColorSuppl: primaryColors.suppl,
      
      // 功能色
      successColor: successColors.base,
      successColorHover: successColors.hover,
      successColorPressed: successColors.pressed,
      successColorSuppl: successColors.suppl,
      
      warningColor: warningColors.base,
      warningColorHover: warningColors.hover,
      warningColorPressed: warningColors.pressed,
      warningColorSuppl: warningColors.suppl,
      
      errorColor: errorColors.base,
      errorColorHover: errorColors.hover,
      errorColorPressed: errorColors.pressed,
      errorColorSuppl: errorColors.suppl,
      
      infoColor: infoColors.base,
      infoColorHover: infoColors.hover,
      infoColorPressed: infoColors.pressed,
      infoColorSuppl: infoColors.suppl,
      
      // 文本颜色
      textColorBase: content.primary,
      textColor1: content.primary,
      textColor2: content.secondary,
      textColor3: content.tertiary,
      
      // 背景颜色
      bodyColor: surface.body,
      baseColor: surface.primary,
      popoverColor: surface.primary,
      cardColor: surface.primary,
      modalColor: surface.primary,
      
      // 边框和交互
      borderColor: border.default,
      hoverColor: interactive.hover,
      dividerColor: border.subtle,
      
      // 尺寸
      lineHeight: tokens.typography.lineHeights.normal,
      borderRadius: tokens.radius.md,
      borderRadiusSmall: tokens.radius.sm,
      fontSize: tokens.typography.fontSizes.base,
      fontWeight: tokens.typography.fontWeights.normal,
      fontWeightStrong: tokens.typography.fontWeights.semibold
    },
    Card: {
      color: surface.primary,
      colorEmbedded: surface.secondary,
      titleFontSizeSmall: tokens.typography.fontSizes.lg,
      titleFontSizeMedium: tokens.typography.fontSizes.lg,
      titleFontSizeLarge: tokens.typography.fontSizes.lg,
      titleFontSizeHuge: tokens.typography.fontSizes.lg,
      titleFontWeight: tokens.typography.fontWeights.semibold
    },
    LoadingBar: {
      colorLoading: accent.primary
    },
    Tag: {
      colorBordered: "rgba(0, 0, 0, 0.08)"
    }
  }
}

// 获取 CSS 变量
export function getCssVars(themeName: 'light' | 'dark'): Record<string, string> {
  const palette = tokens.palette[themeName]
  const { surface, content, accent, border, interactive } = palette
  
  return {
    // 表面颜色
    "surface-primary": surface.primary,
    "surface-secondary": surface.secondary,
    "surface-tertiary": surface.tertiary,
    "surface-sidebar": surface.sidebar,
    "surface-body": surface.body,
    
    // 内容颜色
    "content-primary": content.primary,
    "content-secondary": content.secondary,
    "content-tertiary": content.tertiary,
    "content-muted": content.muted,
    
    // 强调色
    "accent-primary": accent.primary,
    "accent-success": accent.success,
    "accent-warning": accent.warning,
    "accent-error": accent.error,
    "accent-info": accent.info,
    
    // 边框颜色
    "border-default": border.default,
    "border-strong": border.strong,
    "border-subtle": border.subtle,
    
    // 交互颜色
    "interactive-hover": interactive.hover,
    "interactive-active": interactive.active,
    "interactive-focus": interactive.focus,
    
    // 间距
    "spacing-xs": tokens.spacing.xs,
    "spacing-sm": tokens.spacing.sm,
    "spacing-md": tokens.spacing.md,
    "spacing-lg": tokens.spacing.lg,
    "spacing-xl": tokens.spacing.xl,
    "spacing-2xl": tokens.spacing["2xl"],
    "spacing-3xl": tokens.spacing["3xl"],
    
    // 圆角
    "radius-sm": tokens.radius.sm,
    "radius-md": tokens.radius.md,
    "radius-lg": tokens.radius.lg,
    "radius-xl": tokens.radius.xl,
    
    // 字体
    "font-size-xs": tokens.typography.fontSizes.xs,
    "font-size-sm": tokens.typography.fontSizes.sm,
    "font-size-base": tokens.typography.fontSizes.base,
    "font-size-lg": tokens.typography.fontSizes.lg,
    "font-size-xl": tokens.typography.fontSizes.xl,
    "font-size-2xl": tokens.typography.fontSizes["2xl"],
    "font-size-3xl": tokens.typography.fontSizes["3xl"],
    "font-size-4xl": tokens.typography.fontSizes["4xl"],
    
    // 字重
    "font-weight-normal": tokens.typography.fontWeights.normal,
    "font-weight-medium": tokens.typography.fontWeights.medium,
    "font-weight-semibold": tokens.typography.fontWeights.semibold,
    "font-weight-bold": tokens.typography.fontWeights.bold,
    
    // 行高
    "line-height-tight": tokens.typography.lineHeights.tight,
    "line-height-normal": tokens.typography.lineHeights.normal,
    "line-height-relaxed": tokens.typography.lineHeights.relaxed
  }
} 