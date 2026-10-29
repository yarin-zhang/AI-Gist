import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { join } from 'path';
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  Notification,
  nativeTheme,
  screen,
  systemPreferences,
} from 'electron';
import type {
  PasteCapability,
  PasteUnavailableReason,
  PromptShortcutBinding,
  ShortcutAction,
  ShortcutCommandId,
  ShortcutExecutionRequest,
  ShortcutInvocation,
  ShortcutPreferences,
  ShortcutRegistrationStatus,
  ShortcutState,
} from '@shared/types';
import { createShortcutError, type ShortcutErrorCode } from '@shared/shortcut-errors';
import { preferencesManager } from './preferences-manager';
import { getMainStrings } from './main-locale';

type PasteTarget = { platform: NodeJS.Platform; value: string } | null;
/** 自动粘贴没成功的原因，只用于选择通知文案和写日志 */
type PasteFailure = PasteUnavailableReason | 'no-target' | 'failed';

export class ShortcutManager {
  private static instance: ShortcutManager;
  private registeredById = new Map<string, string>();
  private registrationStatuses = new Map<string, ShortcutRegistrationStatus>();
  private mainWindow: BrowserWindow | null = null;
  private launcherWindow: BrowserWindow | null = null;
  private launcherReady = false;
  private launcherLoadPromise: Promise<BrowserWindow> | null = null;
  private pendingInvocations: ShortcutInvocation[] = [];
  private isInitialized = false;
  private isTemporarilyDisabled = false;
  private pasteTarget: PasteTarget = null;

