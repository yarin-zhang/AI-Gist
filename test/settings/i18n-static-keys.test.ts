import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererRoot = resolve(process.cwd(), 'src/renderer');
const localeNames = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'] as const;
const sourceExtensions = new Set(['.vue', '.ts', '.tsx', '.js']);

const collectSourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });

const getMessage = (messages: Record<string, unknown>, key: string): unknown => key
  .split('.')
  .reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || !(segment in value)) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, messages);

const collectStaticTranslationKeys = (): Set<string> => {
  const keys = new Set<string>();
  const translationCall = /(?<![\w$])(?:\$t|t|i18n\.t)\(\s*(['"`])([^'"`$\n]+)\1/g;

  for (const file of collectSourceFiles(rendererRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(translationCall)) {
      const key = match[2];
      if (key.includes('.')) keys.add(key);
    }
  }

  return keys;
};

describe('renderer static translations', () => {
  it('defines every statically referenced dotted translation key in all locales', () => {
    const keys = collectStaticTranslationKeys();
    expect(keys.size).toBeGreaterThan(800);

    for (const locale of localeNames) {
      const messages = JSON.parse(readFileSync(
        resolve(process.cwd(), `src/renderer/i18n/locales/${locale}.json`),
        'utf8',
      ));
      const missing = [...keys].filter(key => getMessage(messages, key) === undefined);
      expect(missing, `${locale} is missing translations`).toEqual([]);
    }
  });
});
