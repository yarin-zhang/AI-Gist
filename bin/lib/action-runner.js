'use strict';

const { invoke } = require('./bridge-client');
const { printResult, printError } = require('./output');

/**
 * 把一个"根据 commander 传入的参数计算出要调用哪个桥接动作"的纯函数，
 * 包装成一个真正的 commander action handler：统一处理 --json 输出、错误与退出码。
 *
 * Commander 无论声明了多少个位置参数，总会把 Command 实例作为 action 回调的最后一个参数，
 * 这里依赖这个稳定行为来找到 command，再用 optsWithGlobals() 拿到包含全局 --json 在内的选项。
 *
 * @param {(...args: any[]) => { action: string, params?: any, humanFormatter?: (result: any) => (string | undefined) }} plan
 */
function handler(plan) {
  return async (...args) => {
    const command = args[args.length - 1];
    const opts = command.optsWithGlobals();

    try {
      const { action, params, humanFormatter } = plan(...args, opts);
      const result = await invoke(action, params);
      printResult(result, { json: opts.json, humanFormatter });
    } catch (error) {
      printError(error, { json: opts.json });
    }
  };
}

module.exports = { handler };
