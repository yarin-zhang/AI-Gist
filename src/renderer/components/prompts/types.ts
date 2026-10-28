/** 提示词区的显示方式；取值沿用 2.x 存在 localStorage 里的写法 */
export type PromptDisplayMode = 'workspace' | 'grid' | 'table' | 'tree'

/** 正文的两种显示：填写值（使用）和变量名（编辑模板） */
export type PromptBodyMode = 'fill' | 'edit'
