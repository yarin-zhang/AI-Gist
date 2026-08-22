// 标准库导入
import { randomUUID } from 'crypto';

// 第三方库导入
import { ipcMain } from 'electron';

// 本地模块导入
import { windowManager } from './window-manager';
import { cliBridgeManager } from './cli-bridge-manager';

/**
 * "真正退出前的最后一次机会"协调器
 *
 * 背景（Gitea issue #149）：本地 CLI 桥接的存活状态必须和用户的关闭行为偏好
 * （preferences.closeAction）绑定成一个清晰的契约：
 *   - closeAction === 'minimize'（关闭后台常驻）：应用隐藏到托盘但不退出，
 *     CLI 桥接必须继续运行——这条路径完全不会走到这个协调器，见
 *     window-manager.ts 的 hideToTray()，它不会触碰 cliBridgeManager。
 *   - closeAction === 'quit'（关闭后彻底退出）：应用退出的同时，CLI 桥接
 *     必须停止并清理 ~/.ai-gist/cli-bridge.json，确保下一次打开是"干净状态"，
 *     不会留下过期的端口/token 信息误导下一次 CLI 调用。
 *
 * 应用真正退出可能从好几条不同路径触发：窗口关闭时选择了"彻底退出"
 * （window-manager.ts 的 quitApplication()）、系统托盘菜单的"退出"、
 * powerMonitor 的系统关机事件，或者非 macOS 上没有托盘图标时的
 * window-all-closed。这些路径最终都会调用 Electron 的 app.quit()，而
 * app.quit() 无论从哪里触发都会派发一次 'before-quit' 事件（只有绕过它的
 * app.exit() 才不会，本项目未使用该 API）。main.ts 把所有这些路径统一收敛到
 * 这一个协调器的 begin()，而不是让某一条路径单独负责"记得去停 CLI 桥接"——
 * 这样无论增加多少种触发退出的入口，只要它们最终调用 app.quit()，
 * CLI 桥接就一定会被停止。
 *
 * 这个模块被拆出来（而不是把逻辑留在 main.ts 里）单纯是为了可测试性：
 * main.ts 顶层有大量一次性副作用（初始化单实例锁、注册 app.whenReady 等），
 * 直接 import 它会把这些副作用也带进测试。这个文件只定义一个类并导出单例，
 * import 它没有任何副作用，可以直接在测试里验证"退出协调器一定会调用
 * cliBridgeManager.stop()"这条契约。
 */
class QuitFlushCoordinator {
  private flushCompleted = false;
  private flushInProgress = false;

  /**
   * 是否已经完成过一次"退出前刷新"。
   * main.ts 的 before-quit 处理器用它判断：如果已经完成过，说明这次
   * app.quit() 是协调器自己在 begin() 结束后触发的真正退出，直接放行即可，
   * 不需要再 preventDefault() 重新走一遍流程。
   */
  isFlushCompleted(): boolean {
    return this.flushCompleted;
  }

  /**
   * 请求渲染进程尽力把还没同步完的数据刷一次，带超时保护，不会无限期卡住退出。
   * 独立导出（而不是 begin() 的私有实现细节），因为 Windows 的 session-end
   * 事件不可阻塞退出，只能单独调用这个方法做最后一次尽力刷新，不涉及 CLI 桥接。
   */
  async requestRendererSyncFlush(timeoutMs = 5000): Promise<void> {
    const mainWindow = windowManager.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;

    const id = randomUUID();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        ipcMain.removeListener('cloud-sync:flush-response', onResponse);
        resolve();
      }, timeoutMs + 250);
      const onResponse = (_event: Electron.IpcMainEvent, response: { id?: string }) => {
        if (response?.id !== id) return;
        clearTimeout(timer);
        ipcMain.removeListener('cloud-sync:flush-response', onResponse);
        resolve();
      };
      ipcMain.on('cloud-sync:flush-response', onResponse);
      mainWindow.webContents.send('cloud-sync:flush-request', { id, reason: 'shutdown', timeoutMs });
    });
  }

  /**
   * 开始一次"优雅退出"流程：并行执行渲染进程数据刷新 + 停止本地 CLI 桥接
   * （包含清理 ~/.ai-gist/cli-bridge.json），全部完成后调用 onDone()——
   * 调用方通常在 onDone 里真正执行 app.quit()。
   *
   * 幂等：如果已经完成过、或正在进行中，直接返回，不会重复执行（例如
   * before-quit 被多次派发，或系统关机与用户手动退出几乎同时触发）。
   */
  begin(timeoutMs: number, source: string, onDone: () => void): void {
    if (this.flushCompleted || this.flushInProgress) return;
    this.flushInProgress = true;
    console.log(`${source}，刷新待同步数据并停止本地 CLI 桥接...`);
    void Promise.all([this.requestRendererSyncFlush(timeoutMs), cliBridgeManager.stop()]).finally(() => {
      this.flushCompleted = true;
      this.flushInProgress = false;
      onDone();
    });
  }

  /** 仅供测试重置内部状态 */
  reset(): void {
    this.flushCompleted = false;
    this.flushInProgress = false;
  }
}

export const quitFlushCoordinator = new QuitFlushCoordinator();
