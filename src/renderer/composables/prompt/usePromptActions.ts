import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import type { PromptWithRelations } from '@shared/types/database'
import { api } from '@/lib/api'
import { DataManagementAPI } from '@/lib/api/data-management.api'
import { databaseService } from '@/lib/services'
import { getRuntimeVariables, renderPromptContent } from '@/lib/utils/prompt-runtime'
import { recordPromptUsage } from '@/lib/utils/prompt-usage'

/**
 * 卡片、表格、文件夹视图里不打开提示词就能做的操作。
 * 每个操作完成后调用 onChanged，由提示词区重新加载数据。
 */
export function usePromptActions(onChanged: (prompt?: PromptWithRelations) => void) {
  const { t } = useI18n()
  const message = useMessage()

  /** 直接复制：没填的变量用默认值，没有默认值的写成 [变量名] */
  const copyWithDefaults = async (prompt: PromptWithRelations) => {
    try {
      const variables = Object.fromEntries(getRuntimeVariables(prompt).map(variable => [
        variable.name,
        variable.defaultValue === undefined || variable.defaultValue === '' ? `[${variable.name}]` : variable.defaultValue,
      ]))
      let content = prompt.content
      try {
        content = renderPromptContent(prompt, variables)
      } catch (error) {
        console.error('提示词默认变量渲染失败:', error)
      }
      await navigator.clipboard.writeText(content)
      if (prompt.id) {
        const updated = await recordPromptUsage({
          promptId: prompt.id,
          content,
          variables,
          incrementUseCount: id => api.prompts.incrementUseCount.mutate(id),
        })
        onChanged(updated as PromptWithRelations)
      }
      message.success(t('promptManagement.copyPromptSuccess'))
    } catch (error) {
      console.error('复制提示词失败:', error)
      message.error(t('promptManagement.copyFailed'))
    }
  }

  const copyRaw = async (prompt: PromptWithRelations) => {
    try {
      await navigator.clipboard.writeText(prompt.content)
      message.success(t('promptManagement.copyOriginalContentSuccess'))
    } catch {
      message.error(t('promptManagement.copyFailed'))
    }
  }

  const toggleFavorite = async (prompt: PromptWithRelations) => {
    if (!prompt.id) return
    try {
      const updated = await api.prompts.toggleFavorite.mutate(prompt.id) as PromptWithRelations
      onChanged(updated)
      // 从菜单收藏 / 取消收藏时卡片上只有星标变化，给一句提示
      message.success(updated?.isFavorite ? t('promptBrowse.favoriteAdded') : t('promptBrowse.favoriteRemoved'))
    } catch (error) {
      console.error(error)
      message.error(t('promptManagement.updateFavoriteFailed'))
    }
  }

  /** 移到另一个分类；categoryId 为 null 表示移出分类 */
  const moveToCategory = async (prompts: PromptWithRelations[], categoryId: number | null, categoryName: string) => {
    const targets = prompts.filter(prompt => prompt.id && (prompt.categoryId ?? null) !== categoryId)
    if (!targets.length) return
    try {
      for (const prompt of targets) {
        await api.prompts.update.mutate({ id: prompt.id!, data: { categoryId: categoryId ?? undefined } as never })
      }
      message.success(targets.length === 1
        ? t('promptManagement.movePromptSuccess', { name: categoryName })
        : t('promptBrowse.movedMany', { count: targets.length, name: categoryName }, targets.length))
      onChanged()
    } catch (error) {
      console.error('移动提示词失败:', error)
      message.error(t('promptManagement.movePromptFailed'))
    }
  }

  /** 导出所选提示词，格式与「数据备份 · 选择性导出」一致 */
  const exportPrompts = async (ids: number[], format: 'json' | 'csv') => {
    try {
      const result = await databaseService.exportAllData()
      if (!result?.success) throw new Error('export failed')
      const idSet = new Set(ids)
      const prompts = (result.data?.prompts || []).filter((prompt: PromptWithRelations) => prompt.id && idSet.has(prompt.id))
      const date = new Date().toISOString().split('T')[0]
      const filePath = await DataManagementAPI.selectExportPath(`ai-gist-prompts-${date}.${format}`)
      if (!filePath) return
      // CSV 里分类写名称，需要分类列表来对照
      const ok = await DataManagementAPI.exportDataToFile({ prompts }, filePath, format, { categories: result.data?.categories })
      if (ok) message.success(t('promptBrowse.exported', { count: prompts.length }))
      else message.error(t('promptBrowse.exportFailed'))
    } catch (error) {
      console.error('导出提示词失败:', error)
      message.error(t('promptBrowse.exportFailed'))
    }
  }

  return { copyWithDefaults, copyRaw, toggleFavorite, moveToCategory, exportPrompts }
}
