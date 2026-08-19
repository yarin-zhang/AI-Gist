import { ref } from 'vue'
import { databaseService } from '~/lib/db'

/**
 * 是否存在已启用的 AI 配置——跨组件共享的单例状态。
 *
 * 提示词列表页头部的 AI 生成入口、移动端底部浮动导航的两态按钮布局（见
 * Gitea issue #7）都依赖同一个判断。以前每个消费者各自查一次数据库，容易
 * 出现短暂的不一致；这里把查询结果收敛成一份模块级共享状态，谁都读同一个
 * ref，只有真正需要重新查询时才调用 refreshAIConfigStatus()。
 *
 * 什么时候调用 refresh 仍然由调用方决定（页面进入、keep-alive 激活、订阅到
 * ai_configs 数据变更事件等），这里只负责「查一次、存起来、发出去」，并用
 * inFlight 合并掉同一时间窗口内的重复查询。
 */
const hasAIConfig = ref(false)
let inFlight: Promise<void> | null = null

async function refreshAIConfigStatus(): Promise<void> {
  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    try {
      const configs = await databaseService.aiConfig.getEnabledAIConfigs()
      hasAIConfig.value = configs.length > 0
    } catch (error) {
      console.error('检查AI配置失败:', error)
      hasAIConfig.value = false
    }
  })()

  try {
    await inFlight
  } finally {
    inFlight = null
  }
}

export function useAIConfigStatus() {
  return { hasAIConfig, refreshAIConfigStatus }
}
