import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const component = readFileSync(resolve(root, 'src/renderer/components/settings/DataManagementSettings.vue'), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'];
const requiredKeys = [
  'advancedDangerZone',
  'clearDatabaseImpactLocal',
  'clearDatabaseImpactCloud',
  'clearDatabaseImpactSync',
  'clearDatabaseConfirmationHint',
  'clearDatabaseConfirmationPlaceholder',
];

describe('Issue #192 database action hierarchy', () => {
  it('keeps destructive clearing inside an explicit danger zone with typed confirmation', () => {
    expect(component).toContain('<NCollapseItem :title="t(\'dataManagement.advancedDangerZone\')"');
    expect(component).toContain('clearDatabaseImpactLocal');
    expect(component).toContain('clearDatabaseImpactCloud');
    expect(component).toContain('clearDatabaseImpactSync');
    expect(component).toContain('clearDatabaseConfirmationWord');
    expect(component).toContain('v-model:value="clearConfirmWord"');
    expect(component).toContain(':positive-button-props="{ disabled: clearConfirmWord !== clearDatabaseConfirmationWord }"');
    expect(component).toContain('if (clearConfirmWord.value !== clearDatabaseConfirmationWord) return;');
    expect(component).not.toContain("v-for=\"item in t('dataManagement.clearDatabaseWarningItems')\"");
  });

  it('provides impact and confirmation copy in every supported locale', () => {
    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(resolve(root, `src/renderer/i18n/locales/${locale}.json`), 'utf8'));
      for (const key of requiredKeys) expect(messages.dataManagement[key], `${locale}.${key}`).toBeTruthy();
    }
  });
});
