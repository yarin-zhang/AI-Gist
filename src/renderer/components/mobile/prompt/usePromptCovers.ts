import { onUnmounted, watch } from 'vue'
import type { Prompt } from '@shared/types'

const firstImage = (prompt: Pick<Prompt, 'imageBlobs'>) =>
  prompt.imageBlobs?.find(item => item instanceof Blob && item.size > 0)

/**
 * 提示词首页的封面图：取第一张附图生成 object URL。
 * 同一张图只生成一次；列表换了以后回收不再出现的图，页面卸载时全部回收。
 */
export function usePromptCovers(prompts: () => Pick<Prompt, 'imageBlobs'>[]) {
  const urls = new Map<Blob, string>()

  const coverOf = (prompt: Pick<Prompt, 'imageBlobs'>): string | null => {
    const blob = firstImage(prompt)
    if (!blob) return null
    let url = urls.get(blob)
    if (!url) {
      url = URL.createObjectURL(blob)
      urls.set(blob, url)
    }
    return url
  }

  // 在重新渲染之前回收：新列表里的图在渲染时再按需生成
  watch(prompts, list => {
    const alive = new Set(list.map(firstImage))
    for (const [blob, url] of urls) {
      if (alive.has(blob)) continue
      URL.revokeObjectURL(url)
      urls.delete(blob)
    }
  })

  onUnmounted(() => {
    urls.forEach(url => URL.revokeObjectURL(url))
    urls.clear()
  })

  return { coverOf }
}
