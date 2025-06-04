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
    console.log(Chalk.blueBright(`Building main process from: ${mainPath}`));
    return compileTs(mainPath);
}

/**
 * 生成 Prisma 客户端
 */
function generatePrismaClient() {
    return new Promise((resolve, reject) => {
        console.log(Chalk.yellowBright('Generating Prisma client...'));
        
        const prismaProcess = ChildProcess.exec('yarn prisma generate', {
            cwd: Path.join(__dirname, '..'),
        });

        if (prismaProcess.stdout) {
            prismaProcess.stdout.on('data', data =>
                process.stdout.write(Chalk.yellowBright(`[prisma] `) + data.toString())
            );
        }

        if (prismaProcess.stderr) {
            prismaProcess.stderr.on('data', data =>
                process.stderr.write(Chalk.yellowBright(`[prisma] `) + data.toString())
            );
        }

        prismaProcess.on('exit', exitCode => {
            if (exitCode && exitCode > 0) {
                reject(new Error(`Prisma generate failed with exit code ${exitCode}`));
            } else {
                console.log(Chalk.greenBright('Prisma client generated successfully!'));
                resolve();
            }
        });
    });
}

/**
 * 复制资源文件到构建目录
 */
function copyResources() {
    const resourcesPath = Path.join(__dirname, '..', 'resources');
    const buildResourcesPath = Path.join(__dirname, '..', 'build', 'resources');

    if (FileSystem.existsSync(resourcesPath)) {
        FileSystem.cpSync(resourcesPath, buildResourcesPath, { recursive: true });
        console.log(Chalk.greenBright('Resources copied to build directory'));
    }

    // 复制 Prisma schema 和 migrations
    const prismaPath = Path.join(__dirname, '..', 'prisma');
    const buildPrismaPath = Path.join(__dirname, '..', 'build', 'prisma');
    
    if (FileSystem.existsSync(prismaPath)) {
        FileSystem.cpSync(prismaPath, buildPrismaPath, { recursive: true });
        console.log(Chalk.greenBright('Prisma files copied to build directory'));
    }
}

// 清理构建目录
FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
});

console.log(Chalk.blueBright('Building application...'));

// 简化的构建流程
generatePrismaClient()
    .then(() => {
        console.log(Chalk.blueBright('Building renderer & main...'));
        
        // 并行构建渲染进程和主进程
        return Promise.all([
            buildRenderer(),
            buildMain(),
        ]);
    })
    .then(() => {
        // 复制必要的资源文件
        copyResources();
        
        console.log(Chalk.greenBright('Build completed successfully!'));
        console.log(Chalk.greenBright('Ready for electron-builder packaging.'));
    })
    .catch((error) => {
        console.error(Chalk.redBright('Build failed:'), error);
        process.exit(1);
    });
