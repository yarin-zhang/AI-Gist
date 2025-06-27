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
      };
      shell: {
        openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export {}; 