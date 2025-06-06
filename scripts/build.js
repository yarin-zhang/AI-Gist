// @ts-nocheck
const Path = require('path');
const Chalk = require('chalk');
const FileSystem = require('fs');
const Vite = require('vite');
const ChildProcess = require('child_process');
const compileTs = require('./private/tsc');

/**
 * 构建渲染进程
 */
function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        base: './',
        mode: 'production'
    });
}

/**
 * 构建主进程
 */
function buildMain() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    console.log(Chalk.blueBright(`正在构建主进程：${mainPath}`));
    return compileTs(mainPath);
}

/**
 * 复制资源文件到构建目录
 */
function copyResources() {
    const resourcesPath = Path.join(__dirname, '..', 'resources');
    const buildResourcesPath = Path.join(__dirname, '..', 'build', 'resources');

    if (FileSystem.existsSync(resourcesPath)) {
        FileSystem.cpSync(resourcesPath, buildResourcesPath, { recursive: true });
        console.log(Chalk.greenBright('资源文件已复制到构建目录'));
    }
}

/**
 * 复制图标资源到构建目录
 */
function copyAssets() {
    const assetsPath = Path.join(__dirname, '..', 'src', 'assets');
    const buildAssetsPath = Path.join(__dirname, '..', 'build', 'assets');

    if (FileSystem.existsSync(assetsPath)) {
        // 确保目标目录存在
        if (!FileSystem.existsSync(buildAssetsPath)) {
            FileSystem.mkdirSync(buildAssetsPath, { recursive: true });
        }
        
        // 复制图标文件
        const iconFiles = ['windows.ico', 'macos.icns', 'linux.png', 'icon.png', 'tray.png', 'tray@2x.png'];
        iconFiles.forEach(file => {
            const srcPath = Path.join(assetsPath, file);
            const destPath = Path.join(buildAssetsPath, file);
            if (FileSystem.existsSync(srcPath)) {
                FileSystem.copyFileSync(srcPath, destPath);
                console.log(Chalk.greenBright(`图标文件已复制: ${file}`));
            }
        });
    }
}

// 清理构建目录
FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
});

console.log(Chalk.blueBright('开始构建应用程序...'));

// 并行构建渲染进程和主进程
Promise.all([
    buildRenderer(),
    buildMain(),
])
    .then(() => {
        // 复制必要的资源文件
        copyResources();
        
        // 复制图标资源文件
        copyAssets();
        
        console.log(Chalk.greenBright('构建成功完成！'));
        console.log(Chalk.greenBright('可以使用 electron-builder 进行打包。'));
    })
    .catch((error) => {
        console.error(Chalk.redBright('构建失败：'), error);
        process.exit(1);
    });
