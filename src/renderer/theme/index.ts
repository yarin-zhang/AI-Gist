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

      // 弹出层阴影：boxShadow2 是 naive-ui 弹出层家族（Popover / Dropdown /
      // Select 菜单 / Popselect / AutoComplete / DatePicker / TimePicker /
      // Cascader 等面板）的统一阴影来源。在这里统一替换为设计令牌，
      // 阴影直接落在参与过渡动画的面板元素上，与面板同步淡入淡出，
      // 避免在外层定位容器上补阴影导致的“阴影滞后”（#112）。
      boxShadow2: tokens.elevation.popover,
      
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
      colorModal: surface.primary,
      colorPopover: surface.primary,
      colorEmbedded: surface.secondary,
      colorEmbeddedModal: surface.secondary,
      colorEmbeddedPopover: surface.secondary,
      actionColor: surface.secondary,
      borderColor: border.default,
      borderRadius: tokens.component.panelRadius,
      boxShadow: "none",
      titleFontSizeSmall: tokens.typography.fontSizes.lg,
      titleFontSizeMedium: tokens.typography.fontSizes.lg,
      titleFontSizeLarge: tokens.typography.fontSizes.lg,
      titleFontSizeHuge: tokens.typography.fontSizes.lg,
      titleFontWeight: tokens.typography.fontWeights.semibold
    },
    Layout: {
      color: surface.body,
      headerColor: surface.primary,
      footerColor: surface.primary,
      siderColor: surface.sidebar,
      headerBorderColor: border.default,
      footerBorderColor: border.default,
      siderBorderColor: border.default
    },
    Button: {
      fontSizeTiny: tokens.typography.fontSizes.xs,
      fontSizeSmall: tokens.typography.fontSizes.base,
      fontSizeMedium: tokens.typography.fontSizes.base,
      fontSizeLarge: tokens.typography.fontSizes.base
    },
    Input: {
      fontSizeTiny: tokens.typography.fontSizes.xs,
      fontSizeSmall: tokens.typography.fontSizes.base,
      fontSizeMedium: tokens.typography.fontSizes.base,
      fontSizeLarge: tokens.typography.fontSizes.base,
      lineHeight: tokens.typography.lineHeights.normal,
      lineHeightTextarea: tokens.typography.lineHeights.normal
    },
    Select: {
      fontSizeTiny: tokens.typography.fontSizes.xs,
      fontSizeSmall: tokens.typography.fontSizes.base,
      fontSizeMedium: tokens.typography.fontSizes.base,
      fontSizeLarge: tokens.typography.fontSizes.base
    },
    Form: {
      labelFontSizeLeftSmall: tokens.typography.fontSizes.base,
      labelFontSizeLeftMedium: tokens.typography.fontSizes.base,
      labelFontSizeLeftLarge: tokens.typography.fontSizes.base,
      labelFontSizeTopSmall: tokens.typography.fontSizes.base,
      labelFontSizeTopMedium: tokens.typography.fontSizes.base,
      labelFontSizeTopLarge: tokens.typography.fontSizes.base
    },
    Menu: {
      borderRadius: tokens.component.controlRadius,
      groupTextColor: content.secondary,
      itemColorHover: interactive.hover,
      itemColorActive: interactive.active,
      itemColorActiveHover: interactive.active,
      itemColorActiveCollapsed: interactive.active,
      itemTextColor: content.secondary,
      itemTextColorHover: content.primary,
      itemTextColorActive: content.primary,
      itemTextColorActiveHover: content.primary,
      itemIconColor: content.secondary,
      itemIconColorHover: content.primary,
      itemIconColorActive: content.primary,
      itemIconColorActiveHover: content.primary
    },
    Tooltip: {
      color: surface.primary,
      textColor: content.primary,
      borderRadius: tokens.component.panelRadius,
      boxShadow: tokens.elevation.popover
    },
    Modal: {
      color: surface.primary,
      textColor: content.primary,
      boxShadow: tokens.elevation.overlay,
      colorModal: surface.primary
    },
    Drawer: {
      color: surface.primary,
      borderRadius: tokens.component.modalRadius,
      boxShadow: tokens.elevation.overlay,
      headerBorderBottom: `1px solid ${border.default}`,
      footerBorderTop: `1px solid ${border.default}`
    },
    Dropdown: {
      color: surface.primary,
      dividerColor: border.default,
      borderRadius: tokens.component.panelRadius,
      optionColorHover: interactive.hover,
      optionColorActive: interactive.active,
      optionIconSizeSmall: tokens.component.menuIconSize,
      optionIconSizeMedium: tokens.component.menuIconSize,
      optionIconSizeLarge: tokens.component.menuIconSize,
      optionIconSizeHuge: tokens.component.menuIconSize
    },
    DataTable: {
      borderColor: border.default,
      borderRadius: tokens.component.panelRadius,
      thColor: surface.secondary,
      thColorHover: surface.secondary,
      tdColor: surface.primary,
      tdColorHover: interactive.hover,
      thTextColor: content.secondary,
      tdTextColor: content.primary,
      thFontWeight: tokens.typography.fontWeights.medium,
      fontSizeSmall: tokens.typography.fontSizes.base,
      fontSizeMedium: tokens.typography.fontSizes.base,
      fontSizeLarge: tokens.typography.fontSizes.base
    },
    LoadingBar: {
      colorLoading: accent.primary
    },
    Tag: {
      colorBordered: interactive.hover,
      border: `1px solid ${border.default}`
    }
  }
}

// 获取 CSS 变量
export function getCssVars(themeName: 'light' | 'dark'): Record<string, string> {
  const palette = tokens.palette[themeName]
  const { surface, content, accent, border, interactive, overlay } = palette
  
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

    // 浮层遮罩
    "overlay-backdrop": overlay.backdrop,
    "overlay-preview": overlay.preview,
    
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
    "radius-control": tokens.component.controlRadius,
    "radius-panel": tokens.component.panelRadius,
    "radius-modal": tokens.component.modalRadius,
    "radius-image": tokens.component.imageRadius,

    // 页面布局
    "page-padding": tokens.component.pagePadding,
    "content-padding": tokens.component.contentPadding,
    "compact-padding": tokens.component.compactPadding,
    "section-gap": tokens.component.sectionGap,

    // 浮层阴影（常驻面板不使用阴影）
    "shadow-popover": tokens.elevation.popover,
    "shadow-overlay": tokens.elevation.overlay,
    
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