  static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) ShortcutManager.instance = new ShortcutManager();
    return ShortcutManager.instance;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.registerUserShortcuts();
    this.isInitialized = true;
  }

  private getShortcutPreferences(): ShortcutPreferences {
    return preferencesManager.getPreferences().shortcuts!;
  }

  private normalizeAccelerator(accelerator: string): string {
    return accelerator
      .trim()
      .replace(/CmdOrCtrl/gi, 'CommandOrControl')
      .replace(/CommandOrCtrl/gi, 'CommandOrControl')
      .replace(/Meta/gi, 'Command')
      .replace(/Cmd/gi, 'Command')
      .replace(/Ctrl/gi, 'Control')
      .replace(/↑/g, 'Up')
      .replace(/↓/g, 'Down')
      .replace(/←/g, 'Left')
      .replace(/→/g, 'Right');
  }

  private validateFormat(accelerator: string): ShortcutErrorCode | null {
    const normalized = this.normalizeAccelerator(accelerator);
    if (!normalized) return 'empty';
    const parts = normalized.split('+').filter(Boolean);
    const key = parts[parts.length - 1] || '';
    const modifiers = new Set(['Command', 'Control', 'CommandOrControl', 'Alt', 'Option', 'Shift', 'Super']);
    const hasModifier = parts.slice(0, -1).some(part => modifiers.has(part));
    const isFunctionKey = /^F(?:[1-9]|1\d|2[0-4])$/i.test(key);
    if (['Escape', 'Esc', 'Enter', 'Tab'].includes(key) && !hasModifier) return 'reserved-key';
    if (!hasModifier && !isFunctionKey) return 'modifier-required';
    return null;
  }

  private getAllConfiguredBindings(): { id: string; accelerator: string; enabled: boolean }[] {
    const shortcuts = this.getShortcutPreferences();
    return [
      ...Object.entries(shortcuts.commands).map(([id, binding]) => ({
        id: `command:${id}`,
        accelerator: binding.accelerator,
        enabled: binding.enabled,
      })),
      ...shortcuts.promptBindings.map(binding => ({
        id: `prompt:${binding.id}`,
        accelerator: binding.accelerator,
        enabled: binding.enabled,
      })),
    ];
  }

  validateAccelerator(accelerator: string, excludeId?: string): { valid: boolean; errorCode?: ShortcutErrorCode } {
    const formatError = this.validateFormat(accelerator);
    if (formatError) return { valid: false, errorCode: formatError };
    const normalized = this.normalizeAccelerator(accelerator).toLowerCase();
    const duplicate = this.getAllConfiguredBindings().find(binding =>
      binding.enabled && binding.id !== excludeId && this.normalizeAccelerator(binding.accelerator).toLowerCase() === normalized
    );
    if (duplicate) return { valid: false, errorCode: 'duplicate' };
    return { valid: true };
  }

  private registerBinding(id: string, accelerator: string, callback: () => void): void {
    const formatError = this.validateFormat(accelerator);
    if (formatError) {
      this.registrationStatuses.set(id, { id, accelerator, state: 'unsupported', message: formatError });
      return;
    }
    const normalized = this.normalizeAccelerator(accelerator);
    try {
      const success = globalShortcut.register(normalized, callback);
      if (!success) {
        this.registrationStatuses.set(id, {
          id,
          accelerator,
          state: 'conflict',
          message: 'in-use',
        });
        return;
      }
      this.registeredById.set(id, normalized);
      this.registrationStatuses.set(id, { id, accelerator, state: 'registered' });
    } catch (error) {
      this.registrationStatuses.set(id, {
        id,
        accelerator,
        state: 'unsupported',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async registerUserShortcuts(): Promise<void> {
    this.unregisterAllShortcuts();
    this.registrationStatuses.clear();
    if (this.isTemporarilyDisabled) return;
    const shortcuts = this.getShortcutPreferences();

    const launcher = shortcuts.commands.launcher;
    if (launcher.enabled) {
      this.registerBinding('command:launcher', launcher.accelerator, () => void this.openLauncher({ kind: 'launcher' }));
    } else {
      this.registrationStatuses.set('command:launcher', { id: 'command:launcher', accelerator: launcher.accelerator, state: 'disabled' });
    }

    const showMain = shortcuts.commands.showMainWindow;
    if (showMain.enabled && showMain.accelerator) {
      this.registerBinding('command:showMainWindow', showMain.accelerator, () => this.toggleMainWindow());
    } else {
      this.registrationStatuses.set('command:showMainWindow', { id: 'command:showMainWindow', accelerator: showMain.accelerator, state: 'disabled' });
    }

    for (const binding of shortcuts.promptBindings) {
      const id = `prompt:${binding.id}`;
      if (!binding.enabled) {
        this.registrationStatuses.set(id, { id, accelerator: binding.accelerator, state: 'disabled' });
        continue;
      }
      this.registerBinding(id, binding.accelerator, () => void this.openLauncher({
        kind: 'prompt',
        bindingId: binding.id,
        promptUUID: binding.promptUUID,
        action: binding.action,
      }));
    }
  }

  private async canTemporarilyRegister(accelerator: string, excludeId?: string): Promise<{ valid: boolean; errorCode?: ShortcutErrorCode }> {
    const validation = this.validateAccelerator(accelerator, excludeId);
    if (!validation.valid) return validation;
    const normalized = this.normalizeAccelerator(accelerator);
    const oldAccelerator = excludeId ? this.registeredById.get(excludeId) : undefined;
    if (oldAccelerator) {
      globalShortcut.unregister(oldAccelerator);
      this.registeredById.delete(excludeId!);
    }
    let available = false;
    try {
      available = globalShortcut.register(normalized, () => undefined);
      if (available) globalShortcut.unregister(normalized);
    } finally {
      await this.registerUserShortcuts();
    }
    return available ? { valid: true } : { valid: false, errorCode: 'in-use' };
  }

  async updateCommand(commandId: ShortcutCommandId, patch: Partial<{ accelerator: string; enabled: boolean }>): Promise<ShortcutState> {
    const prefs = this.getShortcutPreferences();
    const current = prefs.commands[commandId];
    const next = { ...current, ...patch };
    if (next.enabled) {
      const result = await this.canTemporarilyRegister(next.accelerator, `command:${commandId}`);
      if (!result.valid) throw createShortcutError(result.errorCode ?? 'in-use');
    }
    const shortcuts: ShortcutPreferences = {
      ...prefs,
      commands: { ...prefs.commands, [commandId]: next },
    };
    preferencesManager.updatePreferences({ shortcuts });
    await this.registerUserShortcuts();
    return this.getState();
  }

  async upsertPromptBinding(input: Omit<PromptShortcutBinding, 'id'> & { id?: string }): Promise<ShortcutState> {
    const prefs = this.getShortcutPreferences();
    const id = input.id || randomUUID();
    if (input.enabled) {
      const result = await this.canTemporarilyRegister(input.accelerator, `prompt:${id}`);
      if (!result.valid) throw createShortcutError(result.errorCode ?? 'in-use');
    }
    const binding: PromptShortcutBinding = { ...input, id };
    const existingIndex = prefs.promptBindings.findIndex(item => item.id === id || item.promptUUID === input.promptUUID);
    const promptBindings = [...prefs.promptBindings];
    if (existingIndex >= 0) promptBindings.splice(existingIndex, 1, { ...binding, id: promptBindings[existingIndex].id });
    else promptBindings.push(binding);
    preferencesManager.updatePreferences({ shortcuts: { ...prefs, promptBindings } });
    await this.registerUserShortcuts();
    return this.getState();
  }

  async removePromptBinding(id: string): Promise<ShortcutState> {
    const prefs = this.getShortcutPreferences();
    preferencesManager.updatePreferences({
      shortcuts: { ...prefs, promptBindings: prefs.promptBindings.filter(binding => binding.id !== id) },
    });
    await this.registerUserShortcuts();
    return this.getState();
  }

  async resolveLegacyBinding(id: string, promptUUID: string): Promise<void> {
    const prefs = this.getShortcutPreferences();
    const promptBindings = prefs.promptBindings.map(binding => binding.id === id ? { ...binding, promptUUID } : binding);
    preferencesManager.updatePreferences({ shortcuts: { ...prefs, promptBindings } });
    await this.registerUserShortcuts();
  }

  markBindingInvalid(id: string): void {
    const registryId = `prompt:${id}`;
    const accelerator = this.registeredById.get(registryId);
    if (accelerator) globalShortcut.unregister(accelerator);
    this.registeredById.delete(registryId);
    const binding = this.getShortcutPreferences().promptBindings.find(item => item.id === id);
    this.registrationStatuses.set(registryId, {
      id: registryId,
      accelerator: binding?.accelerator || '',
      state: 'invalid-target',
      message: 'prompt-missing',
    });
  }

  private async ensureLauncherWindow(): Promise<BrowserWindow> {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) return this.launcherWindow;
    if (this.launcherLoadPromise) return this.launcherLoadPromise;
    this.launcherLoadPromise = (async () => {
      const launcher = new BrowserWindow({
        width: 800,
        height: 460,
        show: false,
        frame: false,
        resizable: false,
        movable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: false,
        hasShadow: true,
        roundedCorners: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#141A24' : '#ffffff',
        webPreferences: {
          preload: join(__dirname, '..', 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      this.launcherWindow = launcher;
      this.launcherReady = false;
      launcher.on('closed', () => {
        this.launcherWindow = null;
        this.launcherReady = false;
        this.launcherLoadPromise = null;
      });
      launcher.on('blur', () => {
        if (launcher.isVisible() && !launcher.webContents.isDevToolsOpened()) launcher.hide();
      });
      const mainUrl = this.mainWindow?.webContents.getURL();
      if (!mainUrl) throw new Error('Main window is not ready yet');
      const url = new URL(mainUrl);
      url.searchParams.set('surface', 'launcher');
      await launcher.loadURL(url.toString());
      return launcher;
    })();
    try {
      return await this.launcherLoadPromise;
    } finally {
      this.launcherLoadPromise = null;
    }
  }

  markLauncherReady(senderId: number): void {
    if (!this.launcherWindow || this.launcherWindow.webContents.id !== senderId) return;
    this.launcherReady = true;
    const pending = this.pendingInvocations.splice(0);
    for (const invocation of pending) {
      this.launcherWindow.webContents.send('shortcut:launcher-invocation', invocation);
    }
  }

  async openLauncher(invocation: ShortcutInvocation): Promise<void> {
    if (!this.launcherWindow?.isVisible()) {
      const pasteCapability = await this.getPasteCapability(false);
      this.pasteTarget = this.mainWindow?.isFocused()
        || this.launcherWindow?.isFocused()
        || !pasteCapability.supported
        || !pasteCapability.permissionGranted
        ? null
        : await this.capturePasteTarget();
    }
    const launcher = await this.ensureLauncherWindow();
    if (this.launcherReady) {
      launcher.webContents.send('shortcut:launcher-invocation', invocation);
    }
    else this.pendingInvocations.push(invocation);
  }

  showLauncherWindow(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const bounds = this.launcherWindow.getBounds();
    const x = Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2);
    const y = Math.round(display.workArea.y + Math.min(140, (display.workArea.height - bounds.height) / 3));
    this.launcherWindow.setPosition(x, y, false);
    this.launcherWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#141A24' : '#ffffff');
    this.launcherWindow.webContents.invalidate();
    this.launcherWindow.show();
    this.launcherWindow.focus();
  }

  hideLauncherWindow(): void {
    this.launcherWindow?.hide();
  }

  async previewLauncher(): Promise<void> {
    await this.openLauncher({ kind: 'launcher' });
  }

  private showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
  }

  private toggleMainWindow(): void {
    if (this.mainWindow?.isVisible() && this.mainWindow.isFocused()) this.mainWindow.hide();
    else this.showMainWindow();
  }

  navigateMain(target: 'home' | 'new-prompt' | 'shortcuts', promptUUID?: string): void {
    this.hideLauncherWindow();
    this.showMainWindow();
    this.mainWindow?.webContents.send('shortcut:navigate-main', { target, promptUUID });
  }

  async executeText(request: ShortcutExecutionRequest): Promise<{ success: boolean; pasted: boolean }> {
    clipboard.writeText(request.content);
    this.recordRecent(request.promptUUID);
    this.hideLauncherWindow();
    const strings = getMainStrings().notifications;
    if (request.action === 'paste') {
      const failure = await this.autoPaste();
      if (failure) {
        // 内容已经在剪贴板里，用户手动粘贴即可；原始报错只写日志
        this.notify(strings.copiedTitle, failure === 'accessibility-permission'
          ? strings.pasteNeedsPermission
          : strings.pasteFailed);
        return { success: true, pasted: false };
      }
      return { success: true, pasted: true };
    }
    this.notify(strings.copiedTitle, request.title);
    return { success: true, pasted: false };
  }

  private recordRecent(promptUUID: string): void {
    const prefs = this.getShortcutPreferences();
    const recentPromptUUIDs = [promptUUID, ...prefs.recentPromptUUIDs.filter(uuid => uuid !== promptUUID)].slice(0, 20);
    preferencesManager.updatePreferences({ shortcuts: { ...prefs, recentPromptUUIDs } });
  }

  private notify(title: string, body: string): void {
    if (!preferencesManager.getPreferences().showNotifications || !Notification.isSupported()) return;
    new Notification({ title, body }).show();
  }

  async getPasteCapability(requestPermission = false): Promise<PasteCapability> {
    if (process.platform === 'darwin') {
      const permissionGranted = systemPreferences.isTrustedAccessibilityClient(requestPermission);
      return {
        supported: true,
        permissionGranted,
        reason: permissionGranted ? undefined : 'accessibility-permission',
      };
    }
    if (process.platform === 'win32') return { supported: true, permissionGranted: true };
    if (process.platform === 'linux') {
      if ((process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland') {
        return { supported: false, permissionGranted: false, reason: 'wayland' };
      }
      try {
        await this.execFileAsync('which', ['xdotool']);
        return { supported: true, permissionGranted: true };
      } catch {
        return { supported: false, permissionGranted: false, reason: 'xdotool-missing' };
      }
    }
    return { supported: false, permissionGranted: false, reason: 'unsupported-platform' };
  }

  private async capturePasteTarget(): Promise<PasteTarget> {
    try {
      if (process.platform === 'darwin') {
        const value = await this.execFileAsync('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true']);
        return { platform: process.platform, value: value.trim() };
      }
      if (process.platform === 'win32') {
        const script = 'Add-Type @"\nusing System; using System.Runtime.InteropServices; public class FG { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }\n"@; [FG]::GetForegroundWindow().ToInt64()';
        const value = await this.execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
        return { platform: process.platform, value: value.trim() };
      }
      if (process.platform === 'linux' && (process.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'wayland') {
        const value = await this.execFileAsync('xdotool', ['getactivewindow']);
        return { platform: process.platform, value: value.trim() };
      }
    } catch (error) {
      console.warn('无法记录原前台窗口:', error);
    }
    return null;
  }

  /** 自动粘贴到唤起启动器前的窗口；成功返回 null，失败返回原因 */
  private async autoPaste(): Promise<PasteFailure | null> {
    const capability = await this.getPasteCapability(false);
    if (!capability.supported || !capability.permissionGranted) return capability.reason ?? 'failed';
    if (!this.pasteTarget?.value) return 'no-target';
    await new Promise(resolve => setTimeout(resolve, 120));
    try {
      if (this.pasteTarget.platform === 'darwin') {
        await this.execFileAsync('osascript', [
          '-e', 'on run argv',
          '-e', 'tell application (item 1 of argv) to activate',
          '-e', 'delay 0.12',
          '-e', 'tell application "System Events" to keystroke "v" using command down',
          '-e', 'end run',
          this.pasteTarget.value,
        ]);
      } else if (this.pasteTarget.platform === 'win32') {
        const handle = Number(this.pasteTarget.value);
        if (!Number.isFinite(handle)) throw new Error(`Invalid window handle: ${this.pasteTarget.value}`);
        const script = `Add-Type -AssemblyName System.Windows.Forms; Add-Type @"\nusing System; using System.Runtime.InteropServices; public class FG { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }\n"@; [FG]::SetForegroundWindow([IntPtr]${handle}); Start-Sleep -Milliseconds 120; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
        await this.execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
      } else if (this.pasteTarget.platform === 'linux') {
        await this.execFileAsync('xdotool', ['windowactivate', '--sync', this.pasteTarget.value]);
        await this.execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      }
      return null;
    } catch (error) {
      console.warn('自动粘贴失败:', error);
      return 'failed';
    }
  }

  private execFileAsync(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    });
  }

  async getState(): Promise<ShortcutState> {
    return {
      preferences: this.getShortcutPreferences(),
      registrations: Array.from(this.registrationStatuses.values()),
      pasteCapability: await this.getPasteCapability(false),
    };
  }

  temporarilyDisableShortcuts(): void {
    if (this.isTemporarilyDisabled) return;
    this.unregisterAllShortcuts();
    this.isTemporarilyDisabled = true;
  }

  restoreShortcuts(): void {
    if (!this.isTemporarilyDisabled) return;
    this.isTemporarilyDisabled = false;
    void this.registerUserShortcuts();
  }

  async checkPermissionsAndRegister(): Promise<{ hasPermission: boolean; reason?: PasteUnavailableReason }> {
    const capability = await this.getPasteCapability(false);
    return { hasPermission: capability.permissionGranted, reason: capability.reason };
  }

  registerDefaultShortcuts(): void {
    void this.registerUserShortcuts();
  }

  unregisterAllShortcuts(): void {
    globalShortcut.unregisterAll();
    this.registeredById.clear();
  }

  isRegistered(accelerator: string): boolean {
    return Array.from(this.registeredById.values()).includes(this.normalizeAccelerator(accelerator));
  }

  getRegisteredShortcuts(): string[] {
    return Array.from(this.registeredById.values());
  }

  isShortcutAvailable(accelerator: string): boolean {
    return this.validateAccelerator(accelerator).valid && !globalShortcut.isRegistered(this.normalizeAccelerator(accelerator));
  }

  async reregisterShortcuts(): Promise<void> {
    await this.registerUserShortcuts();
  }

  destroy(): void {
    this.unregisterAllShortcuts();
    this.launcherWindow?.destroy();
    this.launcherWindow = null;
  }
}
