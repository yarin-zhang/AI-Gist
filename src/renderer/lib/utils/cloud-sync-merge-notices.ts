/**
 * 同步合并时要告诉用户的话 (#490)：第一次加入同步前的数量说明，以及同名分类合并后保留了哪一边。
 * 桌面和移动端共用，文案都在语言包 dataSync.joinConfirm / dataSync.categoryMerged 下。
 */
import type { CloudSyncCategoryMergeNotice } from '@shared/cloud-sync-contract';
import type { CloudSyncJoinPreview } from '@shared/cloud-sync-join-preview';
import i18n from '../../i18n';
import {
  getCloudSyncRestoredMessage,
  getCloudSyncSafetyBackupMessage,
  getCloudSyncUncategorizedMessage,
  type CloudSyncResult
} from '../services/cloud-sync.service';

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string;

const t: Translate = (key, named, plural) => plural === undefined
  ? (i18n.global.t as (key: string, named: Record<string, unknown>) => string)(key, named ?? {})
  : (i18n.global.t as (key: string, named: Record<string, unknown>, plural: number) => string)(key, named ?? {}, plural);

const currentLocale = () => String(i18n.global.locale.value || 'zh-CN');

/** 按界面语言连接几项（「说明和颜色」「description and color」） */
export const formatList = (items: string[], locale = currentLocale()): string => {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
};

/** 只列出一部分、后面还要接「等 N 个」时，用不带「和」的分隔符（「、」或「, 」） */
const joinPartialList = (items: string[], locale = currentLocale()): string => {
  let separator = ', ';
  try {
    const literal = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
      .formatToParts(['a', 'b', 'c'])
      .find(part => part.type === 'literal');
    if (literal) separator = literal.value;
  } catch {
    // 不支持 Intl.ListFormat 时用逗号
  }
  return items.join(separator);
};

/** 用户能看到的分类字段；排序、启用状态这类内部字段不一样时不提示 */
const CATEGORY_FIELD_ORDER = ['description', 'color', 'icon', 'parentUuid'] as const;

/** 一次同步最多逐条列出几个分类，再多就合成一句 */
const MAX_CATEGORY_NOTICES = 3;

/** 同步结果里同名分类合并的说明，每条一句；没有要说的返回空数组 */
export function getCloudSyncCategoryMergeMessages(result: { categoryMerges?: CloudSyncCategoryMergeNotice[] } | undefined): string[] {
  const notices = (result?.categoryMerges || [])
    .map(notice => ({
      ...notice,
      fields: CATEGORY_FIELD_ORDER.filter(field => notice.differingFields.includes(field))
    }))
    .filter(notice => notice.fields.length > 0);

  const shown = notices.length > MAX_CATEGORY_NOTICES ? notices.slice(0, MAX_CATEGORY_NOTICES - 1) : notices;
  const messages = shown.map(notice => t('dataSync.categoryMerged', {
    name: notice.name,
    fields: formatList(notice.fields.map(field => t(`dataSync.categoryFields.${field}`))),
    side: t(`dataSync.mergeSide.${notice.keptSide}`)
  }));
  const rest = notices.length - shown.length;
  if (rest > 0) messages.push(t('dataSync.categoryMergedMore', { count: rest }, rest));
  return messages;
}

/**
 * 同步后哪些具体的提示词变了（本机删掉的被恢复、分类被删后移到「未分类」）：
 * 同步状态卡片上一直显示到下一次同步
 */
export function getCloudSyncRecordChangeMessages(result: CloudSyncResult | undefined): string[] {
  if (!result?.success) return [];
  return [
    getCloudSyncRestoredMessage(result.restoredAfterLocalDelete),
    getCloudSyncUncategorizedMessage(result.uncategorizedPrompts)
  ].filter(Boolean);
}

/**
 * 一次成功同步后要提醒用户的全部内容。只放用户看了能自己处理的事：哪些提示词恢复了或换到了「未分类」、
 * 同名分类保留了哪一边、覆盖云端前的数据备份在哪里。同一条记录的重复副本归并、基线保存失败这类
 * 用户处理不了的情况由应用自己处理，只写日志（CloudSyncResult.warnings），不出现在这里。
 */
export function getCloudSyncResultNotices(result: CloudSyncResult | undefined): string[] {
  if (!result?.success) return [];
  return [
    ...getCloudSyncRecordChangeMessages(result),
    ...getCloudSyncCategoryMergeMessages(result),
    getCloudSyncSafetyBackupMessage(result)
  ].filter(Boolean);
}

/** 确认框里「同名分类会合并为一个：「写作」和「生活」」这一句；没有同名分类时返回空字符串 */
export function getCloudSyncJoinCategoryLine(preview: CloudSyncJoinPreview, maxNames = 5): string {
  const names = preview.sameNameCategories;
  if (names.length === 0) return '';
  const quoted = names.slice(0, maxNames).map(name => t('dataSync.joinConfirm.quotedName', { name }));
  return names.length > maxNames
    ? t('dataSync.joinConfirm.sameNameCategoriesMore', { names: joinPartialList(quoted), count: names.length })
    : t('dataSync.joinConfirm.sameNameCategories', { names: formatList(quoted) });
}

/** 确认框里的数量对照：提示词、分类各一行 */
export function getCloudSyncJoinRows(preview: CloudSyncJoinPreview) {
  return [
    { key: 'prompts' as const, label: t('dataSync.joinConfirm.prompts') },
    { key: 'categories' as const, label: t('dataSync.joinConfirm.categories') }
  ].map(row => ({
    ...row,
    local: preview.local[row.key],
    remote: preview.remote[row.key],
    merged: preview.merged[row.key]
  }));
}

/** 移动端确认框没有表格，用纯文本逐行说明 */
export function getCloudSyncJoinMessageLines(preview: CloudSyncJoinPreview): string[] {
  return [
    t('dataSync.joinConfirm.description'),
    '',
    ...getCloudSyncJoinRows(preview).map(row => t('dataSync.joinConfirm.row', row)),
    getCloudSyncJoinCategoryLine(preview),
    '',
    t('dataSync.joinConfirm.cancelHint')
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''));
}
