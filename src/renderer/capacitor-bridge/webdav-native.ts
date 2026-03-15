/**
 * WebDAV 原生插件 TypeScript 桥接
 *
 * Android 上，CapacitorHttp 底层使用 HttpURLConnection，其 setRequestMethod()
 * 方法有硬编码白名单 [GET, POST, HEAD, OPTIONS, PUT, DELETE, TRACE, PATCH]，
 * 不支持 PROPFIND，会抛出 java.net.ProtocolException。
 *
 * 此插件通过 OkHttp 在原生层执行 WebDAV 请求：
 * 1. OkHttp 支持任意 HTTP 方法（包括 PROPFIND、MKCOL）
 * 2. 原生层发出请求，不受 WebView 的 CORS 策略限制
 */

import { registerPlugin } from '@capacitor/core'

export interface WebDavPlugin {
  /**
   * 执行 WebDAV PROPFIND 请求，列出目录内容
   */
  propfind(options: {
    url: string
    username?: string
    password?: string
    depth?: number
  }): Promise<{ status: number; body: string }>

  /**
   * 执行通用 WebDAV 请求（GET、PUT、DELETE、MKCOL 等）
   */
  request(options: {
    url: string
    method: string
    username?: string
    password?: string
    body?: string
    contentType?: string
  }): Promise<{ status: number; body: string }>
}

const WebDav = registerPlugin<WebDavPlugin>('WebDav')

export default WebDav
