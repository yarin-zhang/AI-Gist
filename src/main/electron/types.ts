/**
 * Electron 应用相关的类型定义
 */

export interface UserPreferences {
  dontShowCloseDialog: boolean; // 是否不再显示关闭确认对话框
  closeAction: 'quit' | 'minimize'; // 关闭动作：'quit' 退出应用, 'minimize' 最小化到托盘
}
