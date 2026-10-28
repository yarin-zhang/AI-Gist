/** 文本差异片段：AI 修改建议和版本对比共用 */
export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete'
  value: string
}
