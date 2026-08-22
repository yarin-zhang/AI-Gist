// @ts-nocheck
/**
 * 把 package.json 的版本号和推导出的构建号（见 scripts/version.js）同步到那些
 * 必须把版本写进文件里的原生工程：
 *
 *   - android/app/build.gradle：versionName / versionCode（全局递增的长整数）
 *   - ios/App/App.xcodeproj/project.pbxproj：MARKETING_VERSION / CURRENT_PROJECT_VERSION
 *     （CURRENT_PROJECT_VERSION 就是 buildRevision，每个版本号从 1 开始）
 *
 * 桌面端（electron-builder）和 Web 端直接读 package.json，不需要同步。
 *
 * 用法：
 *   node scripts/sync-version.js          写入
 *   node scripts/sync-version.js --check  只校验，不一致时退出码非 0（给 CI 用）
 */
const FileSystem = require('fs');
const Path = require('path');
const Chalk = require('chalk');
const { getVersionInfo } = require('./version');

const ROOT = Path.join(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const { version, buildRevision, buildNumber, versionCode } = getVersionInfo();

/** 每条规则把一个正则的捕获组替换成目标值。 */
const TARGETS = [
    {
        file: 'android/app/build.gradle',
        rules: [
            { pattern: /(versionName\s+")[^"]*(")/g, value: version },
            { pattern: /(versionCode\s+)\d+()/g, value: String(versionCode) }
        ]
    },
    {
        file: 'ios/App/App.xcodeproj/project.pbxproj',
        rules: [
            { pattern: /(MARKETING_VERSION = )[^;]*(;)/g, value: version },
            { pattern: /(CURRENT_PROJECT_VERSION = )[^;]*(;)/g, value: String(buildNumber) }
        ]
    }
];

let changed = false;
let mismatched = false;

for (const target of TARGETS) {
    const filePath = Path.join(ROOT, target.file);
    const original = FileSystem.readFileSync(filePath, 'utf8');
    let updated = original;

    for (const rule of target.rules) {
        updated = updated.replace(rule.pattern, (match, prefix, suffix) => `${prefix}${rule.value}${suffix}`);
    }

    if (updated === original) {
        continue;
    }

    if (checkOnly) {
        mismatched = true;
        console.error(Chalk.redBright(`${target.file} 的版本号与 package.json 不一致，请运行 yarn version:sync。`));
        continue;
    }

    FileSystem.writeFileSync(filePath, updated);
    changed = true;
    console.log(Chalk.green(`已更新 ${target.file}`));
}

if (mismatched) {
    process.exit(1);
}

if (checkOnly) {
    console.log(Chalk.green(`版本号一致：${version} (${buildRevision})，Android versionCode ${versionCode}。`));
} else if (!changed) {
    console.log(Chalk.gray(`各平台已是 ${version} (${buildRevision})，无需改动。`));
} else {
    console.log(Chalk.blueBright(`版本号 ${version}，Apple 构建号 ${buildNumber}，Android versionCode ${versionCode}。`));
}
