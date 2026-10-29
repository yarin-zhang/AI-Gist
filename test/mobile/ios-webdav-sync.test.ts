/**
 * iOS 版连群晖（Apache）WebDAV：配置完全正确，测试连接却失败，同步读到旧数据。
 * - 群晖把 .json 标成 application/json，iOS 的 CapacitorHttp 会强行按 JSON 解析，
 *   解析不了就把「未能读取数据，因为它的格式不正确。」当成正文交回来，探针读回校验失败
 * - CapacitorHttp 走 URLSession.shared，会按 Last-Modified 自己缓存 GET；
 *   条件读取时还会拿缓存里更早的正文配上服务器回的 ETag 冒充 200
 * - iOS 的网络错误是按系统语言翻译过的句子，诊断认不出来，只能显示通用说明
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPreferences: Record<string, string> = {}
const httpRequest = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) => Promise.resolve({ value: mockPreferences[key] ?? null })),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      mockPreferences[key] = value
      return Promise.resolve()
    })
  }
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {},
  Directory: { Documents: 'DOCUMENTS', Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' }
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: { request: httpRequest },
  registerPlugin: vi.fn(() => ({}))
}))

vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: { propfind: vi.fn(), request: vi.fn() }
}))

import i18n from '~/i18n'
import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { MobileWebDAVTransport } from '~/lib/services/mobile-webdav-transport'
import { getCloudStorageConnectionDiagnosis } from '~/lib/services/cloud-sync.service'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRevision,
  type CloudSyncManifest
} from '@shared/cloud-sync-manifest'

const config = {
  id: 'nas',
  name: 'NAS',
  type: 'webdav' as const,
  enabled: true,
  url: 'https://nas.example.com:5006/home/Drive/AI/Gist',
  username: 'user',
  password: 'pass',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z'
}

const CAPACITOR_JSON_PARSE_ERROR = '未能读取数据，因为它的格式不正确。'

/** CapacitorHttp 在 iOS 上的做法：Content-Type 是 application/json 就解析，解析不了交回错误描述 */
function capacitorIOSBody(body: string, contentType: string): unknown {
  if (!contentType.includes('application/json')) return body
  try {
    const parsed = JSON.parse(body)
    // NSDictionary 不保证字段顺序
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).reverse())
      : parsed
  } catch {
    return CAPACITOR_JSON_PARSE_ERROR
  }
}

/** 群晖 WebDAV 的样子：.json 文件按 application/json 返回，支持条件写入 */
function installSynologyLikeServer() {
  const files = new Map<string, string>()
  const etagOf = (body: string) => `"${Buffer.from(body).toString('base64').slice(0, 12)}"`
  httpRequest.mockImplementation(async (request: any) => {
    const path = new URL(request.url).pathname
    switch (request.method) {
      case 'OPTIONS':
        return { status: 200, data: '', headers: { DAV: '1,2' } }
      case 'MKCOL':
        return { status: 405, data: '', headers: {} }
      case 'PUT':
        if (request.headers?.['If-None-Match'] === '*' && files.has(path)) {
          return { status: 412, data: '', headers: {} }
        }
        files.set(path, request.data)
        return { status: 201, data: '', headers: { ETag: etagOf(request.data) } }
      case 'GET': {
        const body = files.get(path)
        if (body === undefined) return { status: 404, data: '', headers: {} }
        const contentType = path.endsWith('.json') ? 'application/json' : 'text/plain'
        return { status: 200, data: capacitorIOSBody(body, contentType), headers: { ETag: etagOf(body), 'Content-Type': contentType } }
      }
      case 'PROPFIND': {
        const names = [...files.keys()].map(file => `<D:response><D:href>${file}</D:href></D:response>`).join('')
        return { status: 207, data: `<D:multistatus xmlns:D="DAV:">${names}</D:multistatus>`, headers: {} }
      }
      case 'DELETE':
        files.delete(path)
        return { status: 204, data: '', headers: {} }
      default:
        return { status: 500, data: '', headers: {} }
    }
  })
}

function manifestAt(revision: string, title: string): CloudSyncManifest {
  return {
    ...createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot({
      prompts: [{ id: 1, uuid: 'prompt-1', title, updatedAt: '2026-10-29T00:00:00.000Z' }]
    }, 'device-a', revision)
  }
}

