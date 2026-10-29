import type { ProxyTestSiteId, ProxyTestSiteResult } from '@shared/types/network-proxy'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** 测试站点的名称和说明，按界面语言显示 */
export function proxySiteLabel(id: ProxyTestSiteId, t: Translate): { name: string; description: string } {
  switch (id) {
    case 'baidu':
      return { name: t('networkProxy.sites.baidu.name'), description: t('networkProxy.sites.baidu.description') }
    case 'github':
      return { name: t('networkProxy.sites.github.name'), description: t('networkProxy.sites.github.description') }
    case 'google':
      return { name: t('networkProxy.sites.google.name'), description: t('networkProxy.sites.google.description') }
    case 'openai':
      return { name: t('networkProxy.sites.openai.name'), description: t('networkProxy.sites.openai.description') }
  }
}

/** 单个站点连不上的原因（超时、代理连不上、访问不到、网站返回错误） */
export function describeProxyTestError(result: Pick<ProxyTestSiteResult, 'errorCode' | 'statusCode'>, t: Translate): string {
  switch (result.errorCode) {
    case 'timeout':
      return t('networkProxy.siteErrors.timeout')
    case 'proxy-refused':
      return t('networkProxy.siteErrors.proxyRefused')
    case 'http-error':
      return t('networkProxy.siteErrors.httpError', { status: result.statusCode ?? '' })
    default:
      return t('networkProxy.siteErrors.unreachable')
  }
}
