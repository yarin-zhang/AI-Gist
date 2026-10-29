/**
 * 云存储配置文件（~/.ai-gist/cloud-config.json）里的 WebDAV 密码加密保存 (#491)。
 *
 * 系统提供加密时（macOS 钥匙串、Windows DPAPI、Linux 的 libsecret / KWallet），文件里只存
 * Electron safeStorage 加密后的 base64（passwordEncrypted），不再存明文 password；
 * 读取时在主进程解密，内存里和 IPC 返回给渲染进程的配置仍然带着 password，形状不变。
 * 系统不提供加密时退回明文保存并记录原因，同步照常进行。
 */

import { safeStorage } from 'electron';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';

export const ENCRYPTED_PASSWORD_FIELD = 'passwordEncrypted';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?: () => string;
}

export interface DecodedStorageConfigs {
  configs: CloudStorageConfig[];
  /** 文件里还有明文密码（旧版本写的，或当时加密不可用），加密可用时应当重写一遍 */
  hasPlaintextPasswords: boolean;
  /**
   * 解不开的加密密码，按配置 id 原样保留。钥匙串暂时不可用或换了密钥时，配置先以空密码加载，
   * 保存其他配置时把原来的密文写回去，钥匙串恢复后还能解开，不会因为一次读取失败把密码丢掉。
   */
  undecryptablePasswords: Map<string, string>;
}

type Logger = (message: string) => void;

const reportedWarnings = new Set<string>();

/** 同一个原因只记一次，配置每次读写都会走到这里 */
const warnOnce: Logger = message => {
  if (reportedWarnings.has(message)) return;
  reportedWarnings.add(message);
  console.warn(`[cloud-config] ${message}`);
};

/** 测试用：清掉已经记过的警告 */
export function resetStorageConfigSecretWarnings(): void {
  reportedWarnings.clear();
}

/**
 * electron 模块里的 safeStorage。单元测试 mock 的 electron 模块可能没有这个导出，
 * 访问时会抛错，这里当作不可用处理。
 */
export function resolveSafeStorage(): SafeStorageLike | null {
  try {
    const store = safeStorage as unknown as SafeStorageLike | undefined;
    return store && typeof store.isEncryptionAvailable === 'function' ? store : null;
  } catch {
    return null;
  }
}

function isDecryptionAvailable(store: SafeStorageLike | null): store is SafeStorageLike {
  if (!store) return false;
  try {
    return store.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * 不能用系统加密保存密码的原因；能加密时返回 null。
 * Linux 没有可用的密钥环时 safeStorage 退回 basic_text（固定密钥，等同明文），
 * 而且以后装上密钥环会换密钥、解不开旧密文，所以这种情况也按不可用处理。
 */
export function getPasswordEncryptionUnavailableReason(
  store: SafeStorageLike | null,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (!store) return 'Electron safeStorage 不可用';
  let available = false;
  try {
    available = store.isEncryptionAvailable();
  } catch (error) {
    return `检查系统加密是否可用时出错：${error instanceof Error ? error.message : String(error)}`;
  }
  if (!available) return '系统钥匙串 / 密钥环不可用';

  if (platform === 'linux' && typeof store.getSelectedStorageBackend === 'function') {
    let backend = 'unknown';
    try {
      backend = store.getSelectedStorageBackend();
    } catch {
      backend = 'unknown';
    }
    if (backend === 'basic_text' || backend === 'unknown') {
      return `Linux 没有可用的系统密钥环（safeStorage 后端：${backend}）`;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 把配置文件里读到的内容还原成内存里的配置：解密 passwordEncrypted，去掉这个字段，
 * 内存里只有 password。
 */
export function decodeStoredStorageConfigs(
  raw: unknown,
  store: SafeStorageLike | null = resolveSafeStorage(),
  logger: Logger = warnOnce
): DecodedStorageConfigs {
  if (!Array.isArray(raw)) {
    throw new Error('云存储配置文件格式无效');
  }

  const canDecrypt = isDecryptionAvailable(store);
  const undecryptablePasswords = new Map<string, string>();
  let hasPlaintextPasswords = false;

  const configs = raw.filter(isRecord).map(record => {
    const { [ENCRYPTED_PASSWORD_FIELD]: encrypted, ...rest } = record;
    if (typeof encrypted === 'string' && encrypted) {
      const id = typeof rest.id === 'string' ? rest.id : '';
      if (!canDecrypt || !store) {
        logger('配置文件里的 WebDAV 密码是加密保存的，但系统钥匙串当前不可用，暂时无法读取密码');
        if (id) undecryptablePasswords.set(id, encrypted);
        return { ...rest, password: '' } as unknown as CloudStorageConfig;
      }
      try {
        const password = store.decryptString(Buffer.from(encrypted, 'base64'));
        return { ...rest, password } as unknown as CloudStorageConfig;
      } catch (error) {
        logger(`WebDAV 密码解密失败，需要重新填写密码：${error instanceof Error ? error.message : String(error)}`);
        if (id) undecryptablePasswords.set(id, encrypted);
        return { ...rest, password: '' } as unknown as CloudStorageConfig;
      }
    }

    if (typeof rest.password === 'string' && rest.password) {
      hasPlaintextPasswords = true;
    }
    return rest as unknown as CloudStorageConfig;
  });

  return { configs, hasPlaintextPasswords, undecryptablePasswords };
}

/** 记录 WebDAV 密码只能明文保存的原因（同一原因只记一次） */
export function reportPlaintextPasswordFallback(reason: string, logger: Logger = warnOnce): void {
  logger(`WebDAV 密码以明文保存在配置文件中：${reason}`);
}

/**
 * 把内存里的配置转换成写进配置文件的内容：能加密时 password 换成 passwordEncrypted，
 * 不能加密时保留明文并记录原因。
 */
export function encodeStorageConfigsForDisk(
  configs: CloudStorageConfig[],
  store: SafeStorageLike | null = resolveSafeStorage(),
  undecryptablePasswords: ReadonlyMap<string, string> = new Map(),
  logger: Logger = warnOnce
): Record<string, unknown>[] {
  const unavailableReason = getPasswordEncryptionUnavailableReason(store);

  return configs.map(config => {
    const { [ENCRYPTED_PASSWORD_FIELD]: _staleEncrypted, ...record } = config as unknown as Record<string, unknown>;
    if (!('password' in record)) return record;

    const { password, ...withoutPassword } = record;
    if (typeof password !== 'string' || !password) {
      // 密码读不出来时内存里是空的：把原来的密文写回去，而不是用空密码覆盖
      const preserved = typeof record.id === 'string' ? undecryptablePasswords.get(record.id) : undefined;
      return preserved ? { ...withoutPassword, [ENCRYPTED_PASSWORD_FIELD]: preserved } : record;
    }

    if (unavailableReason || !store) {
      reportPlaintextPasswordFallback(unavailableReason || 'Electron safeStorage 不可用', logger);
      return record;
    }

    try {
      const encrypted = store.encryptString(password).toString('base64');
      return { ...withoutPassword, [ENCRYPTED_PASSWORD_FIELD]: encrypted };
    } catch (error) {
      logger(`WebDAV 密码加密失败，以明文保存：${error instanceof Error ? error.message : String(error)}`);
      return record;
    }
  });
}
