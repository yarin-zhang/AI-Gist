/** 界面上显示密钥时只露出开头和结尾几位，例如 sk-••••••••3f9a */
export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 10) return '••••••••'
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`
}
