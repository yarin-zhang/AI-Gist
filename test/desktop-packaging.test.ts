import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('desktop packaging', () => {
  it('copies renderer resources required by the compiled main process into the packaged app', () => {
    const buildScript = readFileSync(resolve(root, 'scripts/build.js'), 'utf8');
    const builderConfig = JSON.parse(readFileSync(resolve(root, 'electron-builder.json'), 'utf8'));
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
  });
});
