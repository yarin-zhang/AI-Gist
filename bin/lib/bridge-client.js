'use strict';

/**
 * 与正在运行的 AI Gist 应用通信。
 *
 * AI Gist 的数据只存在于桌面应用的渲染进程里，这个 CLI 是一个独立的 Node 进程，
 * 唯一的读写方式是通过应用内置的本地回环 HTTP 桥接服务器（默认关闭，需要用户在
 * 设置里手动开启）。应用启动时会把连接信息写到 ~/.ai-gist/cli-bridge.json。
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// 与主进程 cli-bridge-manager.ts 的 getRuntimeDir() 保持一致，
// 同样支持 AI_GIST_CLI_BRIDGE_DIR 覆盖（主要用于测试隔离）。
const RUNTIME_DIR = process.env.AI_GIST_CLI_BRIDGE_DIR || path.join(os.homedir(), '.ai-gist');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'cli-bridge.json');
const AUTO_LAUNCH_TIMEOUT_MS = 15000;
const AUTO_LAUNCH_POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 15000;

class CliBridgeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CliBridgeError';
    this.code = code;
  }
}

function readRuntimeInfo() {
  try {
    const raw = fs.readFileSync(RUNTIME_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data.port !== 'number' || typeof data.token !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpInvoke(runtimeInfo, action, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, params });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: runtimeInfo.port,
        path: '/invoke',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${runtimeInfo.token}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let payload;
          try {
            payload = text ? JSON.parse(text) : {};
          } catch {
            reject(new CliBridgeError('AI Gist returned an invalid response', 'BAD_RESPONSE'));
            return;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(payload);
          } else {
            const message = (payload && payload.error && payload.error.message) || `Request failed with status ${res.statusCode}`;
            const code = (payload && payload.error && payload.error.code) || 'REQUEST_FAILED';
            reject(new CliBridgeError(message, code));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new CliBridgeError('Request to AI Gist timed out', 'TIMEOUT'));
    });

    req.on('error', err => {
      if (err.code === 'ECONNREFUSED') {
        reject(new CliBridgeError('Connection refused by AI Gist', 'CONNECTION_REFUSED'));
      } else {
        reject(new CliBridgeError(err.message, 'NETWORK_ERROR'));
      }
    });

    req.end(body);
  });
}

function tryAutoLaunchOnMac() {
  try {
    spawn('open', ['-a', 'AI Gist'], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // 尽力而为：静默失败，后面的轮询超时会给出统一的错误提示
  }
}

async function waitForRuntimeInfo(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = readRuntimeInfo();
    if (info) return info;
    await sleep(AUTO_LAUNCH_POLL_INTERVAL_MS);
  }
  return null;
}

function buildNotRunningMessage(attemptedAutoLaunch) {
  const lines = [];
  if (attemptedAutoLaunch) {
    lines.push('AI Gist 已尝试自动启动，但仍未检测到本地 CLI 桥接。');
    lines.push('(Attempted to launch AI Gist automatically, but the local CLI bridge is still unreachable.)');
  } else {
    lines.push('未检测到正在运行的 AI Gist。');
    lines.push('(AI Gist does not appear to be running.)');
  }
  lines.push('');
  lines.push('请检查：/ Please check:');
  lines.push('  1. AI Gist 是否已经打开 / AI Gist is open (it may be minimized to the tray)');
  lines.push('  2. 设置 → 本地 CLI 中的"启用本地 CLI 访问"开关是否已打开');
  lines.push('     Settings → Local CLI → "Enable local CLI access" is turned on');
  return lines.join('\n');
}

/**
 * 调用一个白名单动作。会自动处理"应用未运行"的发现与（仅 macOS）自动拉起逻辑。
 * @param {string} action 例如 "prompt.create"
 * @param {any} [params]
 * @param {{ autoLaunch?: boolean }} [options]
 */
async function invoke(action, params, options = {}) {
  const autoLaunchEnabled = options.autoLaunch !== false && process.platform === 'darwin';
  let runtimeInfo = readRuntimeInfo();
  let attemptedAutoLaunch = false;

  if (!runtimeInfo && autoLaunchEnabled) {
    attemptedAutoLaunch = true;
    process.stderr.write('AI Gist 未运行，正在尝试启动… (Launching AI Gist…)\n');
    tryAutoLaunchOnMac();
    runtimeInfo = await waitForRuntimeInfo(AUTO_LAUNCH_TIMEOUT_MS);
  }

  if (!runtimeInfo) {
    throw new CliBridgeError(buildNotRunningMessage(attemptedAutoLaunch), 'APP_NOT_RUNNING');
  }

  try {
    return await httpInvoke(runtimeInfo, action, params);
  } catch (error) {
    if (error instanceof CliBridgeError && error.code === 'CONNECTION_REFUSED') {
      throw new CliBridgeError(
        'AI Gist 似乎已经退出（发现了过期的连接信息）。请重新打开 AI Gist 后重试。\n' +
          '(AI Gist appears to have quit — stale connection info was found. Please reopen AI Gist and try again.)',
        'APP_NOT_RUNNING'
      );
    }
    throw error;
  }
}

module.exports = { invoke, CliBridgeError, RUNTIME_FILE };
