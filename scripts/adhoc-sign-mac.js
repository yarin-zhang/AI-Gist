/**
 * electron-builder afterSign 钩子：为 macOS 未签名兼容构建做 ad-hoc 签名。
 *
 * 仅在 CI 的 unsigned fallback 路径中通过
 * `--config.afterSign=scripts/adhoc-sign-mac.js` 启用（正式签名路径不加载本脚本）。
 *
 * 背景：CSC_IDENTITY_AUTO_DISCOVERY=false 时 electron-builder 会完全跳过签名，
 * 而 asar 打包会破坏 Electron 预置二进制的链接器签名封条（seal）。在 Apple
 * Silicon (arm64) 上，签名封条无效的二进制会被系统直接拒绝运行（Killed: 9），
 * 用户连 `xattr -cr` 绕过 Gatekeeper 的机会都没有。这里补一个 ad-hoc 签名，
 * 保证兼容包在移除 quarantine 属性后至少可以启动。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function adhocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  if (!fs.existsSync(appPath)) {
    throw new Error(`[adhoc-sign-mac] app not found: ${appPath}`);
  }

  console.log(`[adhoc-sign-mac] ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  });
  console.log('[adhoc-sign-mac] done');
};
