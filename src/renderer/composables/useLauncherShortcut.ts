import { computed, onMounted, ref } from 'vue'
import type { ShortcutState } from '@shared/types'
import { displayAccelerator } from '~/lib/utils/accelerator'

/** 启动器全局快捷键的当前状态：状态栏、主导航和设置页共用 */
export function useLauncherShortcut() {
  const state = ref<ShortcutState | null>(null)
  const available = typeof window !== 'undefined' && !!window.electronAPI?.shortcuts

  const binding = computed(() => state.value?.preferences.commands.launcher)
  const registration = computed(() => (
    state.value?.registrations.find(status => status.id === 'command:launcher')
  ))
  const label = computed(() => displayAccelerator(binding.value?.accelerator || ''))
  const status = computed<'unset' | 'disabled' | 'unavailable' | 'ready'>(() => {
    if (!binding.value?.accelerator) return 'unset'
    if (!binding.value.enabled) return 'disabled'
    if (registration.value && registration.value.state !== 'registered') return 'unavailable'
    return 'ready'
  })

  async function refresh(): Promise<void> {
    if (!available) return
    try {
      state.value = await window.electronAPI.shortcuts.getState()
    } catch {
      // 读不到快捷键状态时仍保留入口，只是不显示组合键
    }
  }

  async function openLauncher(): Promise<void> {
    try {
      await window.electronAPI?.shortcuts?.openLauncher()
    } catch {
      // 启动器打不开时，调用方会把用户带到快捷键设置
    }
  }

  onMounted(() => {
    void refresh()
  })

  return { available, state, label, status, refresh, openLauncher }
}
