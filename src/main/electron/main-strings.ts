import type { SupportedLocale } from '@shared/types/preferences';

/**
 * 主进程原生界面（托盘、关闭确认框、文件选择框、系统通知）的文案。
 *
 * 这些界面不经过渲染进程的 vue-i18n，所以单独维护一份五种语言的表，
 * 用词与 src/renderer/i18n/locales 里的对应文案保持一致（例如 closeBehavior.*）。
 */
export interface MainStrings {
  tray: {
    tooltip: string;
    showWindow: string;
    quit: string;
  };
  closeDialog: {
    title: string;
    message: string;
    detail: string;
    quit: string;
    minimize: string;
    cancel: string;
    remember: string;
  };
  fileDialog: {
    importTitle: string;
    exportTitle: string;
    /** {format} 会被替换为 CSV / JSON 等格式名 */
    formatFiles: string;
    allFiles: string;
  };
  notifications: {
    copiedTitle: string;
    pasteNeedsPermission: string;
    pasteFailed: string;
  };
}

export const MAIN_STRINGS: Record<SupportedLocale, MainStrings> = {
  'zh-CN': {
    tray: {
      tooltip: 'AI Gist',
      showWindow: '打开 AI Gist',
      quit: '退出',
    },
    closeDialog: {
      title: 'AI Gist',
      message: '退出 AI Gist，还是最小化到托盘？',
      detail: '最小化到托盘后，AI Gist 会在后台继续运行，启动器和同步保持可用。',
      quit: '退出应用',
      minimize: '最小化到托盘',
      cancel: '取消',
      remember: '记住我的选择',
    },
    fileDialog: {
      importTitle: '选择要导入的文件',
      exportTitle: '选择导出位置',
      formatFiles: '{format} 文件',
      allFiles: '所有文件',
    },
    notifications: {
      copiedTitle: '已复制提示词',
      pasteNeedsPermission: '没有辅助功能权限，没能自动粘贴。请手动粘贴；在「设置 → 快捷键」里授权后可以自动粘贴。',
      pasteFailed: '没能自动粘贴，请手动粘贴。',
    },
  },
  'zh-TW': {
    tray: {
      tooltip: 'AI Gist',
      showWindow: '開啟 AI Gist',
      quit: '結束',
    },
    closeDialog: {
      title: 'AI Gist',
      message: '結束 AI Gist，還是最小化到系統匣？',
      detail: '最小化到系統匣後，AI Gist 會在背景繼續執行，啟動器和同步保持可用。',
      quit: '結束應用程式',
      minimize: '最小化到系統匣',
      cancel: '取消',
      remember: '記住我的選擇',
    },
    fileDialog: {
      importTitle: '選擇要匯入的檔案',
      exportTitle: '選擇匯出位置',
      formatFiles: '{format} 檔案',
      allFiles: '所有檔案',
    },
    notifications: {
      copiedTitle: '已複製提示詞',
      pasteNeedsPermission: '沒有輔助使用權限，無法自動貼上。請手動貼上；在「設定 → 快速鍵」裡授權後可以自動貼上。',
      pasteFailed: '無法自動貼上，請手動貼上。',
    },
  },
  'en-US': {
    tray: {
      tooltip: 'AI Gist',
      showWindow: 'Open AI Gist',
      quit: 'Quit',
    },
    closeDialog: {
      title: 'AI Gist',
      message: 'Quit AI Gist or minimize it to the tray?',
      detail: 'In the tray, AI Gist keeps running in the background with the launcher and sync available.',
      quit: 'Quit app',
      minimize: 'Minimize to tray',
      cancel: 'Cancel',
      remember: 'Remember my choice',
    },
    fileDialog: {
      importTitle: 'Choose a file to import',
      exportTitle: 'Choose where to export',
      formatFiles: '{format} files',
      allFiles: 'All files',
    },
    notifications: {
      copiedTitle: 'Prompt copied',
      pasteNeedsPermission: "Couldn't paste automatically without Accessibility access. Paste it yourself, or allow access in Settings → Shortcuts.",
      pasteFailed: "Couldn't paste automatically. Paste it yourself.",
    },
  },
  'ja-JP': {
    tray: {
      tooltip: 'AI Gist',
      showWindow: 'AI Gist を開く',
      quit: '終了',
    },
    closeDialog: {
      title: 'AI Gist',
      message: 'AI Gist を終了しますか？それともトレイに最小化しますか？',
      detail: 'トレイに最小化すると、AI Gist はバックグラウンドで動作を続け、ランチャーと同期も引き続き使えます。',
      quit: 'アプリケーションを終了',
      minimize: 'トレイに最小化',
      cancel: 'キャンセル',
      remember: 'この選択を記憶',
    },
    fileDialog: {
      importTitle: 'インポートするファイルを選択',
      exportTitle: 'エクスポート先を選択',
      formatFiles: '{format} ファイル',
      allFiles: 'すべてのファイル',
    },
    notifications: {
      copiedTitle: 'プロンプトをコピーしました',
      pasteNeedsPermission: 'アクセシビリティの権限がないため、自動で貼り付けできませんでした。手動で貼り付けてください。「設定 → ショートカット」で許可すると自動で貼り付けられます。',
      pasteFailed: '自動で貼り付けできませんでした。手動で貼り付けてください。',
    },
  },
  'it-IT': {
    tray: {
      tooltip: 'AI Gist',
      showWindow: 'Apri AI Gist',
      quit: 'Esci',
    },
    closeDialog: {
      title: 'AI Gist',
      message: "Vuoi uscire da AI Gist o ridurlo nell'area di notifica?",
      detail: "Nell'area di notifica AI Gist continua in background: launcher e sincronizzazione restano disponibili.",
      quit: "Esci dall'applicazione",
      minimize: "Riduci nell'area di notifica",
      cancel: 'Annulla',
      remember: 'Ricorda la mia scelta',
    },
    fileDialog: {
      importTitle: 'Scegli il file da importare',
      exportTitle: 'Scegli dove esportare',
      formatFiles: 'File {format}',
      allFiles: 'Tutti i file',
    },
    notifications: {
      copiedTitle: 'Prompt copiato',
      pasteNeedsPermission: "Impossibile incollare automaticamente senza l'accesso Accessibilità. Incolla tu il testo, oppure consenti l'accesso in Impostazioni → Scorciatoie.",
      pasteFailed: 'Impossibile incollare automaticamente. Incolla tu il testo.',
    },
  },
};

export function formatMainString(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
