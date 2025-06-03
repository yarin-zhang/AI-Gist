const Path = require('path');
const Chalk = require('chalk');
const FileSystem = require('fs');
const Vite = require('vite');
const ChildProcess = require('child_process');
const compileTs = require('./private/tsc');

function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        base: './',
        mode: 'production'
    });
}

function buildMain() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    console.log(Chalk.blueBright(`Building main process from: ${mainPath}`));
    return compileTs(mainPath);
}

function generatePrismaClient() {
    return new Promise((resolve, reject) => {
        console.log(Chalk.yellowBright('Generating Prisma client...'));
        const prismaProcess = ChildProcess.exec('npx prisma generate', {
            cwd: Path.join(__dirname, '..')
        });

        if (prismaProcess.stdout) {
            prismaProcess.stdout.on('data', data => 
                process.stdout.write(Chalk.yellowBright(`[prisma] `) + Chalk.white(data.toString()))
            );
        }

        if (prismaProcess.stderr) {
            prismaProcess.stderr.on('data', data => 
                process.stderr.write(Chalk.yellowBright(`[prisma] `) + Chalk.white(data.toString()))
            );
        }

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

function preparePrismaFiles() {
    const srcPrismaPath = Path.join(__dirname, '..', 'prisma');
    const buildPrismaPath = Path.join(__dirname, '..', 'build', 'prisma');
    
    // 确保构建目录存在
    if (!FileSystem.existsSync(buildPrismaPath)) {
        FileSystem.mkdirSync(buildPrismaPath, { recursive: true });
    }
    
    // 复制 schema.prisma 文件
    if (FileSystem.existsSync(Path.join(srcPrismaPath, 'schema.prisma'))) {
        FileSystem.copyFileSync(
            Path.join(srcPrismaPath, 'schema.prisma'),
            Path.join(buildPrismaPath, 'schema.prisma')
        );
        console.log(Chalk.greenBright('Prisma schema copied to build directory'));
    }
}

FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
})

console.log(Chalk.blueBright('Building application...'));

// 首先生成 Prisma 客户端，然后构建应用
generatePrismaClient().then(() => {
    preparePrismaFiles();
    console.log(Chalk.blueBright('Transpiling renderer & main...'));
    
    // 使用 Promise.all 而不是 Promise.allSettled，这样任何失败都会导致整个构建失败
    return Promise.all([
        buildRenderer(),
        buildMain(),
    ]);
}).then((results) => {
    console.log(Chalk.greenBright('Renderer & main successfully transpiled! (ready to be built with electron-builder)'));
    
    // 验证构建结果
    const buildDir = Path.join(__dirname, '..', 'build');
    const mainDir = Path.join(buildDir, 'main');
    const rendererDir = Path.join(buildDir, 'renderer');
    
    if (!FileSystem.existsSync(mainDir)) {
        throw new Error('Main build directory does not exist: ' + mainDir);
    }
    if (!FileSystem.existsSync(rendererDir)) {
        throw new Error('Renderer build directory does not exist: ' + rendererDir);
    }
    
    console.log(Chalk.greenBright('Build verification passed!'));
}).catch((error) => {
    console.error(Chalk.redBright('Build failed:'), error);
    process.exit(1);
});
