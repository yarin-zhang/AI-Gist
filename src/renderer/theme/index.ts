import type { GlobalThemeOverrides } from "naive-ui"
import tokens from "../design-tokens.json"

export type ThemeName = 'light' | 'dark'

// 调整颜色亮度：只用于没有在令牌里单独给出悬停/按下色的语义色
function adjustBrightness(color: string, factor: number): string {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return color
  const scale = (channel: string) => Math.min(255, Math.max(0, Math.round(parseInt(channel) * (1 + factor))))
  return `rgb(${scale(match[1])}, ${scale(match[2])}, ${scale(match[3])})`
}

function generateColorVariants(baseColor: string) {
  return {
    base: baseColor,
    hover: adjustBrightness(baseColor, 0.1),
    pressed: adjustBrightness(baseColor, -0.05),
    suppl: adjustBrightness(baseColor, 0.15)
  }
}

const sizes = tokens.typography.fontSizes
const weights = tokens.typography.fontWeights
const heights = tokens.controlHeights
const component = tokens.component

// 获取 NaiveUI 主题覆盖配置
// 控件高度按 V5 组件库：默认 28（Naive 的 medium），页面级主操作 34（large），面板标题栏 22（tiny）
export function getThemeOverrides(themeName: ThemeName): GlobalThemeOverrides {
  const palette = tokens.palette[themeName]
  const { surface, content, accent, border, interactive, elevation } = palette

  const successColors = generateColorVariants(accent.success)
  const warningColors = generateColorVariants(accent.warning)

  return {
    common: {
      primaryColor: accent.primary,
      primaryColorHover: accent.primaryHover,
      primaryColorPressed: accent.primaryPressed,
      primaryColorSuppl: accent.primaryHover,

      successColor: successColors.base,
      successColorHover: successColors.hover,
      successColorPressed: successColors.pressed,
      successColorSuppl: successColors.suppl,

      warningColor: warningColors.base,
      warningColorHover: warningColors.hover,
      warningColorPressed: warningColors.pressed,
      warningColorSuppl: warningColors.suppl,

      errorColor: accent.error,
      errorColorHover: accent.errorHover,
      errorColorPressed: accent.errorHover,
      errorColorSuppl: accent.errorHover,

      infoColor: accent.info,
      infoColorHover: accent.primaryHover,
      infoColorPressed: accent.primaryPressed,
      infoColorSuppl: accent.primaryHover,

      textColorBase: content.primary,
      textColor1: content.primary,
      textColor2: content.secondary,
      textColor3: content.tertiary,
      textColorDisabled: content.muted,
      placeholderColor: content.muted,
      placeholderColorDisabled: content.muted,
      iconColor: content.tertiary,
      iconColorHover: content.secondary,
      iconColorPressed: content.primary,

      bodyColor: surface.body,
      baseColor: surface.primary,
      popoverColor: surface.primary,
      cardColor: surface.primary,
      modalColor: surface.primary,
      tableColor: surface.primary,
      tableHeaderColor: surface.secondary,
      tableColorHover: surface.secondary,
      inputColor: surface.primary,
      inputColorDisabled: surface.secondary,
      actionColor: surface.secondary,
      tabColor: surface.secondary,
      codeColor: surface.secondary,
      tagColor: surface.tertiary,

      borderColor: border.default,
      dividerColor: border.default,
      hoverColor: interactive.hover,
      pressedColor: interactive.active,
      closeColorHover: interactive.hover,
      closeColorPressed: interactive.active,
      buttonColor2: surface.tertiary,
      buttonColor2Hover: interactive.active,
      buttonColor2Pressed: interactive.active,

      // 弹出层阴影：boxShadow2 是 naive-ui 弹出层家族（Popover / Dropdown /
      // Select 菜单 / Popselect / AutoComplete / DatePicker / TimePicker /
      // Cascader 等面板）的统一阴影来源。在这里统一替换为设计令牌，
      // 阴影直接落在参与过渡动画的面板元素上，与面板同步淡入淡出，
      // 避免在外层定位容器上补阴影导致的“阴影滞后”（#112）。
      boxShadow1: 'none',
      boxShadow2: elevation.popover,
      boxShadow3: elevation.overlay,

      fontFamily: tokens.typography.fontFamilies.sans,
      fontFamilyMono: tokens.typography.fontFamilies.mono,
      lineHeight: tokens.typography.lineHeights.normal,
      borderRadius: component.controlRadius,
      borderRadiusSmall: '4px',
      fontSize: sizes.base,
      fontSizeMini: sizes.xs,
      fontSizeTiny: sizes.xs,
      fontSizeSmall: sizes.base,
      fontSizeMedium: sizes.base,
      fontSizeLarge: sizes.base,
      fontSizeHuge: sizes.lg,
      fontWeight: weights.normal,
      fontWeightStrong: weights.semibold,
      heightTiny: heights.xs,
      heightSmall: heights.sm,
      heightMedium: heights.sm,
      heightLarge: heights.md,
      heightHuge: heights.lg
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
      borderRadius: component.panelRadius,
      boxShadow: "none",
      titleFontSizeSmall: sizes.lg,
      titleFontSizeMedium: sizes.lg,
      titleFontSizeLarge: sizes.lg,
      titleFontSizeHuge: sizes.lg,
      titleFontWeight: weights.semibold
    },
    Layout: {
      color: surface.body,
      headerColor: surface.primary,
      footerColor: surface.secondary,
      siderColor: surface.sidebar,
      headerBorderColor: border.default,
      footerBorderColor: border.default,
      siderBorderColor: border.default
    },
    Button: {
      heightTiny: heights.xs,
      heightSmall: heights.sm,
      heightMedium: heights.sm,
      heightLarge: heights.md,
      paddingTiny: '0 8px',
      paddingSmall: '0 12px',
      paddingMedium: '0 12px',
      paddingLarge: '0 16px',
      iconSizeTiny: component.inputIconSize,
      iconSizeSmall: component.controlIconSize,
      iconSizeMedium: component.controlIconSize,
      iconSizeLarge: component.controlIconSize,
      borderRadiusTiny: component.controlRadius,
      borderRadiusSmall: component.controlRadius,
      borderRadiusMedium: component.controlRadius,
      borderRadiusLarge: component.controlRadius,
      fontSizeTiny: sizes.xs,
      fontSizeSmall: sizes.base,
      fontSizeMedium: sizes.base,
      fontSizeLarge: sizes.base,
      fontWeight: weights.medium,
      // 描边按钮：悬停只换底色和描边，文字不变色
      color: surface.primary,
      colorHover: surface.secondary,
      colorPressed: surface.tertiary,
      colorFocus: surface.primary,
      textColor: content.primary,
      textColorHover: content.primary,
      textColorPressed: content.primary,
      textColorFocus: content.primary,
      border: `1px solid ${border.default}`,
      borderHover: `1px solid ${border.strong}`,
      borderPressed: `1px solid ${border.strong}`,
      borderFocus: `1px solid ${border.strong}`,
      // 次要按钮（secondary）：表面 2 底色、无描边
      colorSecondary: surface.tertiary,
      colorSecondaryHover: interactive.active,
      colorSecondaryPressed: interactive.active,
      // 文字按钮（quaternary）：透明底，悬停表面 2
      colorQuaternaryHover: surface.tertiary,
      colorQuaternaryPressed: interactive.active,
      colorTertiaryHover: surface.tertiary,
      colorTertiaryPressed: interactive.active,
      // 深色下主题蓝做字色对比不足，文字/幽灵主按钮改用可读的强调字色
      textColorTextPrimary: accent.text,
      textColorTextHoverPrimary: accent.text,
      textColorTextPressedPrimary: accent.text,
      textColorTextFocusPrimary: accent.text,
      textColorGhostPrimary: accent.text,
      textColorGhostHoverPrimary: accent.text,
      textColorGhostPressedPrimary: accent.text,
      textColorGhostFocusPrimary: accent.text,
      // 危险实心按钮用专门的填充色，保证白字可读；危险文字按钮仍用错误字色
      colorError: accent.errorSolid,
      colorHoverError: accent.errorSolidHover,
      colorPressedError: accent.errorSolidHover,
      colorFocusError: accent.errorSolidHover,
      borderError: `1px solid ${accent.errorSolid}`,
      borderHoverError: `1px solid ${accent.errorSolidHover}`,
      borderPressedError: `1px solid ${accent.errorSolidHover}`,
      borderFocusError: `1px solid ${accent.errorSolidHover}`,
      textColorTextError: accent.error,
      textColorTextHoverError: accent.errorHover,
      textColorTextPressedError: accent.errorHover,
      textColorTextFocusError: accent.errorHover,
      textColorGhostError: accent.error,
      textColorGhostHoverError: accent.errorHover,
      textColorGhostPressedError: accent.errorHover,
      textColorGhostFocusError: accent.errorHover
    },
    Input: {
      paddingTiny: '0 8px',
      paddingSmall: '0 10px',
      paddingMedium: '0 10px',
      paddingLarge: '0 12px',
      fontSizeTiny: sizes.xs,
      fontSizeSmall: sizes.base,
      fontSizeMedium: sizes.base,
      fontSizeLarge: sizes.base,
      lineHeight: tokens.typography.lineHeights.normal,
      lineHeightTextarea: tokens.typography.lineHeights.normal,
      iconSize: component.inputIconSize,
      color: surface.primary,
      colorFocus: surface.primary,
      colorDisabled: surface.secondary,
      textColor: content.primary,
      placeholderColor: content.muted,
      border: `1px solid ${border.default}`,
      borderHover: `1px solid ${border.strong}`,
      borderFocus: `1px solid ${accent.brand}`,
      boxShadowFocus: interactive.focusRing,
      borderError: `1px solid ${accent.error}`,
      borderHoverError: `1px solid ${accent.error}`,
      borderFocusError: `1px solid ${accent.error}`,
      borderWarning: `1px solid ${accent.warning}`,
      borderHoverWarning: `1px solid ${accent.warning}`,
      borderFocusWarning: `1px solid ${accent.warning}`
    },
    Select: {
      peers: {
        InternalSelection: {
          heightTiny: heights.xs,
          heightSmall: heights.sm,
          heightMedium: heights.sm,
          heightLarge: heights.md,
          fontSizeTiny: sizes.xs,
          fontSizeSmall: sizes.base,
          fontSizeMedium: sizes.base,
          fontSizeLarge: sizes.base,
          color: surface.primary,
          colorActive: surface.primary,
          colorDisabled: surface.secondary,
          border: `1px solid ${border.default}`,
          borderHover: `1px solid ${border.strong}`,
          borderActive: `1px solid ${accent.brand}`,
          borderFocus: `1px solid ${accent.brand}`,
          boxShadowActive: interactive.focusRing,
          boxShadowFocus: interactive.focusRing,
          placeholderColor: content.muted
        },
        InternalSelectMenu: {
          optionTextColor: content.primary,
          optionColorPending: surface.tertiary,
          optionColorActive: accent.soft,
          optionColorActivePending: accent.soft,
          optionTextColorActive: accent.softText,
          optionCheckColor: accent.primary,
          optionHeightMedium: '32px',
          optionFontSizeMedium: sizes.base
        }
      }
    },
    Form: {
      labelFontSizeLeftSmall: sizes.sm,
      labelFontSizeLeftMedium: sizes.sm,
      labelFontSizeLeftLarge: sizes.sm,
      labelFontSizeTopSmall: sizes.sm,
      labelFontSizeTopMedium: sizes.sm,
      labelFontSizeTopLarge: sizes.sm,
      labelTextColor: content.primary,
      feedbackFontSizeSmall: sizes.xs,
      feedbackFontSizeMedium: sizes.xs,
      feedbackFontSizeLarge: sizes.xs
    },
    // 导航类菜单：选中为浅蓝底、文字和图标变蓝
    Menu: {
      borderRadius: component.controlRadius,
      itemHeight: '32px',
      groupTextColor: content.tertiary,
      itemColorHover: surface.tertiary,
      itemColorActive: accent.soft,
      itemColorActiveHover: accent.soft,
      itemColorActiveCollapsed: accent.soft,
      itemTextColor: content.primary,
      itemTextColorHover: content.primary,
      itemTextColorActive: accent.softText,
      itemTextColorActiveHover: accent.softText,
      itemTextColorChildActive: accent.softText,
      itemTextColorChildActiveHover: accent.softText,
      itemIconColor: content.secondary,
      itemIconColorHover: content.primary,
      itemIconColorActive: accent.primary,
      itemIconColorActiveHover: accent.primary,
      itemIconColorChildActive: accent.primary,
      itemIconColorChildActiveHover: accent.primary,
      itemIconColorCollapsed: content.secondary,
      arrowColor: content.tertiary,
      arrowColorHover: content.secondary,
      arrowColorActive: accent.primary,
      arrowColorActiveHover: accent.primary
    },
    Tabs: {
      tabFontSizeSmall: sizes.sm,
      tabFontSizeMedium: sizes.base,
      tabFontSizeLarge: sizes.base,
      tabGapSmallLine: '20px',
      tabGapMediumLine: '20px',
      tabGapLargeLine: '20px',
      tabTextColorLine: content.tertiary,
      tabTextColorHoverLine: content.primary,
      tabTextColorActiveLine: content.primary,
      tabFontWeightActive: weights.medium,
      barColor: accent.primary,
      tabBorderColor: border.default,
      colorSegment: surface.tertiary,
      tabColorSegment: surface.primary,
      tabTextColorSegment: content.secondary,
      tabTextColorHoverSegment: content.primary,
      tabTextColorActiveSegment: accent.softText,
      tabBorderRadius: '4px'
    },
    Tag: {
      heightTiny: '18px',
      heightSmall: '22px',
      heightMedium: '22px',
      heightLarge: '28px',
      fontSizeTiny: sizes.xs,
      fontSizeSmall: sizes.xs,
      fontSizeMedium: sizes.xs,
      fontSizeLarge: sizes.sm,
      borderRadius: component.tagRadius,
      color: surface.tertiary,
      colorBordered: surface.primary,
      textColor: content.secondary,
      border: `1px solid ${border.default}`,
      colorSuccess: accent.successBg,
      colorBorderedSuccess: accent.successBg,
      textColorSuccess: accent.success,
      borderSuccess: `1px solid ${accent.successBorder}`,
      colorWarning: accent.warningBg,
      colorBorderedWarning: accent.warningBg,
      textColorWarning: accent.warning,
      borderWarning: `1px solid ${accent.warningBorder}`,
      colorError: accent.errorBg,
      colorBorderedError: accent.errorBg,
      textColorError: accent.error,
      borderError: `1px solid ${accent.errorBorder}`,
      colorPrimary: accent.soft,
      colorBorderedPrimary: accent.soft,
      textColorPrimary: accent.softText,
      borderPrimary: `1px solid ${accent.softBorder}`
    },
    Switch: {
      railColor: palette.border.strong,
      railColorActive: accent.primary,
      railHeightMedium: '20px',
      railWidthMedium: '34px',
      buttonHeightMedium: '16px',
      buttonWidthMedium: '16px',
      buttonWidthPressedMedium: '20px',
      boxShadowFocus: interactive.focusRing
    },
    Checkbox: {
      colorChecked: accent.primary,
      borderChecked: `1px solid ${accent.primary}`,
      borderFocus: `1px solid ${accent.primary}`,
      boxShadowFocus: interactive.focusRing,
      border: `1px solid ${border.strong}`,
      sizeMedium: '16px'
    },
    Radio: {
      dotColorActive: accent.primary,
      boxShadowActive: `inset 0 0 0 1px ${accent.primary}`,
      boxShadowFocus: interactive.focusRing,
      boxShadowHover: `inset 0 0 0 1px ${border.strong}`,
      boxShadow: `inset 0 0 0 1px ${border.strong}`,
      buttonColorActive: surface.primary,
      buttonTextColorActive: accent.softText,
      buttonBorderColorActive: accent.primary
    },
    Tooltip: {
      color: surface.primary,
      textColor: content.primary,
      borderRadius: component.panelRadius,
      boxShadow: elevation.popover
    },
    Popover: {
      color: surface.primary,
      textColor: content.primary,
      boxShadow: elevation.popover
    },
    Modal: {
      color: surface.primary,
      textColor: content.primary,
      boxShadow: elevation.overlay
    },
    Dialog: {
      color: surface.primary,
      textColor: content.secondary,
      titleTextColor: content.primary,
      titleFontSize: sizes.lg,
      titleFontWeight: weights.semibold,
      borderRadius: component.modalRadius,
      iconColorWarning: accent.warning,
      iconColorError: accent.error,
      iconColorSuccess: accent.success,
      iconColorInfo: accent.primary
    },
    Drawer: {
      color: surface.primary,
      textColor: content.primary,
      titleTextColor: content.primary,
      titleFontSize: sizes.lg,
      titleFontWeight: weights.semibold,
      borderRadius: component.modalRadius,
      boxShadow: elevation.overlay,
      headerBorderBottom: `1px solid ${border.default}`,
      footerBorderTop: `1px solid ${border.default}`
    },
    Dropdown: {
      color: surface.primary,
      dividerColor: border.default,
      borderRadius: component.panelRadius,
      optionHeightMedium: '32px',
      optionTextColor: content.primary,
      optionTextColorHover: content.primary,
      optionTextColorActive: accent.softText,
      optionColorHover: surface.tertiary,
      optionColorActive: accent.soft,
      prefixColor: content.secondary,
      suffixColor: content.tertiary,
      optionIconSizeSmall: component.menuIconSize,
      optionIconSizeMedium: component.menuIconSize,
      optionIconSizeLarge: component.menuIconSize,
      optionIconSizeHuge: component.menuIconSize
    },
    // 表头 36、行高 44；悬停用表面 1，选中由组件自行套浅蓝底
    DataTable: {
      borderColor: border.subtle,
      borderColorModal: border.subtle,
      borderRadius: component.panelRadius,
      thColor: surface.secondary,
      thColorHover: surface.secondary,
      thColorModal: surface.secondary,
      tdColor: surface.primary,
      tdColorModal: surface.primary,
      tdColorHover: surface.secondary,
      tdColorHoverModal: surface.secondary,
      thTextColor: content.secondary,
      tdTextColor: content.primary,
      thFontWeight: weights.medium,
      thPaddingMedium: '8px 12px',
      tdPaddingMedium: '11px 12px',
      thPaddingSmall: '8px 12px',
      tdPaddingSmall: '11px 12px',
      fontSizeSmall: sizes.base,
      fontSizeMedium: sizes.base,
      fontSizeLarge: sizes.base
    },
    Alert: {
      borderRadius: component.panelRadius,
      color: surface.secondary,
      border: `1px solid ${border.default}`,
      contentTextColor: content.primary,
      titleTextColor: content.primary,
      iconColor: content.secondary,
      colorInfo: surface.secondary,
      borderInfo: `1px solid ${border.default}`,
      contentTextColorInfo: content.primary,
      titleTextColorInfo: content.primary,
      iconColorInfo: content.secondary,
      colorSuccess: accent.successBg,
      borderSuccess: `1px solid ${accent.successBorder}`,
      contentTextColorSuccess: content.primary,
      titleTextColorSuccess: content.primary,
      iconColorSuccess: accent.success,
      colorWarning: accent.warningBg,
      borderWarning: `1px solid ${accent.warningBorder}`,
      contentTextColorWarning: content.primary,
      titleTextColorWarning: content.primary,
      iconColorWarning: accent.warning,
      colorError: accent.errorBg,
      borderError: `1px solid ${accent.errorBorder}`,
      contentTextColorError: content.primary,
      titleTextColorError: content.primary,
      iconColorError: accent.error
    },
    Message: {
      color: surface.primary,
      colorInfo: surface.primary,
      colorSuccess: surface.primary,
      colorWarning: surface.primary,
      colorError: surface.primary,
      colorLoading: surface.primary,
      textColor: content.primary,
      textColorInfo: content.primary,
      textColorSuccess: content.primary,
      textColorWarning: content.primary,
      textColorError: content.primary,
      textColorLoading: content.primary,
      iconColorInfo: accent.primary,
      iconColorSuccess: accent.success,
      iconColorWarning: accent.warning,
      iconColorError: accent.error,
      iconColorLoading: accent.primary,
      boxShadow: elevation.popover,
      boxShadowInfo: elevation.popover,
      boxShadowSuccess: elevation.popover,
      boxShadowWarning: elevation.popover,
      boxShadowError: elevation.popover,
      boxShadowLoading: elevation.popover,
      borderRadius: component.panelRadius,
      border: `1px solid ${border.default}`
    },
    Empty: {
      textColor: content.tertiary,
      extraTextColor: content.tertiary
    },
    LoadingBar: {
      colorLoading: accent.primary
    }
  }
}

