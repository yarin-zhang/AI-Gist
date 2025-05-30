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

function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, '..', 'vite.config.js'),
        base: './',
        mode: 'production'
    });
}

function buildMain() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    return compileTs(mainPath);
}

FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
})

console.log(Chalk.blueBright('Building application...'));

// 首先生成 Prisma 客户端，然后构建应用
generatePrismaClient().then(() => {
    console.log(Chalk.blueBright('Transpiling renderer & main...'));
    
    return Promise.allSettled([
        buildRenderer(),
        buildMain(),
    ]);
}).then(() => {
    console.log(Chalk.greenBright('Renderer & main successfully transpiled! (ready to be built with electron-builder)'));
}).catch((error) => {
    console.error(Chalk.redBright('Build failed:'), error);
    process.exit(1);
});
