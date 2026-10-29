/**
 * 网络代理连接测试的结果。站点名称和失败原因都只传代码，由渲染进程按界面语言翻译。
 */

export type ProxyTestSiteId = 'baidu' | 'github' | 'google' | 'openai';

/**
 * 单个站点测试失败的原因：
 * - timeout：等了 5 秒没响应
 * - proxy-refused：连不上代理服务器（地址、端口不对，或代理软件没开）
 * - unreachable：DNS 解析失败、连接被拒绝或重置等，网站访问不到
 * - http-error：连上了，但网站返回了错误状态码
 */
export type ProxyTestErrorCode = 'timeout' | 'proxy-refused' | 'unreachable' | 'http-error';

export interface ProxyTestSiteResult {
  id: ProxyTestSiteId;
  url: string;
  success: boolean;
  responseTime?: number;
  errorCode?: ProxyTestErrorCode;
  /** errorCode 为 http-error 时的状态码 */
  statusCode?: number;
}

export interface ProxyTestOverall {
  success: boolean;
  totalSites: number;
  successSites: number;
  failedSites: number;
}
