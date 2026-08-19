// 标准库导入
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

// 第三方库导入
import { app, BrowserWindow, ipcMain } from 'electron';

// 本地模块导入
import type { CliBridgeRequest, CliBridgeResponse, CliBridgeStatus } from '@shared/types';
import { preferencesManager } from './preferences-manager';

/**
 * 常量定义
 */
const CONSTANTS = {
  RUNTIME_FILE_NAME: 'cli-bridge.json',
  PREFERRED_PORT: 47823,
  REQUEST_TIMEOUT_MS: 10_000,
  MAX_BODY_BYTES: 1024 * 1024,
} as const;

/**
 * 运行时连接信息文件所在目录。固定为 ~/.ai-gist，与 Electron 的 userData 路径解耦，
 * 便于 CLI（一个独立的 Node 进程）用同样的规则找到它。支持通过环境变量覆盖，
 * 主要用于测试隔离，避免测试写到开发者真实的主目录。
 */
function getRuntimeDir(): string {
  return process.env.AI_GIST_CLI_BRIDGE_DIR || path.join(os.homedir(), '.ai-gist');
}

function getRuntimeFilePath(): string {
  return path.join(getRuntimeDir(), CONSTANTS.RUNTIME_FILE_NAME);
}

interface PendingInvocation {
  resolve: (response: CliBridgeResponse) => void;
  timer: NodeJS.Timeout;
}

/**
 * 本地 CLI 桥接管理器
 *
 * AI-Gist 的业务数据只存在于渲染进程的 IndexedDB 中，主进程本身无法读写。
 * 这个管理器在主进程里起一个只监听 127.0.0.1 的 HTTP 服务器，供本地 CLI（bin/ai-gist.js）
 * 调用；每个请求都会通过 IPC 转发给渲染进程执行（渲染进程侧由
 * cli-bridge-executor.service.ts 用白名单动作表处理，不允许任意代码执行），
 * 再把结果透传回 HTTP 响应。
 *
 * 安全性：仅回环地址、每次启动生成一次性随机 token、默认关闭需用户在设置里手动开启、
 * 运行时连接信息文件收紧为仅当前用户可读。
 */
class CliBridgeManager {
  private static instance: CliBridgeManager;

  private server: http.Server | null = null;
  private mainWindow: BrowserWindow | null = null;
  private token: string | null = null;
  private port: number | null = null;
  private readonly pending = new Map<string, PendingInvocation>();
  private responseListenerAttached = false;

  static getInstance(): CliBridgeManager {
    if (!CliBridgeManager.instance) {
      CliBridgeManager.instance = new CliBridgeManager();
    }
    return CliBridgeManager.instance;
  }

  /**
   * 设置主窗口引用，用于把请求转发给渲染进程
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 是否正在监听
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * 获取当前状态，供设置页展示
   */
  getStatus(): CliBridgeStatus {
    const enabled = preferencesManager.getPreferences().cliBridge?.enabled ?? false;
    return {
      enabled,
      running: this.isRunning(),
      port: this.port ?? undefined,
    };
  }

  /**
   * 根据当前 preferences 的开关状态启动服务器（如果已启用且尚未运行）
   */
  async start(): Promise<void> {
    if (this.server) return;

    const enabled = preferencesManager.getPreferences().cliBridge?.enabled ?? false;
    if (!enabled) return;

    this.ensureResponseListener();
    this.token = crypto.randomBytes(32).toString('hex');

    const server = http.createServer((req, res) => this.handleRequest(req, res));
    await this.listen(server, CONSTANTS.PREFERRED_PORT);

    const address = server.address();
    if (!address || typeof address === 'string') {
      // 启动失败（listen 内部已经打印了错误）
      this.token = null;
      return;
    }

    this.server = server;
    this.port = address.port;
    this.writeRuntimeFile();
    console.log(`[cli-bridge] 本地 CLI 桥接已启动：127.0.0.1:${this.port}`);
  }

