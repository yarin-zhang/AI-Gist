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
const ElectronGet = require('@electron/get');
const Unzipper = require('unzipper');
const compileTs = require('./private/tsc');
const FileSystem = require('fs');
const { EOL } = require('os');

// 全局变量定义
const isWindowsPreview = process.argv.includes('--windows');
const projectRoot = Path.join(__dirname, '..');
const windowsPowerShellPath = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const windowsSystemPath = '/mnt/c/Windows';
let viteServer = null;          // Vite 开发服务器实例
let electronProcess = null;     // Electron 进程实例
let electronProcessLocker = false;  // Electron 进程锁，防止重复启动
let rendererPort = 0;          // 渲染进程端口号
let windowsElectronExecutable = null;
let isStopping = false;

function runCommand(command, args, options = {}) {
    return ChildProcess.execFileSync(command, args, {
        encoding: 'utf8',
        ...options,
    }).replace(/\r/g, '').trim();
}

function appendWslEnv(currentValue, variableName) {
    const entries = (currentValue || '').split(':').filter(Boolean);
    if (!entries.some(entry => entry.split('/')[0] === variableName)) {
        entries.push(variableName);
    }
    return entries.join(':');
}

async function prepareWindowsElectron() {
    if (windowsElectronExecutable) {
        return windowsElectronExecutable;
    }

    if (process.platform !== 'linux' || !process.env.WSL_DISTRO_NAME) {
        throw new Error('dev:win 需要在 WSL 中运行；原生 Windows 环境请直接使用 yarn dev。');
    }

    if (!FileSystem.existsSync(windowsPowerShellPath)) {
        throw new Error('未找到 Windows PowerShell，无法准备 Windows Electron 开发运行时。');
    }

    const localAppDataWindows = runCommand(windowsPowerShellPath, [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Environment]::GetFolderPath("LocalApplicationData")',
    ], { cwd: windowsSystemPath });
    const localAppDataWsl = runCommand('wslpath', ['-u', localAppDataWindows]);
    const electronVersion = require('electron/package.json').version;
    const runtimeDirectory = Path.join(
        localAppDataWsl,
        'AI-Gist',
        'dev-runtime',
        `electron-v${electronVersion}-win32-x64`,
    );
    const executablePath = Path.join(runtimeDirectory, 'electron.exe');

    if (!FileSystem.existsSync(executablePath)) {
        console.log(Chalk.blueBright('[windows] ') + `首次运行，正在准备 Electron ${electronVersion} Windows 开发运行时...`);
        FileSystem.rmSync(runtimeDirectory, { recursive: true, force: true });
        FileSystem.mkdirSync(runtimeDirectory, { recursive: true });

        try {
            const archivePath = await ElectronGet.downloadArtifact({
                version: electronVersion,
                artifactName: 'electron',
                platform: 'win32',
                arch: 'x64',
            });
            await FileSystem.createReadStream(archivePath)
                .pipe(Unzipper.Extract({ path: runtimeDirectory }))
                .promise();
        } catch (error) {
            FileSystem.rmSync(runtimeDirectory, { recursive: true, force: true });
            throw error;
        }
    }

    windowsElectronExecutable = executablePath;
    return windowsElectronExecutable;
}

function stopWindowsElectron() {
    if (!windowsElectronExecutable) {
        return;
    }

    const windowsExecutablePath = runCommand('wslpath', ['-w', windowsElectronExecutable]);
    const escapedExecutablePath = windowsExecutablePath.replace(/'/g, "''");
    const stopCommand = [
        `$target = '${escapedExecutablePath}';`,
        'Get-CimInstance Win32_Process',
        '| Where-Object { $_.ExecutablePath -eq $target }',
        '| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' ');

    try {
        runCommand(windowsPowerShellPath, [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            stopCommand,
        ], { cwd: windowsSystemPath });
    } catch (error) {
        console.log(Chalk.yellowBright('[windows] 无法结束旧的 Electron 进程，将继续尝试重启。'));
    }
}

function terminateElectron() {
    if (!electronProcess) {
        return;
    }

    electronProcess.removeAllListeners('exit');
    if (isWindowsPreview) {
        stopWindowsElectron();
    } else {
        electronProcess.kill();
    }
    electronProcess = null;
}

/**
 * 启动渲染器进程开发服务器
 * @returns {Promise} Vite 服务器实例
 */
async function startRenderer() {
    viteServer = await Vite.createServer({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        mode: 'development',
        server: isWindowsPreview ? { host: '0.0.0.0' } : undefined,
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
    const mainEntryPath = Path.join(projectRoot, 'build', 'main', 'main.js');
    let executable = Electron;
    let args = [mainEntryPath, rendererPort];
    let spawnOptions = {};

    if (isWindowsPreview) {
        executable = await prepareWindowsElectron();
        const windowsMainEntryPath = runCommand('wslpath', ['-w', mainEntryPath]);
        args = [windowsMainEntryPath, rendererPort];
        spawnOptions = {
            cwd: Path.dirname(executable),
            env: {
                ...process.env,
                NODE_ENV: 'development',
                WSLENV: appendWslEnv(process.env.WSLENV, 'NODE_ENV'),
            },
        };
    }

    const remoteDebuggingPort = process.env.AI_GIST_REMOTE_DEBUGGING_PORT;
    if (remoteDebuggingPort && /^\d+$/.test(remoteDebuggingPort)) {
        args.push(`--remote-debugging-port=${remoteDebuggingPort}`);
    }

    const isolatedUserDataDirectory = process.env.AI_GIST_USER_DATA_DIR;
    if (isolatedUserDataDirectory) {
        const userDataDirectory = isWindowsPreview && isolatedUserDataDirectory.startsWith('/')
            ? runCommand('wslpath', ['-w', isolatedUserDataDirectory])
            : isolatedUserDataDirectory;
        args.unshift(`--user-data-dir=${userDataDirectory}`);
    }

    electronProcess = ChildProcess.spawn(executable, args, spawnOptions);
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
        terminateElectron();
    }

    // 使用锁机制防止重复启动
    if (!electronProcessLocker) {
        electronProcessLocker = true;
        setTimeout(startElectron, isWindowsPreview ? 300 : 0);
    }
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
    if (isStopping) {
        return;
    }
    isStopping = true;
    terminateElectron();
    if (viteServer) {
        viteServer.close();
    }
    process.exit();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

/**
 * 启动开发服务器主函数
 */
async function start() {
    console.log(`${Chalk.greenBright('=======================================')}`);
    const previewPlatform = isWindowsPreview ? 'Windows Electron' : 'Electron';
    console.log(`${Chalk.greenBright(`正在启动 ${previewPlatform} + Vite 开发服务器...`)}`);
    console.log(`${Chalk.greenBright('=======================================')}`);

    if (isWindowsPreview) {
        await prepareWindowsElectron();
    }

    // 启动渲染器开发服务器
    const devServer = await startRenderer();
    rendererPort = devServer.config.server.port;

    // 启动 Electron 主进程
    startElectron();

    // 监听主进程文件变化
    const watchPath = Path.join(__dirname, '..', 'src', 'main');
    Chokidar.watch(watchPath, {
        cwd: watchPath,
    }).on('change', (filePath) => {
        console.log(Chalk.blueBright(`[electron] `) + `检测到文件变化: ${filePath}，正在重新加载... 🚀`);

        restartElectron();
    });
}

// 启动开发服务器
start().catch(error => {
    console.error(Chalk.redBright(`开发服务器启动失败: ${error.message}`));
    stop();
});
