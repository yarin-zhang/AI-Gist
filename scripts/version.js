// @ts-nocheck
/**
 * 版本号与构建号的唯一来源。
 *
 * package.json 里只手写两个字段：
 *
 *   version        营销版本号，商店里展示给用户的那个，例如 2.1.1
 *   buildRevision  同一个版本号的第几次构建，从 1 开始
 *
 * 各平台的构建号全部由这两个字段推导，规则固定：
 *
 * ── iOS（CFBundleVersion）
 *   直接就是 buildRevision：2.1.1 (1)、2.1.1 (2)……
 *   iOS 只要求构建号在**同一个营销版本号内**递增，所以版本号一升（2.2.0），
 *   buildRevision 就归 1 重新开始。App Store Connect 显示成 "2.1.1 (1)"。
 *
 * ── Mac App Store（CFBundleVersion）
 *   用和 Android versionCode 相同的编码：2.1.1 (1) → 2010101。
 *   macOS 这条线和 iOS 不一样：App Store Connect 对 Mac 构建的 CFBundleVersion
 *   是**全局**比较的，跟营销版本号无关，只跟"这个 app 上传过的最大值"比。
 *   2.1.1 用 buildRevision=1 上传时被拒：
 *     "The value for key CFBundleVersion [1] must contain a higher version
 *      than that of the previously uploaded version [150]" (90061)
 *   —— 150 是历史上用 CI run_number 当构建号时留下的高水位。所以 Mac 只能用
 *   把版本号编进去的长整数，保证跨版本永远单调。用户看不到它。
 *
 * ── Android（versionCode）
 *   versionCode = major*1000000 + minor*10000 + patch*100 + buildRevision
 *   例：2.1.1 (1) → 2010101，2.1.2 (1) → 2010201，3.0.0 (1) → 3000001。
 *   Google Play 的 versionCode 是**全局单调**的整数，跟 versionName 无关，
 *   不能随版本号重置，所以只能用这种把版本号编进去的长整数。用户看不到它。
 *   读法是 2.01.01.01。
 *
 * ── 其他平台
 *   桌面端（electron-builder 的 NSIS / DMG / Snap）、Windows Store 的 appx
 *   版本、Web、CLI 都只用营销版本号，不需要额外的构建号。
 *
 * 约束：minor、patch 必须小于 100，buildRevision 必须在 1-99 之间，否则相邻
 * 版本的 versionCode 会撞车 —— 这里直接报错，不会悄悄算出个错的号。
 */
const FileSystem = require('fs');
const Path = require('path');

const PACKAGE_JSON_PATH = Path.join(__dirname, '..', 'package.json');

function readPackageJson() {
    return JSON.parse(FileSystem.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

/**
 * 解析 major.minor.patch，拒绝预发布/构建元数据后缀——各商店的构建号只认数字。
 */
function parseVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
    if (!match) {
        throw new Error(`版本号 "${version}" 不是 major.minor.patch 形式，无法推导构建号。`);
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };
}

function normalizeRevision(revision) {
    const buildRevision = Number(revision);
    if (!Number.isInteger(buildRevision) || buildRevision < 1 || buildRevision > 99) {
        throw new Error(`buildRevision 必须是 1-99 的整数，当前为 "${revision}"。`);
    }
    return buildRevision;
}

/**
 * 把版本号编进一个全局递增的整数。Android 的 versionCode 和 Mac App Store 的
 * CFBundleVersion 都用它 —— 两边的要求是同一个：跨营销版本号全局单调。
 */
function computeVersionCode(version, revision) {
    const { major, minor, patch } = parseVersion(version);
    const buildRevision = normalizeRevision(revision);

    for (const [name, value] of [['minor', minor], ['patch', patch]]) {
        if (value > 99) {
            throw new Error(`版本号的 ${name} 段必须小于 100，当前版本 "${version}" 无法推导 versionCode。`);
        }
    }

    return major * 1000000 + minor * 10000 + patch * 100 + buildRevision;
}

/**
 * 读取 package.json，返回所有平台共用的版本信息。
 */
function getVersionInfo() {
    const packageJson = readPackageJson();
    const version = packageJson.version;
    const buildRevision = normalizeRevision(packageJson.buildRevision ?? 1);

    const versionCode = computeVersionCode(version, buildRevision);

    return {
        version,
        buildRevision,
        // iOS 的 CFBundleVersion，每个版本号从 1 开始
        buildNumber: buildRevision,
        // Mac App Store 的 CFBundleVersion，必须跨版本号全局单调
        macBuildNumber: versionCode,
        // Android 的 versionCode，全局递增
        versionCode
    };
}

module.exports = { getVersionInfo, computeVersionCode, parseVersion };

if (require.main === module) {
    const info = getVersionInfo();
    const [field] = process.argv.slice(2);

    if (!field || field === '--json') {
        console.log(JSON.stringify(info, null, 2));
    } else if (field === '--version') {
        console.log(info.version);
    } else if (field === '--build') {
        console.log(info.buildNumber);
    } else if (field === '--mac-build') {
        console.log(info.macBuildNumber);
    } else if (field === '--version-code') {
        console.log(info.versionCode);
    } else {
        console.error('用法：node scripts/version.js [--json | --version | --build | --mac-build | --version-code]');
        process.exit(1);
    }
}
