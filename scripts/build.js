const Path = require('path');
const Chalk = require('chalk');
const FileSystem = require('fs');
const Vite = require('vite');
const ChildProcess = require('child_process');
const compileTs = require('./private/tsc');

/**
 * 构建渲染进程
 * 使用 Vite 构建前端代码
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
 * 编译 TypeScript 代码为 JavaScript
 */
function buildMain() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    console.log(Chalk.blueBright(`Building main process from: ${mainPath}`));
    return compileTs(mainPath);
}

/**
 * 生成初始数据库
 * 执行数据库初始化脚本
 */
function generateStarterDatabase() {
    return new Promise((resolve, reject) => {
        console.log(Chalk.yellowBright('Generating starter database...'));
        // 执行生成初始数据库的脚本
        const dbProcess = ChildProcess.exec('node scripts/generate-starter-db.js', {
            cwd: Path.join(__dirname, '..'),
        });

        // 监听标准输出，显示构建信息
        if (dbProcess.stdout) {
            dbProcess.stdout.on('data', data =>
                process.stdout.write(Chalk.yellowBright(`[starter-db] `) + Chalk.white(data.toString()))
            );
        }

        // 监听错误输出
        if (dbProcess.stderr) {
            dbProcess.stderr.on('data', data =>
                process.stderr.write(Chalk.yellowBright(`[starter-db] `) + Chalk.white(data.toString()))
            );
        }

        // 处理进程退出事件
        dbProcess.on('exit', exitCode => {
            if (exitCode && exitCode > 0) {
                console.warn(Chalk.yellowBright('Starter database generation failed, continuing with existing database...'));
                resolve(undefined); // 不阻止构建，即使 starter db 生成失败
            } else {
                console.log(Chalk.greenBright('Starter database generated successfully!'));
                resolve(undefined);
            }
        });
    });
}

/**
 * 生成 Prisma 客户端
 * 根据 schema 生成类型安全的数据库客户端代码
 */
function generatePrismaClient() {
    return new Promise((resolve, reject) => {
        console.log(Chalk.yellowBright('Generating Prisma client...'));
        // 执行 Prisma 客户端生成命令
        const prismaProcess = ChildProcess.exec('yarn prisma generate', {
            cwd: Path.join(__dirname, '..'),
            env: {
                ...process.env,
                // 确保在构建时使用正确的数据库 URL
                DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db'
            }
        });

        // 监听 Prisma 生成过程的输出
        if (prismaProcess.stdout) {
            prismaProcess.stdout.on('data', data =>
                process.stdout.write(Chalk.yellowBright(`[prisma] `) + Chalk.white(data.toString()))
            );
        }

        // 监听 Prisma 生成过程的错误输出
        if (prismaProcess.stderr) {
            prismaProcess.stderr.on('data', data =>
                process.stderr.write(Chalk.yellowBright(`[prisma] `) + Chalk.white(data.toString()))
            );
        }

        // 处理 Prisma 生成进程退出
        prismaProcess.on('exit', exitCode => {
            if (exitCode && exitCode > 0) {
                reject(new Error(`Prisma generate failed with exit code ${exitCode}`));
            } else {
                console.log(Chalk.greenBright('Prisma client generated successfully!'));
                resolve(undefined);
            }
        });
    });
}

/**
 * 准备 Prisma 相关文件
 * 将 Prisma schema 和生成的客户端复制到构建目录
 */
function preparePrismaFiles() {
    const srcPrismaPath = Path.join(__dirname, '..', 'prisma');
    const buildPrismaPath = Path.join(__dirname, '..', 'build', 'prisma');

    // 确保构建目录存在
    if (!FileSystem.existsSync(buildPrismaPath)) {
        FileSystem.mkdirSync(buildPrismaPath, { recursive: true });
    }

    // 复制 schema.prisma 文件到构建目录
    if (FileSystem.existsSync(Path.join(srcPrismaPath, 'schema.prisma'))) {
        FileSystem.copyFileSync(
            Path.join(srcPrismaPath, 'schema.prisma'),
            Path.join(buildPrismaPath, 'schema.prisma')
        );
        console.log(Chalk.greenBright('Prisma schema copied to build directory'));
    }

    // 复制生成的 Prisma 客户端到构建目录
    const generatedPath = Path.join(__dirname, '..', 'node_modules', '.prisma');
    const buildGeneratedPath = Path.join(__dirname, '..', 'build', 'node_modules', '.prisma');

    if (FileSystem.existsSync(generatedPath)) {
        // 确保目标目录存在
        FileSystem.mkdirSync(Path.dirname(buildGeneratedPath), { recursive: true });

        // 递归复制目录
        copyDirectory(generatedPath, buildGeneratedPath);
        console.log(Chalk.greenBright('Generated Prisma client copied to build directory'));
    }
}

/**
 * 递归复制目录
 * @param {string} src - 源目录路径
 * @param {string} dest - 目标目录路径
 */
function copyDirectory(src, dest) {
    // 确保目标目录存在
    if (!FileSystem.existsSync(dest)) {
        FileSystem.mkdirSync(dest, { recursive: true });
    }

    // 读取源目录中的所有条目
    const entries = FileSystem.readdirSync(src, { withFileTypes: true });

    // 遍历每个条目进行复制
    for (const entry of entries) {
        const srcPath = Path.join(src, entry.name);
        const destPath = Path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // 如果是目录，递归复制
            copyDirectory(srcPath, destPath);
        } else {
            // 如果是文件，直接复制
            FileSystem.copyFileSync(srcPath, destPath);
        }
    }
}

// 清理构建目录
FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
})

console.log(Chalk.blueBright('Building application...'));

// 构建流程：首先生成 Prisma 客户端，然后构建应用
generatePrismaClient().then(() => {
    // 准备 Prisma 相关文件
    preparePrismaFiles();
    console.log(Chalk.blueBright('Transpiling renderer & main...'));

    // 并行构建渲染进程和主进程
    // 使用 Promise.all 而不是 Promise.allSettled，这样任何失败都会导致整个构建失败
    return Promise.all([
        buildRenderer(),
        buildMain(),
    ]);
}).then((results) => {
    console.log(Chalk.greenBright('Renderer & main successfully transpiled! (ready to be built with electron-builder)'));

    // 验证构建结果，确保必要的目录都存在
    const buildDir = Path.join(__dirname, '..', 'build');
    const mainDir = Path.join(buildDir, 'main');
    const rendererDir = Path.join(buildDir, 'renderer');

    // 检查主进程构建目录
    if (!FileSystem.existsSync(mainDir)) {
        throw new Error('Main build directory does not exist: ' + mainDir);
    }
    // 检查渲染进程构建目录
    if (!FileSystem.existsSync(rendererDir)) {
        throw new Error('Renderer build directory does not exist: ' + rendererDir);
    }

    console.log(Chalk.greenBright('Build verification passed!'));
}).catch((error) => {
    // 捕获并处理构建过程中的任何错误
    console.error(Chalk.redBright('Build failed:'), error);
    process.exit(1);
});
