/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 表面颜色
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          sidebar: 'var(--surface-sidebar)',
          body: 'var(--surface-body)',
        },
        // 内容颜色
        content: {
          primary: 'var(--content-primary)',
          secondary: 'var(--content-secondary)',
          tertiary: 'var(--content-tertiary)',
          muted: 'var(--content-muted)',
        },
        // 强调色
        accent: {
          primary: 'var(--accent-primary)',
          success: 'var(--accent-success)',
          warning: 'var(--accent-warning)',
          error: 'var(--accent-error)',
          info: 'var(--accent-info)',
        },
        // 边框颜色
        border: {
          default: 'var(--border-default)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
        },
        // 交互颜色
        interactive: {
          hover: 'var(--interactive-hover)',
          active: 'var(--interactive-active)',
          focus: 'var(--interactive-focus)',
        }
      },
      spacing: {
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
      },
      fontSize: {
        'xs': 'var(--font-size-xs)',
        'sm': 'var(--font-size-sm)',
        'base': 'var(--font-size-base)',
        'lg': 'var(--font-size-lg)',
        'xl': 'var(--font-size-xl)',
        '2xl': 'var(--font-size-2xl)',
        '3xl': 'var(--font-size-3xl)',
        '4xl': 'var(--font-size-4xl)',
      },
      fontWeight: {
        'normal': 'var(--font-weight-normal)',
        'medium': 'var(--font-weight-medium)',
        'semibold': 'var(--font-weight-semibold)',
        'bold': 'var(--font-weight-bold)',
      },
      lineHeight: {
        'tight': 'var(--line-height-tight)',
        'normal': 'var(--line-height-normal)',
        'relaxed': 'var(--line-height-relaxed)',
      }
    },
  },
  plugins: [],
} 