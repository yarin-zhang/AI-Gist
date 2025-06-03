const ChildProcess = require('child_process');
const Chalk = require('chalk');

function compile(directory) {
  return new Promise((resolve, reject) => {
    console.log(Chalk.blueBright(`Compiling TypeScript in: ${directory}`));
    
    const tscProcess = ChildProcess.exec('npx tsc', {
      cwd: directory,
    });

    if (tscProcess.stdout) {
      tscProcess.stdout.on('data', data => 
          process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString()))
      );
    }

    if (tscProcess.stderr) {
      tscProcess.stderr.on('data', data => 
          process.stderr.write(Chalk.redBright(`[tsc error] `) + Chalk.white(data.toString()))
      );
    }

    tscProcess.on('exit', exitCode => {
      if (exitCode && exitCode > 0) {
        reject(new Error(`TypeScript compilation failed with exit code ${exitCode} in directory: ${directory}`));
      } else {
        console.log(Chalk.greenBright(`TypeScript compilation completed successfully in: ${directory}`));
        resolve(undefined);
      }
    });

    tscProcess.on('error', (error) => {
      reject(new Error(`Failed to start TypeScript compiler: ${error.message}`));
    });
  });
}

module.exports = compile;
