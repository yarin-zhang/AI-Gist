// 引入子进程模块，用于执行外部命令
const ChildProcess = require('child_process');

// 引入 Chalk 模块，用于给控制台输出添加颜色
const Chalk = require('chalk');

/**
 * 编译指定目录下的 TypeScript 代码
 * @param {string} directory - 要编译的目录路径
 * @returns {Promise<void>} 返回一个 Promise，编译成功时 resolve，失败时 reject
 */
function compile(directory) {
    return new Promise((resolve, reject) => {
        // 输出编译开始信息
        console.log(Chalk.blueBright(`正在编译 TypeScript 代码，目录: ${directory}`));

        // 在指定目录下执行 yarn tsc 命令
        const tscProcess = ChildProcess.exec('yarn tsc', {
            cwd: directory, // 设置工作目录
        });

        // 监听标准输出流，处理编译过程中的普通输出
        if (tscProcess.stdout) {
            tscProcess.stdout.on('data', data =>
                process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString()))
            );
        }

        // 监听标准错误流，处理编译过程中的错误输出
        if (tscProcess.stderr) {
            tscProcess.stderr.on('data', data =>
                process.stderr.write(Chalk.redBright(`[tsc error] `) + Chalk.white(data.toString()))
            );
        }

        // 监听进程退出事件
        tscProcess.on('exit', exitCode => {
            if (exitCode && exitCode > 0) {
                // 如果退出代码大于 0，表示编译失败
                reject(new Error(`TypeScript 编译失败，退出代码: ${exitCode}，目录: ${directory}`));
            } else {
                // 编译成功，现在运行 tsc-alias 来转换路径别名
                console.log(Chalk.greenBright(`TypeScript 编译成功完成，目录: ${directory}`));
                console.log(Chalk.blueBright(`正在转换路径别名...`));
                
                const tscAliasProcess = ChildProcess.exec('npx tsc-alias', {
                    cwd: directory,
                });

                if (tscAliasProcess.stdout) {
                    tscAliasProcess.stdout.on('data', data =>
                        process.stdout.write(Chalk.yellowBright(`[tsc-alias] `) + Chalk.white(data.toString()))
                    );
                }

                if (tscAliasProcess.stderr) {
                    tscAliasProcess.stderr.on('data', data =>
                        process.stderr.write(Chalk.redBright(`[tsc-alias error] `) + Chalk.white(data.toString()))
                    );
                }

                tscAliasProcess.on('exit', aliasExitCode => {
                    if (aliasExitCode && aliasExitCode > 0) {
                        reject(new Error(`路径别名转换失败，退出代码: ${aliasExitCode}，目录: ${directory}`));
                    } else {
                        console.log(Chalk.greenBright(`路径别名转换完成，目录: ${directory}`));
                        resolve(undefined);
                    }
                });

                tscAliasProcess.on('error', (error) => {
                    reject(new Error(`启动 tsc-alias 失败: ${error.message}`));
                });
            }
        });

        // 监听进程错误事件，处理启动编译器失败的情况
        tscProcess.on('error', (error) => {
            reject(new Error(`启动 TypeScript 编译器失败: ${error.message}`));
        });
    });
}

// 导出编译函数
module.exports = compile;
