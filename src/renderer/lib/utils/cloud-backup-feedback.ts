import i18n from '../../i18n';
import { getCloudStorageConnectionDiagnosis } from '../services/cloud-sync.service';
import { joinSentences } from './join-sentences';

const tr = (key: string, named?: Record<string, unknown>) =>
  (i18n.global.t as (key: string, named?: Record<string, unknown>) => string)(key, named ?? {});

export interface CloudBackupFailureOptions {
  /** 失败发生在本机读写数据时（结果里的 localFailure）：这时不做连接方面的判断 */
  localFailure?: boolean;
  /** 不是连接问题时显示的话，默认就是 action 本身 */
  otherwise?: string;
  /** 连接问题除了原因，再带上怎么处理（桌面端 toast 停留时间够长，移动端只放原因） */
  detailed?: boolean;
}

/**
 * 云端备份的创建、恢复、删除没做成时给用户看的一句话。
 *
 * 连不上存储（密码不对、找不到服务器、地址里的路径不对……）是用户自己能处理的：
 * 在「哪件事没做成」后面说出原因。其余原因（本机数据读写失败、备份文件损坏、内部状态不对……）
 * 用户处理不了，只显示 action / otherwise，原始错误由调用方写进日志，不出现在界面上。
 */
export function describeCloudBackupFailure(
  action: string,
  reason: unknown,
  options: CloudBackupFailureOptions = {}
): string {
  const otherwise = options.otherwise ?? action;
  if (options.localFailure) return otherwise;

  const raw = reason instanceof Error ? reason.message : String(reason ?? '').trim();
  if (!raw) return otherwise;

  const diagnosis = getCloudStorageConnectionDiagnosis(raw);
  // 归不到任何一类连接问题时，诊断会给出通用的「连接测试失败」，那不是这次失败的原因
  if (diagnosis.title === tr('dataSync.connectionDiagnosis.generic.title')) return otherwise;

  const locale = String(i18n.global.locale.value || 'zh-CN');
  const why = options.detailed ? joinSentences(diagnosis.title, diagnosis.message, locale) : diagnosis.title;
  return tr('mobileSettings.failedWith', { context: action, reason: why });
}