  /**
   * 停止服务器并清理运行时文件
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    this.port = null;
    this.token = null;
    this.rejectAllPending('CLI bridge server stopped');
    this.removeRuntimeFile();
    console.log('[cli-bridge] 本地 CLI 桥接已停止');
  }

  /**
   * 供设置页调用：切换开关，同时立即生效
   */
  async setEnabled(enabled: boolean): Promise<CliBridgeStatus> {
    preferencesManager.updatePreferences({ cliBridge: { enabled } });
    if (enabled) {
      await this.start();
    } else {
      await this.stop();
    }
    return this.getStatus();
  }

  // ==================== 内部实现 ====================

  private ensureResponseListener(): void {
    if (this.responseListenerAttached) return;
    this.responseListenerAttached = true;
    ipcMain.on('cli-bridge:invoke-response', (_event, response: CliBridgeResponse) => {
      const pending = this.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      pending.resolve(response);
    });
  }

  private listen(server: http.Server, preferredPort: number): Promise<void> {
    return new Promise((resolve) => {
      const onPreferredError = (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
          console.error('[cli-bridge] 启动失败:', err);
          resolve();
          return;
        }
        // 首选端口不可用，改由系统分配一个空闲端口
        server.once('error', (fallbackErr) => {
          console.error('[cli-bridge] 启动失败:', fallbackErr);
          resolve();
        });
        server.listen(0, '127.0.0.1', () => resolve());
      };

      server.once('error', onPreferredError);
      server.listen(preferredPort, '127.0.0.1', () => {
        server.removeListener('error', onPreferredError);
        resolve();
      });
    });
  }

  private rejectAllPending(message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ id, ok: false, error: { message, code: 'SERVER_STOPPED' } });
    }
    this.pending.clear();
  }

  private writeRuntimeFile(): void {
    try {
      const runtimeDir = getRuntimeDir();
      fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
      fs.chmodSync(runtimeDir, 0o700);

      const payload = {
        port: this.port,
        token: this.token,
        pid: process.pid,
        appVersion: app.getVersion(),
        startedAt: new Date().toISOString(),
      };
      const filePath = getRuntimeFilePath();
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
    } catch (error) {
      console.error('[cli-bridge] 写入运行时文件失败:', error);
    }
  }

  private removeRuntimeFile(): void {
    try {
      const filePath = getRuntimeFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('[cli-bridge] 删除运行时文件失败:', error);
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/invoke') {
      this.sendJson(res, 404, { error: { message: 'Not found' } });
      return;
    }

    const authHeaderRaw = req.headers['authorization'];
    const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : authHeaderRaw || '';
    if (!this.token || !this.isValidToken(authHeader)) {
      this.sendJson(res, 401, { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > CONSTANTS.MAX_BODY_BYTES) {
        aborted = true;
        this.sendJson(res, 413, { error: { message: 'Request body too large' } });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;

      let body: { action?: string; params?: any };
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      } catch {
        this.sendJson(res, 400, { error: { message: 'Invalid JSON body' } });
        return;
      }

      if (!body.action || typeof body.action !== 'string') {
        this.sendJson(res, 400, { error: { message: 'Missing "action"' } });
        return;
      }

      void this.dispatch(body.action, body.params).then((response) => {
        if (response.ok) {
          this.sendJson(res, 200, response.result);
        } else {
          const statusCode =
            response.error.code === 'TIMEOUT' ? 504 :
            response.error.code === 'NO_WINDOW' ? 503 :
            400;
          this.sendJson(res, statusCode, { error: response.error });
        }
      });
    });
  }

  private isValidToken(authHeader: string): boolean {
    const expected = `Bearer ${this.token}`;
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  private dispatch(action: string, params: any): Promise<CliBridgeResponse> {
    const mainWindow = this.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return Promise.resolve({
        id: '',
        ok: false,
        error: { message: 'AI Gist window is not available', code: 'NO_WINDOW' },
      });
    }

    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          id,
          ok: false,
          error: { message: 'Renderer did not respond in time', code: 'TIMEOUT' },
        });
      }, CONSTANTS.REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, timer });

      const request: CliBridgeRequest = { id, action, params };
      mainWindow.webContents.send('cli-bridge:invoke-request', request);
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: any): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}

// 单例模式导出
export const cliBridgeManager = CliBridgeManager.getInstance();
