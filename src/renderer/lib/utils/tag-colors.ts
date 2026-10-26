import type { Category } from '@shared/types';

export interface TagColorConfig {
  color: string;
  textColor: string;
  borderColor: string;
}

export const COLOR_SWATCHES = [
  '#EF444433',
  '#F9731633',
  '#F59E0B33',
  '#EAB30833',
  '#FDE04733',
  '#A3E63533',
  '#22C55E33',
  '#10B98133',
  '#06B6D433',
  '#0EA5E933',
  '#3B82F633',
  '#6366F133',
  '#8B5CF633',
  '#A855F733',
  '#EC489933',
  '#94A3B833',
] as const;

export function hashTagText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash &= hash;
  }
  return Math.abs(hash);
}

export function getTagColor(tag: string, textColor = 'var(--content-primary)'): TagColorConfig {
  const backgroundColor = COLOR_SWATCHES[hashTagText(tag) % COLOR_SWATCHES.length];
  return {
    color: backgroundColor,
    textColor,
    borderColor: `${backgroundColor.slice(0, 7)}CC`,
  };
}

export function getTagsArray(tags: string | string[] | null | undefined): string[] {
  if (!tags) return [];
  const values = typeof tags === 'string' ? tags.split(',') : tags;
  return values.map(tag => tag.trim()).filter(Boolean);
}

const DEFAULT_CATEGORY_COLOR = '#18a058';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * 分类颜色是用户挑选的色相，可能是不透明的 #RRGGBB，也可能是带透明度的色板值。
 * chip 不能把它当实底：主题正文色压在饱和实底上，浅色主题下对比度不足（#387）。
 * 这里与普通标签保持同一套做法：色相的 20% 浅底 + 80% 描边，正文色交给主题。
 */
export function getCategoryTagColor(
  category: Pick<Category, 'color'> | null | undefined,
  textColor = 'var(--content-primary)',
): TagColorConfig | Record<string, never> {
  if (!category) return {};
  const color = (category.color || DEFAULT_CATEGORY_COLOR).trim();
  const match = HEX_COLOR_PATTERN.exec(color);

  if (!match) {
    return {
      color: `color-mix(in srgb, ${color} 20%, transparent)`,
      textColor,
      borderColor: `color-mix(in srgb, ${color} 80%, transparent)`,
    };
  }

  const digits = match[1].length === 3
    ? match[1].split('').map(digit => digit + digit).join('')
    : match[1].slice(0, 6);
  const hue = `#${digits.toUpperCase()}`;
  return { color: `${hue}33`, textColor, borderColor: `${hue}CC` };
}
