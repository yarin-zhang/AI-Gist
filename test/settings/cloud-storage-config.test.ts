import { describe, expect, it } from 'vitest';
import {
  createCloudStorageConfigForConnectionTest,
  normalizeCloudStorageConfigForConnectionTest,
} from '~/lib/utils/cloud-storage-config';
import type { ICloudConfig, WebDAVConfig } from '@shared/types/cloud-backup';

describe('normalizeCloudStorageConfigForConnectionTest', () => {
  it('normalizes WebDAV fields and preserves the saved advanced timeout', () => {
    const config: WebDAVConfig = {
      id: 'webdav-1',
      name: '  Primary WebDAV  ',
      type: 'webdav',
      enabled: true,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      url: '  https://dav.example.com/root  ',
      username: '  user@example.com  ',
      password: ' password-with-spaces ',
      requestTimeoutMs: 45_000,
    };

    expect(normalizeCloudStorageConfigForConnectionTest(config)).toEqual({
      ...config,
      name: 'Primary WebDAV',
      url: 'https://dav.example.com/root',
      username: 'user@example.com',
      password: ' password-with-spaces ',
      requestTimeoutMs: 45_000,
    });
  });

  it('normalizes iCloud fields using the same connection-test path', () => {
    const config: ICloudConfig = {
      id: 'icloud-1',
      name: '  iCloud Drive  ',
      type: 'icloud',
      enabled: true,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      path: '  AI-Gist-Backup  ',
    };

    expect(normalizeCloudStorageConfigForConnectionTest(config)).toEqual({
      ...config,
      name: 'iCloud Drive',
      path: 'AI-Gist-Backup',
    });
  });

  it('keeps hidden saved fields when testing an unchanged edit form', () => {
    const existing: WebDAVConfig = {
      id: 'webdav-1',
      name: 'WebDAV',
      type: 'webdav',
      enabled: true,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
      url: 'https://dav.example.com',
      username: 'user',
      password: 'secret',
      requestTimeoutMs: 90_000,
    };

    const fromEditForm = createCloudStorageConfigForConnectionTest({
      id: existing.id,
      name: existing.name,
      type: existing.type,
      enabled: existing.enabled,
      url: existing.url,
      username: existing.username,
      password: existing.password,
    }, existing, '2026-07-11T00:00:00.000Z') as WebDAVConfig;

    expect(fromEditForm.requestTimeoutMs).toBe(90_000);
    expect(fromEditForm).toMatchObject({
      id: existing.id,
      url: existing.url,
      username: existing.username,
      password: existing.password,
    });
  });
});
