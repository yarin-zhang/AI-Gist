import { h, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon, type DropdownOption } from 'naive-ui'
import { Check, ClipboardCheck, Copy, Edit, FileText, Folder, Keyboard, Star, Trash } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'

/** move:<分类 id> 移到这个分类，move:none 移出分类 */
export type PromptMoveAction = `move:${number}` | 'move:none'
export type PromptMenuAction = 'open' | 'edit' | 'copy' | 'copy-raw' | 'favorite' | 'shortcut' | 'delete' | PromptMoveAction

/** 菜单里选中的「移到分类」对应的分类 id；不是移动操作时返回 undefined，移出分类时返回 null */
export const parseMoveAction = (action: string): number | null | undefined => {
  if (!action.startsWith('move:')) return undefined
  const value = action.slice('move:'.length)
  if (value === 'none') return null
  const id = Number(value)
  return Number.isFinite(id) ? id : undefined
}

/**
 * 卡片、表格行、文件夹卡片右上角「更多」菜单的选项。三个视图用同一份菜单，能做的事一样：
 * 打开、编辑、用默认值复制、复制原始内容、移到分类、收藏、（桌面端）快捷键、删除。
 */
export function usePromptMenu(canSetShortcut: boolean, categories: () => Category[] = () => []) {
  const { t } = useI18n()
  const icon = (component: Component) => () => h(NIcon, { size: 16 }, { default: () => h(component) })
  const dot = (color?: string | null) => () => h(UiCategoryDot, { color })
  // 当前所在的分类打勾并禁用，其余的点了就移过去
  const categoryOption = (key: PromptMoveAction, label: string, color: string | null | undefined, current: boolean): DropdownOption => ({
    key,
    label,
    icon: current ? icon(Check) : dot(color),
    disabled: current,
  })

  return (prompt: PromptWithRelations, hasShortcut = false): DropdownOption[] => [
    { key: 'open', label: t('promptBrowse.open'), icon: icon(FileText) },
    { key: 'edit', label: t('promptBrowse.edit'), icon: icon(Edit) },
    { key: 'copy', label: t('promptBrowse.copyWithDefaults'), icon: icon(ClipboardCheck) },
    { key: 'copy-raw', label: t('promptPage.copyRaw'), icon: icon(Copy) },
    {
      key: 'move',
      label: t('promptBrowse.moveToCategory'),
      icon: icon(Folder),
      children: [
        ...categories().filter(category => category.id !== undefined).map(category => categoryOption(
          `move:${category.id!}`, category.name, category.color, prompt.categoryId === category.id,
        )),
        categoryOption('move:none', t('promptLibrary.uncategorized'), null, !prompt.categoryId),
      ],
    },
    { key: 'favorite', label: prompt.isFavorite ? t('promptPage.unfavorite') : t('promptPage.favorite'), icon: icon(Star) },
    ...(canSetShortcut
      ? [{ key: 'shortcut', label: hasShortcut ? t('shortcuts.editPromptBinding') : t('shortcuts.assignPromptBinding'), icon: icon(Keyboard) }]
      : []),
    { type: 'divider', key: 'divider' },
    { key: 'delete', label: t('common.delete'), icon: icon(Trash), props: { class: 'is-danger' } },
  ]
}
