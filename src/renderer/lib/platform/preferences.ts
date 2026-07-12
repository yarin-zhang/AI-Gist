import { PlatformDetector } from '@shared/platform';
import type { UserPreferences } from '@shared/types/preferences';

const WEB_PREFERENCES_KEY = 'ai-gist:web:user-preferences';

export const defaultPreferences: UserPreferences = {
  theme: 'system',
  language: 'zh-CN',
  autoStartup: false,
  minimizeToTray: false,
  showNotifications: true,
  checkUpdates: true,
  windowSize: {
    width: 1200,
    height: 800
  },
  windowPosition: {
    x: 0,
    y: 0
  },
  closeBehaviorMode: 'ask',
  closeAction: 'quit',
  startMinimized: false,
  autoLaunch: false,
  themeSource: 'system',
  dataSync: {
    lastSyncTime: null,
    autoBackup: true,
    backupInterval: 24
  },
  shortcuts: {
    version: 2,
    defaultAction: 'copy',
    commands: {
      launcher: {
        accelerator: 'CommandOrControl+Shift+G',
        enabled: true
      },
      showMainWindow: {
        accelerator: '',
        enabled: false
      }
    },
    promptBindings: [],
    recentPromptUUIDs: []
  },
  networkProxy: {
    mode: 'system',
    manualConfig: {
      httpProxy: '',
      httpsProxy: '',
      noProxy: ''
    }
  }
};

function clonePreferences(preferences: UserPreferences): UserPreferences {
  return JSON.parse(JSON.stringify(preferences));
}

function mergePreferences(input?: Partial<UserPreferences> | null): UserPreferences {
  const base = clonePreferences(defaultPreferences);
  if (!input) {
    return base;
  }

  return {
    ...base,
    ...input,
    windowSize: {
      ...base.windowSize,
      ...(input.windowSize || {})
    },
    windowPosition: {
      ...base.windowPosition,
      ...(input.windowPosition || {})
    },
    dataSync: {
      ...base.dataSync!,
      ...(input.dataSync || {})
    },
    shortcuts: {
      ...base.shortcuts!,
      ...(input.shortcuts || {}),
      commands: {
        launcher: {
          ...base.shortcuts!.commands.launcher,
          ...(input.shortcuts?.commands?.launcher || {})
        },
        showMainWindow: {
          ...base.shortcuts!.commands.showMainWindow,
          ...(input.shortcuts?.commands?.showMainWindow || {})
        }
      },
      promptBindings: input.shortcuts?.promptBindings || base.shortcuts!.promptBindings,
      recentPromptUUIDs: input.shortcuts?.recentPromptUUIDs || base.shortcuts!.recentPromptUUIDs
    },
    networkProxy: {
      ...base.networkProxy!,
      ...(input.networkProxy || {}),
      manualConfig: {
        ...base.networkProxy!.manualConfig,
        ...(input.networkProxy?.manualConfig || {})
      }
    }
  };
}

function getWebStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function getWebPreferences(): Promise<UserPreferences> {
  const storage = getWebStorage();
  if (!storage) {
    return clonePreferences(defaultPreferences);
  }

  const raw = storage.getItem(WEB_PREFERENCES_KEY);
  if (!raw) {
    const initial = clonePreferences(defaultPreferences);
    storage.setItem(WEB_PREFERENCES_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return mergePreferences(JSON.parse(raw));
  } catch {
    const recovered = clonePreferences(defaultPreferences);
    storage.setItem(WEB_PREFERENCES_KEY, JSON.stringify(recovered));
    return recovered;
  }
}

async function setWebPreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const storage = getWebStorage();
  const current = await getWebPreferences();
  const next = mergePreferences({
    ...current,
    ...patch
  });

  storage?.setItem(WEB_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

async function resetWebPreferences(): Promise<UserPreferences> {
  const next = clonePreferences(defaultPreferences);
  getWebStorage()?.setItem(WEB_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

export const preferencesClient = {
  async get(): Promise<UserPreferences> {
    if (PlatformDetector.isElectron() && window.electronAPI?.preferences) {
      return mergePreferences(await window.electronAPI.preferences.get());
    }

    return getWebPreferences();
  },

  async set(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    if (PlatformDetector.isElectron() && window.electronAPI?.preferences) {
      return mergePreferences(await window.electronAPI.preferences.set(prefs));
    }

    return setWebPreferences(prefs);
  },

  async reset(): Promise<UserPreferences> {
    if (PlatformDetector.isElectron() && window.electronAPI?.preferences) {
      return mergePreferences(await window.electronAPI.preferences.reset());
    }

    return resetWebPreferences();
  }
};
