import {app, BrowserWindow, ipcMain, session} from 'electron';
import {join} from 'path';
import { initDatabase, closeDatabase, DatabaseService } from './database';
import { appRouter, setDatabaseService } from './trpc';

let dbService: DatabaseService | null = null;

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
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
  // 初始化数据库
  try {
    initDatabase();
    dbService = new DatabaseService();
    setDatabaseService(dbService);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  createWindow();

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
  if (process.platform !== 'darwin') app.quit()
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