import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const require = createRequire(import.meta.url);

interface IcoEntry {
  width: number;
  height: number;
  colorCount: number;
  planes: number;
  bitsPerPixel: number;
  size: number;
  offset: number;
}

function readIcoEntries(icon: Buffer): IcoEntry[] {
  expect(icon.readUInt16LE(0)).toBe(0);
  expect(icon.readUInt16LE(2)).toBe(1);
  const count = icon.readUInt16LE(4);
  expect(count).toBeGreaterThan(0);

  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const width = icon.readUInt8(offset) || 256;
    const height = icon.readUInt8(offset + 1) || 256;
    return {
      width,
      height,
      colorCount: icon.readUInt8(offset + 2),
      planes: icon.readUInt16LE(offset + 4),
      bitsPerPixel: icon.readUInt16LE(offset + 6),
      size: icon.readUInt32LE(offset + 8),
      offset: icon.readUInt32LE(offset + 12)
    };
  });
}

function decodeRgbaPng(png: Buffer): { width: number; height: number; pixels: Buffer } {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.subarray(0, 8)).toEqual(pngSignature);

  let cursor = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const imageData: Buffer[] = [];
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.toString('ascii', cursor + 4, cursor + 8);
    const data = png.subarray(cursor + 8, cursor + 8 + length);
    cursor += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlaceMethod = data.readUInt8(12);
    } else if (type === 'IDAT') {
      imageData.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  expect({ bitDepth, colorType, interlaceMethod }).toEqual({
    bitDepth: 8,
    colorType: 6,
    interlaceMethod: 0
  });
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);

  const rowLength = width * 4;
  const decoded = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(height * rowLength);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = decoded[sourceOffset++];
    const rowStart = y * rowLength;
    const previousRowStart = (y - 1) * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = decoded[sourceOffset++];
      const left = x >= 4 ? pixels[rowStart + x - 4] : 0;
      const above = y > 0 ? pixels[previousRowStart + x] : 0;
      const aboveLeft = y > 0 && x >= 4 ? pixels[previousRowStart + x - 4] : 0;
      let value: number;
      if (filter === 0) {
        value = raw;
      } else if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + above;
      } else if (filter === 3) {
        value = raw + Math.floor((left + above) / 2);
      } else if (filter === 4) {
        const prediction = left + above - aboveLeft;
        const pa = Math.abs(prediction - left);
        const pb = Math.abs(prediction - above);
        const pc = Math.abs(prediction - aboveLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? above : aboveLeft);
      } else {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
      pixels[rowStart + x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

function alphaBounds(image: { width: number; height: number; pixels: Buffer }, threshold: number) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

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
    const resolvedMasConfig = require(resolve(root, 'config/electron-builder.mas.js')) as {
      mas?: { extendInfo?: { ITSAppUsesNonExemptEncryption?: boolean } };
    };

    expect(packageJson.scripts['build:store:mac']).toContain('--config config/electron-builder.mas.js --mac --universal');
    const masConfig = readFileSync(resolve(root, 'config/electron-builder.mas.js'), 'utf8');
    expect(masConfig).toContain('identity: null');
    expect(masConfig).toContain("identity: 'YANLIN ZHANG (9T93J5B7N6)'");
    expect(masConfig).toContain('...baseConfig.mas');
    expect(builderConfig.mas).toMatchObject({
      appId: 'com.getaigist.app',
      target: 'mas',
      // MAS 构建必须关闭 hardened runtime：Electron 的 V8 需要 JIT 内存，
      // 开启后上架版本会启动即崩溃（见 config/electron-builder.mas.js 的注释）。
      // App Store 要求的是 App Sandbox，不是 hardened runtime。
      hardenedRuntime: false,
      mergeASARs: false,
      extendInfo: {
        // App Store Connect 可从 MAS 目标生成的 Info.plist 自动读取出口合规豁免。
        ITSAppUsesNonExemptEncryption: false
      },
      entitlements: 'resources/entitlements.mas.plist',
      entitlementsInherit: 'resources/entitlements.mas.inherit.plist'
    });
    // 普通 macOS 包沿用 mac 目标，不应带入 MAS 专属的出口合规声明。
    expect(builderConfig.mac).not.toHaveProperty('extendInfo.ITSAppUsesNonExemptEncryption');
    expect(resolvedMasConfig.mas?.extendInfo).toMatchObject({
      ITSAppUsesNonExemptEncryption: false
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

  it('ships a full-bleed multi-size Windows ICO for shell and installer icons', () => {
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'config/electron-builder.json'), 'utf8'));
    const iconPath = resolve(root, builderConfig.win.icon);
    const icon = readFileSync(iconPath);
    const entries = readIcoEntries(icon);
    const expectedSizes = [16, 24, 32, 48, 64, 72, 80, 96, 128, 256];

    expect(builderConfig.win.icon).toBe('src/assets/windows.ico');
    expect(builderConfig.nsis.installerIcon).toBe('src/assets/windows.ico');
    expect(builderConfig.nsis.uninstallerIcon).toBe('src/assets/windows.ico');
    expect(entries.map(entry => entry.width)).toEqual(expectedSizes);
    expect(entries.every(entry => (
      entry.width === entry.height
      // PNG-backed ICO entries conventionally use 0 planes; legacy DIB
      // entries use 1. Both are valid as long as the 32bpp payload is intact.
      && entry.planes <= 1
      && entry.bitsPerPixel === 32
      && entry.offset + entry.size <= icon.length
    ))).toBe(true);

    const largest = entries.find(entry => entry.width === 256);
    expect(largest).toBeDefined();
    const largestPng = icon.subarray(largest!.offset, largest!.offset + largest!.size);
    const decoded = decodeRgbaPng(largestPng);
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 256, height: 256 });

    // Windows shell tiles scale the selected image to a small slot. Keep the
    // rounded-square artwork within a small transparent edge so it does not
    // render as a tiny 16px mark inside the tile.
    const bounds = alphaBounds(decoded, 128);
    expect(bounds.maxX - bounds.minX + 1).toBeGreaterThanOrEqual(240);
    expect(bounds.maxY - bounds.minY + 1).toBeGreaterThanOrEqual(240);
  });

  it('keeps release builds working before signing credentials are provisioned', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/build-release.yml'), 'utf8');

    expect(workflow).toContain("if: steps.mac-signing.outputs.available != 'true'");
    expect(workflow).toContain("if: steps.signpath.outputs.available == 'true'");
    expect(workflow).toContain('signpath/github-action-submit-signing-request@v2');
    expect(workflow).toContain('publishing an unsigned compatibility build');
  });
});
