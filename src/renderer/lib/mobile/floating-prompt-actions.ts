/**
 * 移动端底部浮动导航「提示词操作区」的两态按钮布局。
 *
 * 对应 Gitea issue #7：提示词 Tab 的浮动操作区过去只有一个「AI 生成」长条按钮，
 * 缺乏重点、也没有直达的「新建提示词」入口。现在改为长条主按钮 + 圆形次按钮的
 * 组合，具体哪个操作占主位、哪个占次位，只取决于用户是否已经配置了可用的 AI：
 *
 * - 未配置 AI：新建提示词是唯一能立刻用的操作，放主位（长条）；AI 生成放次位
 *   （圆形），点击后引导去配置 AI，而不是直接尝试生成。
 * - 已配置 AI：AI 生成体验更完整，提升为主位；新建提示词退居次位。
 *
 * 把这条判断规则抽成不依赖 Vue / DOM 的纯函数，是为了能在不挂载 Ionic 组件树
 * 的前提下用一个轻量单测覆盖状态切换逻辑本身（组件里只负责把 primary/secondary
 * 映射到具体的图标、文案、点击处理函数上）。
 */
export type PromptFloatingActionKind = 'create' | 'ai-generate'

export interface PromptFloatingActions {
  primary: PromptFloatingActionKind
  secondary: PromptFloatingActionKind
}

export function getPromptFloatingActions(hasAIConfig: boolean): PromptFloatingActions {
  return hasAIConfig
    ? { primary: 'ai-generate', secondary: 'create' }
    : { primary: 'create', secondary: 'ai-generate' }
}
