// @ts-nocheck

// 设置开发环境
process.env.NODE_ENV = 'development';

// 引入必要的依赖模块
const Vite = require('vite');
const ChildProcess = require('child_process');
const Path = require('path');
const Chalk = require('chalk');
const Chokidar = require('chokidar');
const Electron = require('electron');
const compileTs = require('./private/tsc');
const FileSystem = require('fs');
const { EOL } = require('os');

// 全局变量定义
let viteServer = null;          // Vite 开发服务器实例
let electronProcess = null;     // Electron 进程实例
let electronProcessLocker = false;  // Electron 进程锁，防止重复启动
let rendererPort = 0;          // 渲染进程端口号

/**
 * 启动渲染器进程开发服务器
 * @returns {Promise} Vite 服务器实例
 */
async function startRenderer() {
    viteServer = await Vite.createServer({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        mode: 'development',
    });

    return viteServer.listen();
}

/**
 * 启动 Electron 主进程
 */
async function startElectron() {
    // 单例锁：防止重复启动
    if (electronProcess) {
        return;
    }

    try {
        // 编译 TypeScript 代码
        await compileTs(Path.join(__dirname, '..', 'src', 'main'));
    } catch (error) {
        console.log(Chalk.redBright('由于上述 TypeScript 错误，无法启动 Electron。'));
        electronProcessLocker = false;
        return;
    }

    // 设置 Electron 启动参数
    const args = [
        Path.join(__dirname, '..', 'build', 'main', 'main.js'),
        rendererPort,
    ];
    electronProcess = ChildProcess.spawn(Electron, args);
    electronProcessLocker = false;

    // 监听 Electron 进程的标准输出
    electronProcess.stdout.on('data', data => {
        if (data == EOL) {
            return;
        }
        process.stdout.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString()));
    });

    // 监听 Electron 进程的错误输出
    electronProcess.stderr.on('data', data =>
        process.stderr.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString()))
    );

    // 监听 Electron 进程退出事件
    electronProcess.on('exit', () => stop());
}

/**
 * 重启 Electron 进程
 */
function restartElectron() {
    // 如果进程存在，先终止它
    if (electronProcess) {
        electronProcess.removeAllListeners('exit');
        electronProcess.kill();
        electronProcess = null;
    }

    // 使用锁机制防止重复启动
    if (!electronProcessLocker) {
        electronProcessLocker = true;
        startElectron();
    }
}

/**
 * 复制静态文件到构建目录
 */
function copyStaticFiles() {
    copy('static');
}

/**
 * 复制指定路径的文件或目录
 * 工作目录是 build/main 而不是 src/main，因为需要编译 TS
 * tsc 不会复制静态文件，所以需要手动复制给开发服务器使用
 * @param {string} path - 要复制的路径
 */
function copy(path) {
    const srcPath = Path.join(__dirname, '..', 'src', 'main', path);
    const destPath = Path.join(__dirname, '..', 'build', 'main', path);
    
    try {
        FileSystem.cpSync(srcPath, destPath, { recursive: true });
    } catch (error) {
        console.log(Chalk.yellowBright(`[警告] 复制文件失败: ${path}`));
    }
}

/**
 * 停止开发服务器
 */
function stop() {
    if (viteServer) {
        viteServer.close();
    }
    process.exit();
}

/**
 * 启动开发服务器主函数
 */
async function start() {
    console.log(`${Chalk.greenBright('=======================================')}`);
    console.log(`${Chalk.greenBright('正在启动 Electron + Vite 开发服务器...')}`);
    console.log(`${Chalk.greenBright('=======================================')}`);

    // 启动渲染器开发服务器
    const devServer = await startRenderer();
    rendererPort = devServer.config.server.port;

    // 复制静态文件
    copyStaticFiles();
    
    // 启动 Electron 主进程
    startElectron();

    // 监听主进程文件变化
    const watchPath = Path.join(__dirname, '..', 'src', 'main');
    Chokidar.watch(watchPath, {
        cwd: watchPath,
    }).on('change', (filePath) => {
        console.log(Chalk.blueBright(`[electron] `) + `检测到文件变化: ${filePath}，正在重新加载... 🚀`);

        // 修复路径比较逻辑：检查是否为静态文件目录下的文件
        if (filePath.includes('static')) {
            copy(filePath);
        }

        restartElectron();
    });
}

// 启动开发服务器
start();
