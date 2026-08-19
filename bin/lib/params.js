'use strict';

const fs = require('fs');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * 解析 --content / --content-file 两种输入方式之一。
 * --content - 表示从标准输入读取（便于 agent 用管道传入多行内容）。
 */
async function resolveContent(content, contentFile) {
  if (contentFile) {
    return fs.readFileSync(contentFile, 'utf8');
  }
  if (content === '-') {
    return readStdin();
  }
  return content;
}

function parseTags(value) {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

/**
 * commander 的可重复 option 需要一个 accumulator 函数
 */
function collect(value, previous) {
  previous.push(value);
  return previous;
}

/**
 * 把一组 "name=value" 字符串解析成对象，用于 `--var name=value` 重复选项
 */
function parseKeyValuePairs(pairs, flagName) {
  const result = {};
  for (const pair of pairs || []) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      throw new Error(`Invalid ${flagName} value "${pair}", expected format name=value`);
    }
    result[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
  }
  return result;
}

function parseOptions(value) {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);
}

module.exports = { resolveContent, parseTags, collect, parseKeyValuePairs, parseOptions };
