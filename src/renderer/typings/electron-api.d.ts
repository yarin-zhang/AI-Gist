// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      preferences: {
        get: () => Promise<any>;
        set: (data: any) => Promise<any>;
        reset: () => Promise<any>;
      };
      theme: {
        setSource: (source: string) => Promise<void>;
        getInfo: () => Promise<{
          isDarkTheme: boolean;
          currentTheme: string;
          themeSource: string;
        }>;
        onThemeChanged: (callback: (data: {
          themeInfo: {
            isDarkTheme: boolean;
            currentTheme: string;
            themeSource: string;
          };
          theme: string;
        }) => void) => (() => void);
      };
      shell: {
        openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export {}; 