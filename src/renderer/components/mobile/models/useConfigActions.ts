import { alertController } from '@ionic/vue'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig } from '@shared/types'
import { forgetConnectionStatus } from './connection-status'

/** 弹一个两按钮确认框，确认返回 true */
const confirmAlert = async (options: {
  header: string
  message: string
  confirmText: string
  cancelText: string
  destructive?: boolean
}) => {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    buttons: [
      { text: options.cancelText, role: 'cancel' },
      { text: options.confirmText, role: options.destructive ? 'destructive' : 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'destructive' || role === 'confirm'
}

/**
 * 模型列表页和配置详情页共用的配置操作：启用/禁用、首选、删除。
 * 每个操作自己负责确认、提示和失败回报，返回是否真的改动了数据，页面据此刷新。
 */
export function useConfigActions() {
  const { t } = useI18n()

  const showToast = (message: string, color = 'success') => presentMobileToast(message, color)

  /** 禁用首选配置前先确认，确认后清掉首选（和桌面端一致） */
  const setEnabled = async (config: AIConfig, enabled: boolean): Promise<boolean> => {
    if (!config.id) return false
    if (!enabled && config.isPreferred) {
      const confirmed = await confirmAlert({
        header: t('aiConfig.workspace.disablePreferredTitle'),
        message: t('aiConfig.workspace.disablePreferredMessage'),
        confirmText: t('aiConfig.workspace.disableAnyway'),
        cancelText: t('common.cancel'),
        destructive: true
      })
      if (!confirmed) return false
    }

    try {
      await api.aiConfigs.update.mutate({
        id: config.id,
        data: {
          ...config,
          enabled,
          isPreferred: enabled ? config.isPreferred : false
        }
      })
      if (!enabled && config.isPreferred) {
        await api.aiConfigs.clearPreferred.mutate()
      }
      config.enabled = enabled
      if (!enabled) config.isPreferred = false
      showToast(enabled ? t('aiConfig.configEnabled') : t('aiConfig.configDisabled'))
      return true
    } catch (error) {
      console.error('更新 AI 配置失败:', error)
      showToast(t('aiConfig.updateFailed'), 'danger')
      return false
    }
  }

  const setPreferred = async (config: AIConfig): Promise<boolean> => {
    if (!config.id || !config.enabled) return false
    try {
      await api.aiConfigs.setPreferred.mutate(config.id)
      config.isPreferred = true
      showToast(t('aiConfig.setAsPreferredSuccess', { name: config.name }))
      return true
    } catch (error) {
      console.error('设置首选配置失败:', error)
      showToast(t('aiConfig.setFailed'), 'danger')
      return false
    }
  }

  /** 取消首选（详情页的开关，直接生效） */
  const clearPreferred = async (): Promise<boolean> => {
    try {
      await api.aiConfigs.clearPreferred.mutate()
      showToast(t('aiConfig.globalPreferredCleared'))
      return true
    } catch (error) {
      console.error('清除首选配置失败:', error)
      showToast(t('aiConfig.clearFailed'), 'danger')
      return false
    }
  }

  const deleteConfig = async (config: AIConfig): Promise<boolean> => {
    if (!config.id) return false
    const confirmed = await confirmAlert({
      header: t('common.confirm'),
      message: t('aiConfig.deleteConfirm', { name: config.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true
    })
    if (!confirmed) return false

    try {
      await api.aiConfigs.delete.mutate(config.id)
      forgetConnectionStatus(config.id)
      showToast(t('aiConfig.configDeleteSuccess'))
      return true
    } catch (error) {
      console.error('删除 AI 配置失败:', error)
      showToast(t('aiConfig.deleteFailed'), 'danger')
      return false
    }
  }

  return { setEnabled, setPreferred, clearPreferred, deleteConfig, showToast, confirmAlert }
}

export { confirmAlert }