// 获取 CSS 变量
export function getCssVars(themeName: ThemeName): Record<string, string> {
  const palette = tokens.palette[themeName]
  const { surface, content, accent, indicator, border, interactive, variable, diff, category, overlay, elevation } = palette
  const layout = tokens.layout

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
    "content-inverse": content.inverse,

    // 品牌与操作
    "accent-primary": accent.primary,
    "accent-primary-hover": accent.primaryHover,
    "accent-primary-pressed": accent.primaryPressed,
    "accent-brand": accent.brand,
    "accent-text": accent.text,
    "accent-soft": accent.soft,
    "accent-soft-border": accent.softBorder,
    "accent-soft-text": accent.softText,
    "accent-favorite": accent.favorite,
    "accent-info": accent.info,

    // 语义色
    "accent-success": accent.success,
    "accent-success-bg": accent.successBg,
    "accent-success-border": accent.successBorder,
    "accent-warning": accent.warning,
    "accent-warning-bg": accent.warningBg,
    "accent-warning-border": accent.warningBorder,
    "accent-error": accent.error,
    "accent-error-hover": accent.errorHover,
    "accent-error-solid": accent.errorSolid,
    "accent-error-solid-hover": accent.errorSolidHover,
    "accent-error-bg": accent.errorBg,
    "accent-error-border": accent.errorBorder,

    // 状态圆点
    "indicator-success": indicator.success,
    "indicator-warning": indicator.warning,
    "indicator-error": indicator.error,
    "indicator-neutral": indicator.neutral,

    // 边框颜色
    "border-default": border.default,
    "border-strong": border.strong,
    "border-subtle": border.subtle,

    // 交互颜色
    "interactive-hover": interactive.hover,
    "interactive-active": interactive.active,
    "interactive-focus": interactive.focus,
    "focus-ring": interactive.focusRing,

    // 正文里的变量标记
    "variable-text": variable.text,
    "variable-label": variable.label,
    "variable-bg": variable.bg,
    "variable-border": variable.border,
    "variable-missing": variable.missing,

    // AI 修改与版本对比
    "diff-insert-bg": diff.insertBg,
    "diff-insert-text": diff.insertText,
    "diff-delete-bg": diff.deleteBg,
    "diff-delete-text": diff.deleteText,

    // 分类色
    "category-blue": category.blue,
    "category-orange": category.orange,
    "category-pink": category.pink,
    "category-violet": category.violet,
    "category-green": category.green,
    "category-teal": category.teal,
    "category-amber": category.amber,
    "category-grey": category.grey,

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
    "radius-control": component.controlRadius,
    "radius-panel": component.panelRadius,
    "radius-modal": component.modalRadius,
    "radius-image": component.imageRadius,
    "radius-tag": component.tagRadius,

    // 控件高度
    "control-height-xs": heights.xs,
    "control-height-sm": heights.sm,
    "control-height-md": heights.md,
    "control-height-lg": heights.lg,

    // 页面布局
    "page-padding": component.pagePadding,
    "content-padding": component.contentPadding,
    "compact-padding": component.compactPadding,
    "section-gap": component.sectionGap,
    "rail-width": layout.railWidth,
    "list-width": layout.listWidth,
    "nav-width": layout.navWidth,
    "side-panel-width": layout.sidePanelWidth,
    "statusbar-height": layout.statusbarHeight,
    "page-header-height": layout.pageHeaderHeight,
    "reading-width": layout.readingWidth,
    "page-padding-document": layout.pagePaddingDocument,
    "page-padding-detail": layout.pagePaddingDetail,
    "page-padding-list": layout.pagePaddingList,

    // 浮层尺寸
    "overlay-width-confirm": tokens.overlaySizes.confirm,
    "overlay-width-form": tokens.overlaySizes.form,
    "overlay-width-wizard": tokens.overlaySizes.wizard,
    "overlay-width-workspace": tokens.overlaySizes.workspace,
    "overlay-width-drawer": tokens.overlaySizes.drawer,
    "overlay-width-launcher": tokens.overlaySizes.launcher,

    // 阴影：只给浮层；card 和 floating 只用于移动端
    "shadow-popover": elevation.popover,
    "shadow-overlay": elevation.overlay,
    "shadow-card": elevation.card,
    "shadow-floating": elevation.floating,

    // 字体
    "font-family-sans": tokens.typography.fontFamilies.sans,
    "font-family-mono": tokens.typography.fontFamilies.mono,
    "font-size-xs": sizes.xs,
    "font-size-sm": sizes.sm,
    "font-size-base": sizes.base,
    "font-size-lg": sizes.lg,
    "font-size-xl": sizes.xl,
    "font-size-2xl": sizes["2xl"],
    "font-size-3xl": sizes["3xl"],
    "font-size-4xl": sizes["4xl"],

    // 字重
    "font-weight-normal": weights.normal,
    "font-weight-medium": weights.medium,
    "font-weight-semibold": weights.semibold,
    "font-weight-bold": weights.bold,

    // 行高
    "line-height-tight": tokens.typography.lineHeights.tight,
    "line-height-normal": tokens.typography.lineHeights.normal,
    "line-height-relaxed": tokens.typography.lineHeights.relaxed,
    "line-height-prose": tokens.typography.lineHeights.prose
  }
}

