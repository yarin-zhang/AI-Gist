import type { Component } from 'vue'

export interface SettingsNavGroup {
  key: string
  label: string
  items: { key: string; label: string; icon: Component }[]
}
