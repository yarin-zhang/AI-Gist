/**
 * 底栏的搜索圆按钮（MobileMainPage.vue）与提示词页搜索框之间的一次性请求。
 *
 * 搜索按钮在 Tab 外壳上，任何一个 Tab 都能点；搜索框属于提示词页。从别的 Tab 点
 * 过来时提示词页可能还没挂载，所以用一个「待处理」标记而不是事件：页面挂载或
 * 标记变化时取走它，再展开搜索框。
 */
import { readonly, ref } from 'vue'

const pending = ref(false)

export const hasPendingPromptSearch = readonly(pending)

export function requestPromptSearch(): void {
  pending.value = true
}

/** 取走待处理的请求；返回 false 表示没有请求或已被取走 */
export function takePromptSearchRequest(): boolean {
  const requested = pending.value
  pending.value = false
  return requested
}