beforeEach(() => {
  Object.keys(mockPreferences).forEach(key => delete mockPreferences[key])
  vi.clearAllMocks()
  mockPreferences.cloud_backup_configs = JSON.stringify([config])
})

describe('iOS 连群晖 WebDAV', () => {
  it('配置正确时测试连接成功：探针是 JSON，被解析成对象、字段换了顺序也认得出', async () => {
    installSynologyLikeServer()
    const service = new (MobileCloudBackupService as any)() as MobileCloudBackupService

    const result = await service.testStorageConnection(config)

    expect(result).toMatchObject({ success: true })
    const probeRead = httpRequest.mock.calls.find(([request]) => request.method === 'GET')?.[0]
    expect(probeRead.url).toMatch(/\.ai-gist-mobile-probe-.+\.json$/)
    // 以前的探针是普通文本：在这类服务器上读回来的只会是这句错误描述
    expect(capacitorIOSBody('ai-gist-webdav-probe:2026', 'application/json')).toBe(CAPACITOR_JSON_PARSE_ERROR)
  })

  it('条件读取时 iOS 拿缓存里的旧正文配上同一个 ETag 冒充 200：用自己确认过的那份，不用旧正文', async () => {
    const service = new (MobileCloudBackupService as any)() as MobileCloudBackupService
    const current = manifestAt('rev-2', '另一台设备改过')
    const stale = manifestAt('rev-1', '旧的')
    httpRequest.mockImplementation(async (request: any) => {
      if (request.method !== 'GET') return { status: 404, data: '', headers: {} }
      // 第一次是普通读取，拿到当前这份；之后带 If-None-Match 的读取，URLSession 交回缓存里更早的正文
      return request.headers?.['If-None-Match']
        ? { status: 200, data: stale, headers: { etag: '"e-rev-2"' } }
        : { status: 200, data: current, headers: { etag: '"e-rev-2"' } }
    })

    expect(getCloudSyncManifestRevision(await service.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(getCloudSyncManifestRevision(await service.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(httpRequest.mock.calls[1][0].headers['If-None-Match']).toBe('"e-rev-2"')
  })

  it('每次 GET 都让 iOS 去服务器确认，不用系统缓存；写入请求不带这些头', async () => {
    httpRequest.mockResolvedValue({ status: 200, data: '', headers: {} })
    const transport = new MobileWebDAVTransport()

    await transport.request({ url: 'https://nas.example.com/a.json', method: 'GET', username: 'u', password: 'p' })
    await transport.request({ url: 'https://nas.example.com/a.json', method: 'GET', headers: { 'If-None-Match': '"e"' } })
    await transport.request({ url: 'https://nas.example.com/a.json', method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } })

    const [plain, conditional, put] = httpRequest.mock.calls.map(([request]) => request.headers)
    expect(plain).toMatchObject({ 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' })
    expect(conditional).toMatchObject({ 'Cache-Control': 'no-cache, no-store', 'If-None-Match': '"e"' })
    expect(put).not.toHaveProperty('Cache-Control')
  })

  it('原生层关掉 URLSession 的缓存并清掉以前存下的；http 地址和 Android 一样能用', () => {
    const appDelegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8')
    const launch = appDelegate.slice(appDelegate.indexOf('didFinishLaunchingWithOptions'), appDelegate.indexOf('PromptAccessory.register()'))
    expect(launch).toContain('URLCache.shared.removeAllCachedResponses()')
    expect(launch).toContain('URLCache.shared = URLCache(memoryCapacity: 0, diskCapacity: 0, directory: nil)')

    const infoPlist = readFileSync('ios/App/App/Info.plist', 'utf8')
    expect(infoPlist).toMatch(/<key>NSAppTransportSecurity<\/key>\s*<dict>\s*<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/)
    expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')).toContain('android:usesCleartextTraffic="true"')
  })
})

describe('群晖压缩响应时 GET 的 ETag 带 -gzip，条件写只认原来的写法', () => {
  /** 群晖 Apache（mod_deflate）：GET 的 ETag 是 "x-gzip"，PROPFIND 和 If-Match 用的是 "x" */
  function installGzipEtagServer() {
    let body = ''
    let version = 0
    const etag = () => `"v${version}"`
    const puts: string[] = []
    httpRequest.mockImplementation(async (request: any) => {
      const path = new URL(request.url).pathname
      const isPrimary = path.endsWith('/sync-manifest.json')
      switch (request.method) {
        case 'MKCOL':
          return { status: 405, data: '', headers: {} }
        case 'GET':
          if (!isPrimary) return { status: 404, data: '', headers: {} }
          return body
            ? { status: 200, data: JSON.parse(body), headers: { etag: `"v${version}-gzip"` } }
            : { status: 404, data: '', headers: {} }
        case 'PROPFIND':
          return { status: 207, data: `<D:multistatus xmlns:D="DAV:"><D:response><D:href>${path}</D:href><D:propstat><D:prop><D:getetag>${etag()}</D:getetag></D:prop></D:propstat></D:response></D:multistatus>`, headers: {} }
        case 'PUT': {
          if (!isPrimary) return { status: 204, data: '', headers: {} }
          const ifMatch = request.headers?.['If-Match']
          puts.push(ifMatch ? `If-Match ${ifMatch}` : 'unconditional')
          if (ifMatch && ifMatch !== etag()) return { status: 412, data: '', headers: {} }
          body = request.data
          version += 1
          return { status: 204, data: '', headers: {} }
        }
        default:
          return { status: 500, data: '', headers: {} }
      }
    })
    return {
      puts,
      /** 另一台设备直接改了云端 */
      writeElsewhere(manifest: CloudSyncManifest) {
        body = JSON.stringify(manifest)
        version += 1
      }
    }
  }

  it('第一次被 412 拒后，确认云端没变，改用 PROPFIND 的 ETag 写成功；之后直接用它', async () => {
    const server = installGzipEtagServer()
    const service = new (MobileCloudBackupService as any)() as MobileCloudBackupService
    await service.saveCloudSyncManifest(config.id, manifestAt('rev-1', '第一版'))

    expect(await service.saveCloudSyncManifest(config.id, manifestAt('rev-2', '手机改过'), { expectedRevision: 'rev-1' }))
      .toMatchObject({ success: true })
    expect(await service.saveCloudSyncManifest(config.id, manifestAt('rev-3', '手机又改'), { expectedRevision: 'rev-2' }))
      .toMatchObject({ success: true })

    expect(server.puts).toEqual([
      'unconditional',
      'If-Match "v1-gzip"',
      'If-Match "v1"',
      'If-Match "v2"'
    ])
    expect(getCloudSyncManifestRevision(await service.getCloudSyncManifest(config.id))).toBe('rev-3')
  })

  it('云端真被别的设备改了时仍然报冲突，不会覆盖', async () => {
    const server = installGzipEtagServer()
    const service = new (MobileCloudBackupService as any)() as MobileCloudBackupService
    await service.saveCloudSyncManifest(config.id, manifestAt('rev-1', '第一版'))
    server.writeElsewhere(manifestAt('rev-other', '另一台设备写的'))

    await expect(service.saveCloudSyncManifest(config.id, manifestAt('rev-2', '手机改过'), { expectedRevision: 'rev-1' }))
      .resolves.toMatchObject({ success: false, conflict: true })
    expect(getCloudSyncManifestRevision(await service.getCloudSyncManifest(config.id))).toBe('rev-other')
  })
})

describe('iOS 的网络错误按原因说明，不再都是「请检查地址、用户名和密码」', () => {
  const t = (key: string) => String(i18n.global.t(key))

  it.each([
    ['无法连接服务器。', 'refused'],
    ['Could not connect to the server.', 'refused'],
    ['未能找到使用指定主机名的服务器。', 'hostNotFound'],
    ['A server with the specified hostname could not be found.', 'hostNotFound'],
    ['此服务器的证书无效。你可能正在连接一个伪装成“nas.example.com”的服务器，这会威胁到你的机密信息的安全。', 'tls'],
    ['The certificate for this server is invalid.', 'tls'],
    ['TLS错误导致安全连接失败。', 'tls'],
    ['请求超时。', 'timeout'],
    ['似乎已断开与互联网的连接。', 'timeout'],
    ['The Internet connection appears to be offline.', 'timeout'],
    ['认证失败，请检查用户名和密码', 'auth']
  ])('%s', (error, kind) => {
    i18n.global.locale.value = 'zh-CN' as never
    expect(getCloudStorageConnectionDiagnosis(error).title).toBe(t(`dataSync.connectionDiagnosis.${kind}.title`))
  })
})
