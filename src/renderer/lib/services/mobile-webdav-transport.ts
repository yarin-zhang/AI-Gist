import { Capacitor, CapacitorHttp } from '@capacitor/core'
import WebDav from '@renderer/capacitor-bridge/webdav-native'

export type MobileWebDAVResponseType = 'text' | 'json' | 'bytes'

export interface MobileWebDAVRequest {
  url: string
  method: string
  username?: string
  password?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  responseType?: MobileWebDAVResponseType
  connectTimeout?: number
  readTimeout?: number
}

export interface MobileWebDAVResponse {
  status: number
  headers: Record<string, string>
  data: unknown
}

/**
 * Normalizes native Android OkHttp and iOS CapacitorHttp into one WebDAV
 * transport contract. Android intentionally uses OkHttp for every WebDAV
 * method so PROPFIND/MKCOL, conditional requests, ETags, and binary payloads
 * all share the same network stack.
 */
export class MobileWebDAVTransport {
  async request(input: MobileWebDAVRequest): Promise<MobileWebDAVResponse> {
    if (Capacitor.getPlatform() === 'android') {
      return this.requestWithAndroidPlugin(input)
    }
    return this.requestWithCapacitorHttp(input)
  }

  private async requestWithAndroidPlugin(input: MobileWebDAVRequest): Promise<MobileWebDAVResponse> {
    if (input.method.toUpperCase() === 'PROPFIND') {
      const response = await WebDav.propfind({
        url: input.url,
        username: input.username,
        password: input.password,
        depth: Number(input.headers?.Depth || input.headers?.depth || 1),
        connectTimeout: input.connectTimeout,
        readTimeout: input.readTimeout
      })
      return { status: response.status, headers: {}, data: response.body }
    }
    const bodyBase64 = input.body instanceof Uint8Array
      ? encodeBase64(input.body)
      : undefined
    const response = await WebDav.request({
      url: input.url,
      method: input.method,
      username: input.username,
      password: input.password,
      headers: input.headers,
      body: typeof input.body === 'string' ? input.body : undefined,
      bodyBase64,
      contentType: getContentType(input.headers),
      responseType: input.responseType === 'bytes' ? 'base64' : 'text',
      connectTimeout: input.connectTimeout,
      readTimeout: input.readTimeout
    })

    const data = input.responseType === 'bytes'
      ? decodeBase64(response.body || '')
      : parseResponseData(response.body, isSuccessStatus(response.status) ? input.responseType : 'text')
    return {
      status: response.status,
      headers: normalizeHeaders(response.headers),
      data
    }
  }

  private async requestWithCapacitorHttp(input: MobileWebDAVRequest): Promise<MobileWebDAVResponse> {
    const method = input.method.toUpperCase()
    const headers = {
      ...(input.username !== undefined
        ? { Authorization: createBasicAuthorization(input.username, input.password || '') }
        : {}),
      ...(method === 'GET' || method === 'HEAD' ? NO_HTTP_CACHE_HEADERS : {}),
      ...(input.headers || {})
    }
    const request: Record<string, unknown> = {
      url: input.url,
      method: input.method,
      headers,
      connectTimeout: input.connectTimeout,
      readTimeout: input.readTimeout
    }

    if (input.body instanceof Uint8Array) {
      request.data = encodeBase64(input.body)
      request.dataType = 'file'
    } else if (input.body !== undefined) {
      request.data = input.body
    }
    if (input.responseType === 'bytes') {
      request.responseType = 'arraybuffer'
    }

    const response = await CapacitorHttp.request(request as any)
    const data = input.responseType === 'bytes'
      ? await decodeCapacitorBytes(response.data)
      : normalizeCapacitorData(response.data, isSuccessStatus(response.status) ? input.responseType : 'text')
    return {
      status: response.status,
      headers: normalizeHeaders(response.headers),
      data
    }
  }
}

/**
 * iOS 的 CapacitorHttp 走 URLSession.shared，会按响应里的 Last-Modified 自己缓存 GET。
 * 群晖（Apache）这类不发 Cache-Control 的服务器上，同步文件很久没改过时，缓存能用上几个小时：
 * 别的设备上传之后这台手机读到的还是旧内容，同步一直「已是最新」或者反复冲突。
 * 每次读都要到服务器确认；条件读取（If-None-Match）照常由服务器回 304。
 */
const NO_HTTP_CACHE_HEADERS = { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' }

function createBasicAuthorization(username: string, password: string): string {
  return `Basic ${encodeBase64(new TextEncoder().encode(`${username}:${password}`))}`
}

function getContentType(headers?: Record<string, string>): string | undefined {
  if (!headers) return undefined
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')
  return entry?.[1]
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {}
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string | number | boolean] =>
        ['string', 'number', 'boolean'].includes(typeof entry[1]))
      .map(([name, value]) => [name.toLowerCase(), String(value)])
  )
}

/**
 * 只有 2xx 的正文才按 JSON 解析：群晖等服务器的 404 / 401 带的是 HTML 错误页，
 * 拿去解析只会抛「JSON Parse error」，调用方看不到状态码，没法当成「文件不存在」处理
 */
function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300
}

function parseResponseData(body: string, responseType?: MobileWebDAVResponseType): unknown {
  if (responseType !== 'json' || !body) return body
  return JSON.parse(body)
}

function normalizeCapacitorData(data: unknown, responseType?: MobileWebDAVResponseType): unknown {
  if (responseType !== 'json' || typeof data !== 'string') return data
  return data ? JSON.parse(data) : null
}

async function decodeCapacitorBytes(input: unknown): Promise<Uint8Array> {
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer())
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
  }
  if (typeof input === 'string') return decodeBase64(input)
  throw new Error('WebDAV 返回了无法解析的二进制内容')
}

function encodeBase64(data: Uint8Array): string {
  const chunks: string[] = []
  for (let offset = 0; offset < data.byteLength; offset += 0x8000) {
    chunks.push(String.fromCharCode(...data.subarray(offset, offset + 0x8000)))
  }
  return btoa(chunks.join(''))
}

function decodeBase64(value: string): Uint8Array {
  if (!value) return new Uint8Array()
  const binary = atob(value)
  const result = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index)
  }
  return result
}

export const mobileWebDAVTransport = new MobileWebDAVTransport()
