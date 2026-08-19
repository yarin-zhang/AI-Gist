/**
 * 本地 CLI 桥接协议类型定义
 * 主进程（cli-bridge-manager）与渲染进程（cli-bridge-executor）之间
 * 通过这些结构化消息通信，主进程只透传请求/响应，不解释 action 语义。
 */

/**
 * 主进程转发给渲染进程执行的请求
 */
export interface CliBridgeRequest {
  id: string;
  action: string;
  params?: any;
}

/**
 * 渲染进程执行完成后回传给主进程的响应
 */
export type CliBridgeResponse =
  | { id: string; ok: true; result: any }
  | { id: string; ok: false; error: { message: string; code?: string } };

/**
 * 本地 CLI 桥接服务器的运行状态，供设置页展示
 */
export interface CliBridgeStatus {
  enabled: boolean;
  running: boolean;
  port?: number;
}
