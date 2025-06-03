import {app, BrowserWindow, ipcMain, session, Tray, Menu, dialog, nativeImage} from 'electron';
import {join} from 'path';
import { initDatabase, closeDatabase, DatabaseService,ensureDatabaseExists } from './database';
import { appRouter, setDatabaseService } from './trpc';
import { existsSync } from 'fs';

let dbService: DatabaseService | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// 用户偏好设置
interface UserPreferences {
  dontShowCloseDialog: boolean;
  closeAction: 'quit' | 'minimize'; // 'quit' 退出, 'minimize' 最小化到托盘
}

let userPrefs: UserPreferences = {
  dontShowCloseDialog: false,
  closeAction: 'quit'
};

function getAppIconPath(): string {
  // 尝试多个可能的图标路径
  const possiblePaths = [
    join(__dirname, '..', 'assets', 'icon.png'),
    join(__dirname, '..', 'assets', 'app.png'),
    join(__dirname, '..', 'assets', 'tray.png'),
    join(process.cwd(), 'assets', 'icon.png'),
    join(process.cwd(), 'src', 'assets', 'icon.png')
  ];

  for (const iconPath of possiblePaths) {
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  // 如果没有找到图标文件，返回空字符串
  console.warn('No icon file found, using default system icon');
  return '';
}

function createTray() {
  try {
    const iconPath = getAppIconPath();
    if (!iconPath) {
      console.warn('Cannot create tray: no icon file found');
      return;
    }

    // 创建托盘图标
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.warn('Cannot create tray: icon file is invalid or empty');
      return;
    }

    tray = new Tray(icon);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('AI-Gist');
    tray.setContextMenu(contextMenu);
    
    // 双击托盘图标显示窗口
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    console.log('System tray created successfully');
  } catch (error) {
    console.error('Failed to create system tray:', error);
  }
}

function createWindow () {
  const iconPath = getAppIconPath();
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath || undefined, // 为窗口设置图标，这样会在任务栏显示
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // 处理窗口关闭事件
  mainWindow.on('close', async (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();

    // 如果用户设置了不再提示，直接执行保存的操作
    if (userPrefs.dontShowCloseDialog) {
      if (userPrefs.closeAction === 'minimize') {
        mainWindow?.hide();
      } else {
        isQuitting = true;
        app.quit();
      }
      return;
    }

    // 显示关闭确认对话框
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['退出', '最小化到托盘', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '确认操作',
      message: '您想要退出应用程序还是最小化到系统托盘？',
      detail: '最小化到托盘后，应用程序将在后台继续运行。',
      checkboxLabel: '不再显示此对话框',
      checkboxChecked: false
    });

    if (result.response === 2) {
      // 取消
      return;
    }

    // 保存用户偏好
    if (result.checkboxChecked) {
      userPrefs.dontShowCloseDialog = true;
      userPrefs.closeAction = result.response === 0 ? 'quit' : 'minimize';
    }

    if (result.response === 0) {
      // 退出
      isQuitting = true;
      app.quit();
    } else if (result.response === 1) {
      // 最小化到托盘
      mainWindow?.hide();
    }
  });

  if (process.env.NODE_ENV === 'development') {
    const rendererPort = process.argv[2];
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
  }
  else {
    mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'));
  }
}

app.whenReady().then(async () => {
  createTray();

  try {
    // 初始化数据库
    console.log('Initializing database...');
    const db = initDatabase();
    await ensureDatabaseExists();
    
    dbService = new DatabaseService();
    setDatabaseService(dbService);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    
    // 显示错误对话框
    if (mainWindow) {
      dialog.showErrorBox(
        '数据库初始化失败',
        `应用程序无法初始化数据库。错误信息：\n${error instanceof Error ? error.message : String(error)}\n\n请尝试重新启动应用程序。如果问题持续存在，请联系技术支持。`
      );
    }
    
    // 延迟退出，让用户看到错误信息
    setTimeout(() => {
      app.quit();
    }, 3000);
    return;
  }

  createWindow();
  
  // 创建系统托盘（在所有平台上都尝试创建，但主要用于 Windows 和 Linux）
  createTray();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['script-src \'self\'']
      }
    })
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async function () {
  // 关闭数据库连接
  await closeDatabase();
  // 在 Windows 和 Linux 上，如果有托盘图标，不退出应用
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.on('message', (event, message) => {
  console.log(message);
});

// tRPC IPC 处理器
ipcMain.handle('trpc', async (_, input: { path: string; input?: any; type: 'query' | 'mutation' }) => {
  try {
    const pathParts = input.path.split('.');
    const routerName = pathParts[0]; // 'users' or 'posts'
    const procedureName = pathParts[1]; // 'create', 'getAll', etc.

    // 根据路径调用相应的数据库方法
    if (routerName === 'users') {
      switch (procedureName) {
        case 'create':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.createUser(input.input.email, input.input.name);
        case 'getAll':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getAllUsers();
        case 'getById':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getUserById(input.input);
        case 'update':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.updateUser(input.input.id, input.input.data);
        case 'delete':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.deleteUser(input.input);
        default:
          throw new Error(`Unknown procedure: ${input.path}`);
      }
    } else if (routerName === 'posts') {
      switch (procedureName) {
        case 'create':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.createPost(input.input.title, input.input.content, input.input.authorId);
        case 'getAll':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getAllPosts();
        case 'getById':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getPostById(input.input);
        case 'update':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.updatePost(input.input.id, input.input.data);
        case 'delete':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.deletePost(input.input);
        default:
          throw new Error(`Unknown procedure: ${input.path}`);
      }
    } else if (routerName === 'categories') {
      switch (procedureName) {
        case 'create':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.createCategory(input.input.name, input.input.color);
        case 'getAll':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getAllCategories();
        case 'update':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.updateCategory(input.input.id, input.input.data);
        case 'delete':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.deleteCategory(input.input);
        default:
          throw new Error(`Unknown procedure: ${input.path}`);
      }
    } else if (routerName === 'prompts') {
      switch (procedureName) {
        case 'create':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.createPrompt(input.input);
        case 'getAll':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getAllPrompts(input.input);
        case 'getById':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getPromptById(input.input);
        case 'update':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.updatePrompt(input.input.id, input.input.data);
        case 'delete':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.deletePrompt(input.input);
        case 'incrementUseCount':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.incrementPromptUseCount(input.input);
        case 'fillVariables':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.fillPromptVariables(input.input.promptId, input.input.variables);
        case 'getFavorites':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.getFavoritePrompts();
        case 'toggleFavorite':
          if (!dbService) throw new Error('Database not initialized');
          return await dbService.togglePromptFavorite(input.input);
        default:
          throw new Error(`Unknown procedure: ${input.path}`);
      }
    } else {
      throw new Error(`Unknown router: ${routerName}`);
    }
  } catch (error) {
    console.error('tRPC call failed:', error);
    throw error;
  }
});

// 添加新的 IPC 处理器用于管理用户偏好
ipcMain.handle('get-user-preferences', () => {
  return userPrefs;
});

ipcMain.handle('set-user-preferences', (_, newPrefs: Partial<UserPreferences>) => {
  userPrefs = { ...userPrefs, ...newPrefs };
  return userPrefs;
});

ipcMain.handle('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('hide-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});