type Rgb = [number, number, number]

function parseRgb(color: string): Rgb {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) throw new Error(`Ionic 色板需要不透明的 rgb() 颜色：${color}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const toRgbList = ([r, g, b]: Rgb) => `${r}, ${g}, ${b}`
const toRgb = (rgb: Rgb) => `rgb(${toRgbList(rgb)})`
const mix = (from: Rgb, to: Rgb, weight: number): Rgb => (
  from.map((channel, index) => Math.round(channel + (to[index] - channel) * weight)) as Rgb
)

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel => {
    const unit = channel / 255
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// 色块上的文字：白字对比度够就用白字，否则用深色正文
function contrastOn(fill: Rgb, dark: Rgb): Rgb {
  const white: Rgb = [255, 255, 255]
  const ratio = (a: Rgb, b: Rgb) => {
    const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
    return (high + 0.05) / (low + 0.05)
  }
  return ratio(fill, white) >= 4.5 ? white : dark
}

/**
 * Ionic 的色板变量（含 -rgb / -contrast / -shade / -tint 和背景、文字阶梯）全部由设计令牌生成。
 * 写成 <html> 的行内样式，优先级高于 Ionic 深色色板里 `.ion-palette-dark.ios` 的规则。
 */
export function getIonicCssVars(themeName: ThemeName): Record<string, string> {
  const { surface, content, accent, border, category } = tokens.palette[themeName]
  const background = parseRgb(surface.body)
  const text = parseRgb(content.primary)
  const darkText = parseRgb(tokens.palette.light.content.primary)

  const vars: Record<string, string> = {
    'ion-background-color': surface.body,
    'ion-background-color-rgb': toRgbList(background),
    'ion-text-color': content.primary,
    'ion-text-color-rgb': toRgbList(text),
    'ion-border-color': border.default,
    'ion-toolbar-background': surface.primary,
    'ion-toolbar-border-color': border.default,
    'ion-tab-bar-background': surface.primary,
    'ion-item-background': surface.primary,
    'ion-card-background': surface.primary,
    'ion-font-family': tokens.typography.fontFamilies.sans
  }

  for (let step = 50; step <= 950; step += 50) {
    const backgroundStep = toRgb(mix(background, text, step / 1000))
    vars[`ion-background-color-step-${step}`] = backgroundStep
    vars[`ion-color-step-${step}`] = backgroundStep
    vars[`ion-text-color-step-${step}`] = toRgb(mix(text, background, step / 1000))
  }

  const colors: Record<string, { base: string; shade?: string; tint?: string }> = {
    primary: { base: accent.primary, shade: accent.primaryPressed, tint: accent.primaryHover },
    secondary: { base: accent.brand },
    tertiary: { base: category.violet },
    success: { base: accent.success },
    warning: { base: accent.warning },
    danger: { base: accent.error, shade: accent.errorHover },
    medium: { base: content.tertiary },
    light: { base: surface.tertiary },
    dark: { base: content.primary }
  }

  for (const [name, color] of Object.entries(colors)) {
    const base = parseRgb(color.base)
    const contrast = contrastOn(base, themeName === 'dark' && name === 'light' ? text : darkText)
    vars[`ion-color-${name}`] = toRgb(base)
    vars[`ion-color-${name}-rgb`] = toRgbList(base)
    vars[`ion-color-${name}-contrast`] = toRgb(contrast)
    vars[`ion-color-${name}-contrast-rgb`] = toRgbList(contrast)
    vars[`ion-color-${name}-shade`] = color.shade ? toRgb(parseRgb(color.shade)) : toRgb(mix(base, [0, 0, 0], 0.12))
    vars[`ion-color-${name}-tint`] = color.tint ? toRgb(parseRgb(color.tint)) : toRgb(mix(base, [255, 255, 255], 0.1))
  }

  return vars
}
