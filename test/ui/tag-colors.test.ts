import { describe, expect, it } from 'vitest';
import {
  COLOR_SWATCHES,
  getCategoryTagColor,
  getTagColor,
  getTagsArray,
} from '../../src/renderer/lib/utils/tag-colors';

describe('shared tag color utilities', () => {
  it('assigns stable colors from the shared swatches', () => {
    const first = getTagColor('Midjourney');
    const second = getTagColor('Midjourney');

    expect(second).toEqual(first);
    expect(COLOR_SWATCHES).toContain(first.color);
    expect(first.borderColor).toMatch(/^#[0-9A-F]{8}$/i);
  });

  it('normalizes string and array tag values', () => {
    expect(getTagsArray(' design, AI ,, prompt ')).toEqual(['design', 'AI', 'prompt']);
    expect(getTagsArray('周报')).toEqual(['周报']);
    expect(getTagsArray([' design ', '', 'AI'])).toEqual(['design', 'AI']);
  });

  it('preserves the configured category color', () => {
    expect(getCategoryTagColor({ color: '#123456' })).toMatchObject({
      color: '#123456',
      borderColor: '#123456',
    });
  });
});
