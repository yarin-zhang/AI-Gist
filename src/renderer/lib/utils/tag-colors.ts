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

export function getCategoryTagColor(
  category: Pick<Category, 'color'> | null | undefined,
  textColor = 'var(--content-primary)',
): TagColorConfig | Record<string, never> {
  if (!category) return {};
  const color = category.color || '#18a058';
  return { color, textColor, borderColor: color };
}
