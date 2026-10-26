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

  // 回归测试：Gitea issue #387，浅色主题下分类 chip 是深绿实底配深色字。
  it('renders category colors as a tinted chip instead of a solid fill', () => {
    expect(getCategoryTagColor({ color: '#123456' })).toEqual({
      color: '#12345633',
      textColor: 'var(--content-primary)',
      borderColor: '#123456CC',
    });
    expect(getCategoryTagColor({ color: '' })).toMatchObject({
      color: '#18A05833',
      borderColor: '#18A058CC',
    });
    expect(getCategoryTagColor({ color: '#f0a' })).toMatchObject({ color: '#FF00AA33' });
  });

  it('keeps swatch categories identical to tags with the same swatch', () => {
    const swatch = COLOR_SWATCHES[6];
    const category = getCategoryTagColor({ color: swatch }, 'rgb(31, 35, 40)');

    expect(category).toMatchObject({ color: swatch, borderColor: `${swatch.slice(0, 7)}CC`, textColor: 'rgb(31, 35, 40)' });
  });

  it('meets WCAG AA text contrast on the default category chip in both themes', () => {
    const channel = (value: number) => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const contrast = (a: number[], b: number[]) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    const blend = (hex: string, surface: number[]) => {
      const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
      const alpha = parseInt(hex.slice(7, 9), 16) / 255;
      return rgb.map((value, index) => value * alpha + surface[index] * (1 - alpha));
    };
    const { color } = getCategoryTagColor({ color: '' }) as { color: string };

    // 浅色：卡片 surface-primary + content-primary；深色同理
    expect(contrast(blend(color, [255, 255, 255]), [31, 35, 40])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(blend(color, [23, 26, 32]), [239, 239, 241])).toBeGreaterThanOrEqual(4.5);
  });
});
