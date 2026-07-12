import type {
  CloudStorageConfig,
  ICloudConfig,
  WebDAVConfig,
} from '@shared/types/cloud-backup';

export interface CloudStorageConfigDraft {
  id?: string;
  name: string;
  type: 'webdav' | 'icloud';
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  path?: string;
}

/**
 * Produces the exact configuration shape used by every storage connection test.
 * This prevents list tests and form tests from differing because of whitespace
 * or hidden advanced fields such as the WebDAV request timeout.
 */
export function normalizeCloudStorageConfigForConnectionTest(
  config: CloudStorageConfig,
): CloudStorageConfig {
  const common = {
    id: config.id,
    name: config.name.trim(),
    type: config.type,
    enabled: config.enabled,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };

  if (config.type === 'webdav') {
    const webdav = config as WebDAVConfig;
    return {
      ...common,
      type: 'webdav',
      url: webdav.url.trim(),
      username: webdav.username.trim(),
      password: webdav.password,
      ...(webdav.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: webdav.requestTimeoutMs }),
    } as WebDAVConfig;
  }

  const icloud = config as ICloudConfig;
  return {
    ...common,
    type: 'icloud',
    path: icloud.path.trim(),
  } as ICloudConfig;
}

export function createCloudStorageConfigForConnectionTest(
  draft: CloudStorageConfigDraft,
  existing?: CloudStorageConfig,
  now = new Date().toISOString(),
): CloudStorageConfig {
  const rawConfig = {
    ...(existing || {}),
    id: draft.id || existing?.id || 'draft',
    name: draft.name,
    type: draft.type,
    enabled: draft.enabled,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(draft.type === 'webdav'
      ? {
          url: draft.url || '',
          username: draft.username || '',
          password: draft.password || '',
        }
      : { path: draft.path || '' }),
  } as CloudStorageConfig;

  return normalizeCloudStorageConfigForConnectionTest(rawConfig);
}
