/**
 * 正文里输入 `{{` 后的变量补全：按已经输入的文字筛选、排序已有变量。
 * 完全匹配排第一，其次是前缀匹配，再其次是名字里包含输入的；同一档里保持变量原来的顺序。
 * 没输入任何文字时列出全部变量。比较时不区分大小写。
 */
export function rankVariableCompletions(names: string[], typed: string): string[] {
  const unique = [...new Set(names.filter(Boolean))]
  const query = typed.trim().toLowerCase()
  if (!query) return unique
  const rank = (name: string) => {
    const lower = name.toLowerCase()
    if (lower === query) return 0
    if (lower.startsWith(query)) return 1
    return lower.includes(query) ? 2 : -1
  }
  return unique
    .map((name, index) => ({ name, index, rank: rank(name) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.name)
}

/** 变量名里和输入匹配的那一段，给补全列表高亮用；没有匹配时返回空数组 */
export function findCompletionMatch(name: string, typed: string): number[] {
  const query = typed.trim().toLowerCase()
  if (!query) return []
  const start = name.toLowerCase().indexOf(query)
  return start >= 0 ? [start, start + query.length] : []
}
