/**
 * 纯 Node.js 内置模块实现的 WebDAV 测试服务器
 * 支持 Basic Auth、PROPFIND / GET / PUT / DELETE / MKCOL / OPTIONS
 * 无需任何额外 npm 依赖
 */

import http from 'http'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

export interface WebDAVServerOptions {
  port?: number
  username?: string
  password?: string
  rootDir?: string
}

// ---- XML 工具 ----

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function propfindXml(entries: { href: string; isDir: boolean; size: number; mtime: Date }[]): string {
  const responses = entries.map(e => {
    const resourcetype = e.isDir ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>'
    const extra = e.isDir ? '' : `<D:getcontentlength>${e.size}</D:getcontentlength>`
    return `
  <D:response>
    <D:href>${escapeXml(e.href)}</D:href>
    <D:propstat>
      <D:prop>
        ${resourcetype}
        ${extra}
        <D:getlastmodified>${e.mtime.toUTCString()}</D:getlastmodified>
        <D:displayname>${escapeXml(path.basename(e.href) || '/')}</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`
  }).join('')

  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${responses}\n</D:multistatus>`
}

// ---- 服务器主体 ----

export class TestWebDAVServer {
  private server: http.Server
  readonly rootDir: string
  private username: string
  private password: string
  readonly port: number

  constructor(opts: WebDAVServerOptions = {}) {
    this.port     = opts.port     ?? 18765
    this.username = opts.username ?? 'testuser'
    this.password = opts.password ?? 'testpass'
    this.rootDir  = opts.rootDir  ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-webdav-'))
    this.server   = this.createServer()
  }

  // ---- 生命周期 ----

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, '127.0.0.1', () => resolve())
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        // 清理临时目录
        try { fs.rmSync(this.rootDir, { recursive: true, force: true }) } catch {}
        err ? reject(err) : resolve()
      })
    })
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  // ---- HTTP 服务器 ----

  private createServer(): http.Server {
    return http.createServer(async (req, res) => {
      // Basic Auth 验证
      if (!this.checkAuth(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="WebDAV"' })
        res.end()
        return
      }

      const urlPath = decodeURIComponent(new URL(req.url ?? '/', `http://127.0.0.1`).pathname)
      const fsPath  = path.join(this.rootDir, urlPath)

      try {
        switch (req.method?.toUpperCase()) {
          case 'OPTIONS':   await this.handleOptions(req, res); break
          case 'PROPFIND':  await this.handlePropfind(req, res, urlPath, fsPath); break
          case 'GET':       await this.handleGet(req, res, fsPath); break
          case 'PUT':       await this.handlePut(req, res, fsPath); break
          case 'DELETE':    await this.handleDelete(req, res, fsPath); break
          case 'MKCOL':     await this.handleMkcol(req, res, fsPath); break
          default:
            res.writeHead(405); res.end()
        }
      } catch (err: any) {
        console.error('[WebDAV Server]', req.method, urlPath, err.message)
        res.writeHead(500); res.end(err.message)
      }
    })
  }

  // ---- Auth ----

  private checkAuth(req: http.IncomingMessage): boolean {
    const header = req.headers['authorization'] ?? ''
    if (!header.startsWith('Basic ')) return false
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8')
    const [u, p]  = decoded.split(':', 2)
    return u === this.username && p === this.password
  }

  // ---- 方法处理器 ----

  private async handleOptions(_req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'DAV': '1, 2',
      'Allow': 'OPTIONS, GET, PUT, DELETE, MKCOL, PROPFIND',
      'Content-Length': '0',
    })
    res.end()
  }

  private async handlePropfind(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    urlPath: string,
    fsPath: string,
  ) {
    let stat: fs.Stats
    try {
      stat = await fsp.stat(fsPath)
    } catch {
      res.writeHead(404); res.end(); return
    }

    const depth = req.headers['depth'] ?? '1'
    const entries: { href: string; isDir: boolean; size: number; mtime: Date }[] = []

    // 当前资源本身
    entries.push({
      href:  urlPath.endsWith('/') ? urlPath : urlPath + (stat.isDirectory() ? '/' : ''),
      isDir: stat.isDirectory(),
      size:  stat.size,
      mtime: stat.mtime,
    })

    // depth=1 时列出子项
    if (depth !== '0' && stat.isDirectory()) {
      const children = await fsp.readdir(fsPath)
      for (const name of children) {
        const childFsPath  = path.join(fsPath, name)
        const childStat    = await fsp.stat(childFsPath)
        const childUrlPath = (urlPath.endsWith('/') ? urlPath : urlPath + '/') + name
        entries.push({
          href:  childUrlPath + (childStat.isDirectory() ? '/' : ''),
          isDir: childStat.isDirectory(),
          size:  childStat.size,
          mtime: childStat.mtime,
        })
      }
    }

    const xml = propfindXml(entries)
    res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' })
    res.end(xml)
  }

  private async handleGet(_req: http.IncomingMessage, res: http.ServerResponse, fsPath: string) {
    let stat: fs.Stats
    try {
      stat = await fsp.stat(fsPath)
    } catch {
      res.writeHead(404); res.end(); return
    }
    if (stat.isDirectory()) { res.writeHead(403); res.end(); return }

    const data = await fsp.readFile(fsPath)
    res.writeHead(200, { 'Content-Length': String(data.length) })
    res.end(data)
  }

  private async handlePut(req: http.IncomingMessage, res: http.ServerResponse, fsPath: string) {
    await fsp.mkdir(path.dirname(fsPath), { recursive: true })
    const body = await readBody(req)
    await fsp.writeFile(fsPath, body)
    res.writeHead(201); res.end()
  }

  private async handleDelete(_req: http.IncomingMessage, res: http.ServerResponse, fsPath: string) {
    try {
      const stat = await fsp.stat(fsPath)
      if (stat.isDirectory()) {
        await fsp.rm(fsPath, { recursive: true, force: true })
      } else {
        await fsp.unlink(fsPath)
      }
      res.writeHead(204); res.end()
    } catch {
      res.writeHead(404); res.end()
    }
  }

  private async handleMkcol(_req: http.IncomingMessage, res: http.ServerResponse, fsPath: string) {
    try {
      await fsp.mkdir(fsPath, { recursive: true })
      res.writeHead(201); res.end()
    } catch (err: any) {
      // 目录已存在
      if (err.code === 'EEXIST') { res.writeHead(405); res.end() }
      else { res.writeHead(409); res.end() }
    }
  }
}

// ---- 工具函数 ----

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
