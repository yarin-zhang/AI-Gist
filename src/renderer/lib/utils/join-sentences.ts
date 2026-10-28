/**
 * 两句说明接在一起：第一句没有句末标点时补上；中文、日文句号后不加空格，其他语言加一个空格。
 * 已经带句末标点的不会再多出一个（避免「。. 」「。；」这类重复标点）。
 */
export const joinSentences = (first: string, second: string, locale: string) => {
  const cjk = /^(zh|ja)/.test(locale)
  const lead = first.trim()
  if (!lead) return second
  const ended = /[。．.!！?？]$/.test(lead) ? lead : `${lead}${cjk ? '。' : '.'}`
  return `${ended}${cjk ? '' : ' '}${second}`
}
