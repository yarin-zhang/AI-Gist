import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('desktop packaging', () => {
  it('copies renderer resources required by the compiled main process into the packaged app', () => {
    const buildScript = readFileSync(resolve(root, 'scripts/build.js'), 'utf8');
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'config/electron-builder.json'), 'utf8'));
    const rendererFilesEntry = builderConfig.files.find((entry: unknown) => (
      typeof entry === 'object'
      && entry !== null
      && (entry as { from?: string }).from === 'build/renderer'
    ));

    expect(buildScript).toContain("const runtimeResourceFiles = ['design-tokens.json']");
    expect(buildScript).toContain('copyRendererRuntimeResources();');
    expect(rendererFilesEntry).toMatchObject({
      from: 'build/renderer',
      to: './renderer',
      filter: ['**/*']
    });
    expect(builderConfig.files).toContain('!node_modules/@capacitor/android/**');
    expect(builderConfig.files).toContain('!node_modules/@capacitor/ios/**');
    expect(builderConfig.files).toContain('!node_modules/@capacitor/*/android/**');
    expect(builderConfig.files).toContain('!node_modules/@capacitor/*/ios/**');
  });

  it('uses hardened runtime entitlements for notarized macOS releases', () => {
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'config/electron-builder.json'), 'utf8'));
    const entitlementsPath = resolve(root, builderConfig.mac.entitlements);
    const entitlements = readFileSync(entitlementsPath, 'utf8');

    expect(builderConfig.mac).toMatchObject({
      hardenedRuntime: true,
      entitlements: 'resources/entitlements.mac.plist',
      entitlementsInherit: 'resources/entitlements.mac.plist'
    });
    expect(entitlements).toContain('com.apple.security.cs.allow-jit');
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
  });

  it('uses the shared App Store bundle ID and sandbox entitlements for Mac App Store releases', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'config/electron-builder.json'), 'utf8'));
    const entitlements = readFileSync(resolve(root, builderConfig.mas.entitlements), 'utf8');
    const inheritedEntitlements = readFileSync(resolve(root, builderConfig.mas.entitlementsInherit), 'utf8');

    expect(packageJson.scripts['build:store:mac']).toContain('--config config/electron-builder.mas.js --mac --universal');
    const masConfig = readFileSync(resolve(root, 'config/electron-builder.mas.js'), 'utf8');
    expect(masConfig).toContain('identity: null');
    expect(masConfig).toContain("identity: 'YANLIN ZHANG (9T93J5B7N6)'");
    expect(builderConfig.mas).toMatchObject({
      appId: 'com.getaigist.app',
      target: 'mas',
      // MAS 构建必须关闭 hardened runtime：Electron 的 V8 需要 JIT 内存，
      // 开启后上架版本会启动即崩溃（见 config/electron-builder.mas.js 的注释）。
      // App Store 要求的是 App Sandbox，不是 hardened runtime。
      hardenedRuntime: false,
      mergeASARs: false,
      entitlements: 'resources/entitlements.mas.plist',
      entitlementsInherit: 'resources/entitlements.mas.inherit.plist'
    });
    expect(entitlements).toContain('com.apple.security.app-sandbox');
    expect(entitlements).toContain('com.apple.security.files.user-selected.read-write');
    expect(entitlements).toContain('com.apple.security.network.client');
    expect(inheritedEntitlements).toContain('com.apple.security.inherit');
    const workflow = readFileSync(resolve(root, '.github/workflows/build-release.yml'), 'utf8');
    expect(workflow).toContain("github.event.inputs.version == 'mac-store'");
    expect(workflow).toContain('dist/**/AI-Gist-*-Mac-App-Store-*.pkg');
    expect(workflow).toContain('Upload to App Store Connect');
  });

  it('uses the Microsoft Store identity assigned by Partner Center', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'config/electron-builder.json'), 'utf8'));
    const workflow = readFileSync(resolve(root, '.github/workflows/build-release.yml'), 'utf8');

    expect(packageJson.scripts['build:store:win']).toContain('--win appx --x64 --arm64');
    expect(builderConfig.appx).toMatchObject({
      applicationId: 'AIGist',
      identityName: 'YarinZ.AIGist-PromptManager',
      publisher: 'CN=B0E00209-75E9-44EE-B4B3-F71D2E3B4634',
      publisherDisplayName: 'Yarin Z',
      displayName: 'AI Gist'
    });
    expect(workflow).toContain("github.event.inputs.version == 'store'");
    expect(workflow).toContain('dist/AI-Gist-*-Windows-Store-*.appx');
  });

  it('keeps release builds working before signing credentials are provisioned', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/build-release.yml'), 'utf8');

    expect(workflow).toContain("if: steps.mac-signing.outputs.available != 'true'");
    expect(workflow).toContain("if: steps.signpath.outputs.available == 'true'");
    expect(workflow).toContain('signpath/github-action-submit-signing-request@v2');
    expect(workflow).toContain('publishing an unsigned compatibility build');
  });
});
