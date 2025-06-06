// 统一的标签颜色管理 composable

import { useThemeVars } from 'naive-ui'

// 统一的颜色色卡配置（按色相排序）
const COLOR_SWATCHES = [
    '#EF444433',  // 红色
    '#F9731633',  // 橙红色
    '#F59E0B33',  // 橙色
    '#EAB30833',  // 黄橙色
    '#FDE04733',  // 黄色
    '#A3E63533',  // 黄绿色
    '#22C55E33',  // 绿色
    '#10B98133',  // 翠绿色
    '#06B6D433',  // 青色
    '#0EA5E933',  // 天蓝色
    '#3B82F633',  // 蓝色
    '#6366F133',  // 靛蓝色
    '#8B5CF633',  // 紫色
    '#A855F733',  // 紫罗兰色
    '#EC489933',  // 粉色
    '#94A3B833',  // 灰色
]

/**
 * 标签颜色管理 composable
 */
export function useTagColors() {
    // 获取当前主题的颜色变量
    const themeVars = useThemeVars()

    /**
     * 简单的字符串哈希函数
     * @param str 输入字符串
     * @returns 哈希值
     */
    const hashString = (str: string): number => {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // 转换为32位整数
        }
        return Math.abs(hash)
    }

    /**
     * 根据标签文本获取颜色配置
     * @param tag 标签文本
     * @returns 颜色配置对象
     */
    const getTagColor = (tag: string) => {
        const hash = hashString(tag)
        const colorIndex = hash % COLOR_SWATCHES.length
        const backgroundColor = COLOR_SWATCHES[colorIndex]
        
        // 移除透明度，用于边框颜色
        const solidColor = backgroundColor.slice(0, 7) + 'CC'
        
        return {
            color: backgroundColor,
            textColor: themeVars.value.textColorBase, // 使用主题的基础文字颜色
            borderColor: solidColor
        }
    }

    /**
     * 解析标签数组
     * @param tags 标签（可以是字符串或数组）
     * @returns 标签数组
     */
    const getTagsArray = (tags: string | string[] | null | undefined): string[] => {
        if (!tags) return []
        return typeof tags === 'string' 
            ? tags.split(',').map(t => t.trim()).filter(t => t) 
            : tags
    }

    return {
        getTagColor,
        getTagsArray,
        COLOR_SWATCHES,
        themeVars // 暴露主题变量，以便组件需要时使用
    }
}
