import { useThemeVars } from 'naive-ui'
import {
    COLOR_SWATCHES,
    getCategoryTagColor as getSharedCategoryTagColor,
    getTagColor as getSharedTagColor,
    getTagsArray,
} from '@/lib/utils/tag-colors'

/**
 * 标签颜色管理 composable
 */
export function useTagColors() {
    const themeVars = useThemeVars()

    const getTagColor = (tag: string) => getSharedTagColor(tag, themeVars.value.textColorBase)
    const getCategoryTagColor = (category: Parameters<typeof getSharedCategoryTagColor>[0]) => (
        getSharedCategoryTagColor(category, themeVars.value.textColorBase)
    )

    return {
        getTagColor,
        getTagsArray,
        getCategoryTagColor,
        COLOR_SWATCHES,
        themeVars
    }
}
