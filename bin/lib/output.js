'use strict';

const chalk = require('chalk');

/**
 * 打印结果。有 --json 时输出机器可读 JSON；否则调用 humanFormatter(result) 打印给人看，
 * 不提供 humanFormatter 时退化为打印精简 JSON。
 */
function printResult(result, { json, humanFormatter } = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (typeof humanFormatter === 'function') {
    const text = humanFormatter(result);
    if (text !== undefined) {
      process.stdout.write(`${text}\n`);
    }
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

/**
 * 统一的错误输出：--json 时输出 { error } 结构，否则输出带颜色的一行提示。
 * 总是把 process.exitCode 设为非 0，调用方不需要自己再 exit。
 */
function printError(error, { json } = {}) {
  const message = (error && error.message) || String(error);
  const code = error && error.code;

  if (json) {
    process.stderr.write(`${JSON.stringify({ error: { message, code } }, null, 2)}\n`);
  } else {
    process.stderr.write(`${chalk.red('Error:')} ${message}\n`);
  }
  process.exitCode = 1;
}

/**
 * 简单的等宽列表格化（没有引入额外的表格依赖，够用即可）
 */
function formatTable(rows, columns) {
  const widths = columns.map(col =>
    Math.max(col.label.length, ...rows.map(row => String(col.value(row) ?? '').length))
  );

  const renderRow = cells => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ');

  const header = renderRow(columns.map(col => col.label));
  const separator = widths.map(width => '-'.repeat(width)).join('  ');
  const body = rows.map(row => renderRow(columns.map(col => col.value(row) ?? '')));

  return [chalk.bold(header), separator, ...body].join('\n');
}

module.exports = { printResult, printError, formatTable };
