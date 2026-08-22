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

// 传给 `open --args` 的命令行标记，用来告诉主进程"这是 CLI 自动拉起的探测启动，
// 不是用户手动再点了一次应用图标"。必须和
// src/main/electron/single-instance-manager.ts 里的 CLI_AUTO_LAUNCH_MARKER
// 保持完全一致（两边运行时环境不同，无法共享同一个 import，只能约定字面量一致）。
const AUTO_LAUNCH_MARKER = '--ai-gist-cli-autolaunch';

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
    // --args 之后的内容会作为命令行参数传给被启动/唤醒的 AI Gist 进程。如果 AI Gist
    // 其实已经在跑（例如常驻在托盘），`open -a` 不会创建一个真正独立运行的新实例，
    // 而是会短暂拉起一个新的 Electron 进程，该进程在 requestSingleInstanceLock() 时
    // 输给已经在运行的实例，随即把自己的命令行参数通过 'second-instance' 事件转交
    // 给主实例后退出。带上这个标记，主进程就能识别出这只是 CLI 的探测性拉起，
    // 从而不弹出"AI-Gist 已在运行"的对话框（那个对话框和这次 CLI 调用本身毫无关系，
    // 只会让用户困惑）。见 single-instance-manager.ts 的 CLI_AUTO_LAUNCH_MARKER。
    spawn('open', ['-a', 'AI Gist', '--args', AUTO_LAUNCH_MARKER], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // 尽力而为：静默失败，后面的轮询超时会给出统一的错误提示
  }
}

/**
 * 删除过期的运行时连接信息文件（如果存在）。
 *
 * 用于"文件存在但连接被拒绝"的场景：上一次 AI Gist 没有正常退出（崩溃/被强杀/断电），
 * 留下的 port/token 已经没有任何进程在监听。如果不删除它，后续的 waitForRuntimeInfo()
 * 轮询会立刻读到这份旧文件、误以为一个新实例已经就位，从而完全跳过等待，
 * 拿着同一份失效信息再失败一次。删除后轮询才会真正等到新实例启动、覆盖写入新文件。
 */
function removeStaleRuntimeInfo() {
  try {
    fs.unlinkSync(RUNTIME_FILE);
  } catch {
    // 忽略：文件可能已经被新启动的实例覆盖，或本来就不存在
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

  const autoLaunchAndWait = async () => {
    attemptedAutoLaunch = true;
    process.stderr.write('AI Gist 未运行，正在尝试启动… (Launching AI Gist…)\n');
    tryAutoLaunchOnMac();
    return waitForRuntimeInfo(AUTO_LAUNCH_TIMEOUT_MS);
  };

  if (!runtimeInfo && autoLaunchEnabled) {
    runtimeInfo = await autoLaunchAndWait();
  }

  if (!runtimeInfo) {
    throw new CliBridgeError(buildNotRunningMessage(attemptedAutoLaunch), 'APP_NOT_RUNNING');
  }

  try {
    return await httpInvoke(runtimeInfo, action, params);
  } catch (error) {
    const isStaleConnection = error instanceof CliBridgeError && error.code === 'CONNECTION_REFUSED';
    if (!isStaleConnection) {
      throw error;
    }

    // 运行时文件存在，但实际连接被拒绝：说明上一次 AI Gist 没有正常退出（崩溃、
    // 被强制杀死、断电等），留下的是一份过期的端口/token 信息，此时真实情况其实
    // 和"应用没在运行"完全一样。之前的实现会在这里直接报错、要求用户手动重开，
    // 这正是 issue #149 里"之前的 CLI 没关掉，再次打开时就会报错"的根因之一：
    // 明明可以像"应用从未启动过"一样自动拉起，却因为找到了一份（失效的）运行时
    // 文件而放弃了自动拉起。这里改成：清掉过期文件，按同样的自动拉起流程重试一次。
    if (!autoLaunchEnabled || attemptedAutoLaunch) {
      throw new CliBridgeError(
        'AI Gist 似乎已经退出（发现了过期的连接信息）。请重新打开 AI Gist 后重试。\n' +
          '(AI Gist appears to have quit — stale connection info was found. Please reopen AI Gist and try again.)',
        'APP_NOT_RUNNING'
      );
    }

    removeStaleRuntimeInfo();
    const freshInfo = await autoLaunchAndWait();
    if (!freshInfo) {
      throw new CliBridgeError(buildNotRunningMessage(true), 'APP_NOT_RUNNING');
    }
    return await httpInvoke(freshInfo, action, params);
  }
}

module.exports = { invoke, CliBridgeError, RUNTIME_FILE, AUTO_LAUNCH_MARKER };
