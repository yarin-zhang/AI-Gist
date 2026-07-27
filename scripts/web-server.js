// @ts-check
const http = require('http');
const fs = require('fs');
const Path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8080);
const WEB_ROOT = process.env.AI_GIST_WEB_ROOT || Path.join(__dirname, '..', 'build', 'web');
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const CLOUD_BACKUP_DIR = 'AI-Gist-Backup';
const CLOUD_SYNC_MANIFEST_FILE = 'sync-manifest.json';
const CLOUD_SYNC_MANIFEST_BACKUP_FILE = 'sync-manifest.backup.json';
const CLOUD_SYNC_DIR = 'sync';
const CLOUD_SYNC_SNAPSHOTS_DIR = 'snapshots';
const CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION = '.json';
const CLOUD_SYNC_SNAPSHOT_FILE_KIND = 'ai-gist-cloud-sync-snapshot';
const CLOUD_SYNC_V2_RELATIVE_ROOT = `${CLOUD_BACKUP_DIR}/sync-v2`;
const MAX_SYNC_V2_LIST_OBJECTS = 100000;
const MAX_SYNC_V2_LIST_DEPTH = 16;
const CLOUD_BACKUP_FILE_PREFIX = 'backup-';
const CLOUD_BACKUP_FILE_EXTENSION = '.json';
const CLOUD_BACKUP_MANIFEST_FILE = 'backup-manifest.json';
const BACKUP_PAYLOAD_SCHEMA_VERSION = 1;
const REQUIRED_SYNC_COLLECTIONS = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'aiConfigs',
  'quickOptimizationConfigs',
  'aiHistory',
  'settings',
  'syncTombstones'
];

const DEFAULT_MODELS = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  siliconflow: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3'],
  tencent: ['hunyuan-lite', 'hunyuan-standard'],
  aliyun: ['qwen-plus', 'qwen-turbo'],
  zhipu: ['glm-4-flash', 'glm-4'],
  mistral: ['mistral-small-latest', 'mistral-large-latest'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
  azure: ['gpt-4o-mini'],
  lmstudio: ['local-model'],
  ollama: ['llama3.1'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
  google: ['gemini-1.5-flash', 'gemini-1.5-pro']
};

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  tencent: 'https://api.hunyuan.cloud.tencent.com/v1',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  azure: '',
  lmstudio: 'http://localhost:1234/v1',
  ollama: 'http://localhost:11434',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com'
};

const DEFAULT_SYSTEM_PROMPT = '你是一个专业的 AI 提示词工程师。请根据用户需求生成清晰、具体、结构化的 AI 提示词。';
let webdavModulePromise = null;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendApiSuccess(res, data) {
  sendJson(res, 200, { success: true, data });
}

function sendApiError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, status, { success: false, error: message });
}

function sendStreamHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
}

function writeStreamEvent(res, event) {
  const line = `${JSON.stringify(event)}\n`;
  if (res.write(line)) {
    return Promise.resolve();
  }
  return new Promise(resolve => res.once('drain', resolve));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求 JSON 格式无效'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeRemotePath(...parts) {
  return `/${parts
    .filter(Boolean)
    .map(part => String(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;
}

function isCloudBackupFileName(name) {
  return typeof name === 'string' &&
    name.startsWith(CLOUD_BACKUP_FILE_PREFIX) &&
    name.endsWith(CLOUD_BACKUP_FILE_EXTENSION) &&
    name !== CLOUD_BACKUP_MANIFEST_FILE &&
    name.length > CLOUD_BACKUP_FILE_PREFIX.length + CLOUD_BACKUP_FILE_EXTENSION.length;
}

async function createWebDAVClient(config) {
  if (!config?.url) {
    throw new Error('WebDAV 服务器地址不能为空');
  }
  webdavModulePromise = webdavModulePromise || import('webdav');
  const { createClient } = await webdavModulePromise;
  return createClient(config.url.replace(/\/+$/, ''), {
    username: config.username || '',
    password: config.password || ''
  });
}

async function ensureWebDAVDirectory(client) {
  const dir = normalizeRemotePath(CLOUD_BACKUP_DIR);
  try {
    if (await client.exists(dir)) {
      return;
    }
  } catch {
    // Continue and try to create the directory.
  }

  try {
    await client.createDirectory(dir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('405') && !message.includes('exists')) {
      throw error;
    }
  }
}

async function ensureWebDAVNestedDirectory(client, remoteDir) {
  const segments = remoteDir.split('/').filter(Boolean);
  let currentPath = '';
  for (const segment of segments) {
    currentPath = normalizeRemotePath(currentPath, segment);
    try {
      if (await client.exists(currentPath)) {
        continue;
      }
    } catch {
      // Try to create it below.
    }

    try {
      await client.createDirectory(currentPath);
    } catch (error) {
      const message = formatErrorMessage(error);
      if (!/405|409|exists/i.test(message)) {
        throw error;
      }
    }
  }
}

async function readWebDAVText(client, remotePath) {
  const content = await client.getFileContents(remotePath, { format: 'text' });
  if (typeof content === 'string') {
    return content;
  }
  if (Buffer.isBuffer(content)) {
    return content.toString('utf8');
  }
  return String(content);
}

function assertCloudSyncV2TransportPath(input, options = {}) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    throw new Error('sync-v2 对象路径无效');
  }
  if (/[%\\\0\r\n?#]/.test(input) || input.startsWith('/') || /^[a-zA-Z]:/.test(input)) {
    throw new Error('sync-v2 对象路径必须是未编码的相对路径');
  }

  const segments = input.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('sync-v2 对象路径包含非法路径段');
  }
  if (segments[0] !== CLOUD_BACKUP_DIR || segments[1] !== 'sync-v2') {
    throw new Error('sync-v2 对象路径超出允许的命名空间');
  }
  if (options.requireObject && segments.length <= 2) {
    throw new Error('sync-v2 对象操作必须指向具体文件');
  }
  return segments.join('/');
}

function decodeStrictBase64(input) {
  if (typeof input !== 'string') {
    throw new Error('sync-v2 对象内容必须使用 base64 编码');
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    throw new Error('sync-v2 对象 base64 内容无效');
  }
  return Buffer.from(input, 'base64');
}

function normalizeWebDAVBinary(content) {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  }
  if (typeof content === 'string') {
    return Buffer.from(content, 'binary');
  }
  throw new Error('WebDAV 返回了不支持的二进制对象格式');
}

function isWebDAVNotFoundError(error) {
  return /404|not\s*found|does not exist/i.test(formatErrorMessage(error));
}

async function statWebDAVObject(client, remotePath) {
  try {
    const stat = await client.stat(remotePath);
    return {
      path: remotePath,
      etag: typeof stat?.etag === 'string' ? stat.etag : undefined,
      byteLength: typeof stat?.size === 'number' ? stat.size : undefined,
      isDirectory: stat?.type === 'directory'
    };
  } catch (error) {
    if (isWebDAVNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function readStableWebDAVBinary(client, remotePath) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await statWebDAVObject(client, remotePath);
    if (!before) {
      return null;
    }
    if (before.isDirectory) {
      throw new Error(`sync-v2 对象路径指向目录: ${remotePath}`);
    }

    let content;
    try {
      content = normalizeWebDAVBinary(
        await client.getFileContents(remotePath, { format: 'binary' })
      );
    } catch (error) {
      if (isWebDAVNotFoundError(error)) {
        return null;
      }
      throw error;
    }
    const after = await statWebDAVObject(client, remotePath);
    if (!after) {
      continue;
    }
    if (before.etag && after.etag && before.etag !== after.etag) {
      continue;
    }
    if (after.byteLength !== undefined && after.byteLength !== content.byteLength) {
      continue;
    }
    return { content, stat: after };
  }
  throw new Error(`sync-v2 对象在读取过程中持续变化: ${remotePath}`);
}

function normalizeConditionalHeader(input, name) {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input !== 'string' || !input.trim() || input.length > 512 || /[\0\r\n]/.test(input)) {
    throw new Error(`${name} 条件无效`);
  }
  return input.trim() === '*' ? '*' : normalizeIfMatchHeaderValue(input);
}

function etagMatches(currentEtag, expectedEtag) {
  if (!currentEtag) {
    return false;
  }
  return normalizeIfMatchHeaderValue(currentEtag) === normalizeIfMatchHeaderValue(expectedEtag);
}

function encodeCloudSyncSnapshotRevision(revision) {
  return encodeURIComponent(revision).replace(/%/g, '~');
}

function decodeCloudSyncSnapshotRevision(encodedRevision) {
  return decodeURIComponent(encodedRevision.replace(/~/g, '%'));
}

function getCloudSyncSnapshotFileName(revision) {
  return `${encodeCloudSyncSnapshotRevision(revision)}${CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION}`;
}

function getCloudSyncSnapshotRevisionFromFileName(name) {
  if (!name || !name.endsWith(CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION)) {
    return null;
  }
  try {
    return decodeCloudSyncSnapshotRevision(name.slice(0, -CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION.length));
  } catch {
    return null;
  }
}

function getCloudSyncSnapshotsDirectoryPath() {
  return normalizeRemotePath(CLOUD_BACKUP_DIR, CLOUD_SYNC_DIR, CLOUD_SYNC_SNAPSHOTS_DIR);
}

function getCloudSyncSnapshotPath(revision) {
  return normalizeRemotePath(
    CLOUD_BACKUP_DIR,
    CLOUD_SYNC_DIR,
    CLOUD_SYNC_SNAPSHOTS_DIR,
    getCloudSyncSnapshotFileName(revision)
  );
}

function createEmptyCloudSyncManifest() {
  const now = new Date().toISOString();
  return {
    kind: 'ai-gist-cloud-sync-manifest',
    schemaVersion: 1,
    updatedAt: now,
    devices: {},
    conflicts: []
  };
}

function normalizeCloudSyncManifest(input) {
  if (!input || typeof input !== 'object') {
    return createEmptyCloudSyncManifest();
  }

  return {
    kind: 'ai-gist-cloud-sync-manifest',
    schemaVersion: 1,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    latestSnapshot: isValidCloudSyncSnapshot(input.latestSnapshot) ? input.latestSnapshot : undefined,
    baseSnapshot: isValidCloudSyncSnapshot(input.baseSnapshot) ? input.baseSnapshot : undefined,
    devices: normalizeDeviceStates(input.devices),
    conflicts: Array.isArray(input.conflicts) ? input.conflicts : []
  };
}

function assertValidCloudSyncManifest(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('manifest must be an object');
  }

  if (input.kind !== undefined && input.kind !== 'ai-gist-cloud-sync-manifest') {
    throw new Error('manifest kind is invalid');
  }

  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new Error('manifest schema version is unsupported');
  }

  assertOptionalCloudSyncSnapshot(input.latestSnapshot, 'latestSnapshot');
  assertOptionalCloudSyncSnapshot(input.baseSnapshot, 'baseSnapshot');
  return normalizeCloudSyncManifest(input);
}

function assertOptionalCloudSyncSnapshot(snapshot, fieldName) {
  if (snapshot === undefined || snapshot === null) {
    return;
  }

  const result = validateCloudSyncSnapshot(snapshot);
  if (!result.valid) {
    throw new Error(`${fieldName} ${result.reason || 'is invalid'}`);
  }
}

function isValidCloudSyncSnapshot(snapshot) {
  return validateCloudSyncSnapshot(snapshot).valid;
}

function createCloudSyncSnapshotFile(snapshot) {
  return {
    kind: CLOUD_SYNC_SNAPSHOT_FILE_KIND,
    schemaVersion: 1,
    snapshot: normalizeCloudSyncSnapshotForFile(snapshot)
  };
}

function assertValidCloudSyncSnapshotFile(input) {
  const snapshot = unwrapCloudSyncSnapshotFile(input);
  const result = validateCloudSyncSnapshot(snapshot);
  if (!result.valid) {
    throw new Error(result.reason || 'cloud sync snapshot file is invalid');
  }
  return normalizeCloudSyncSnapshotForFile(snapshot);
}

function unwrapCloudSyncSnapshotFile(input) {
  if (input && typeof input === 'object' && input.kind === CLOUD_SYNC_SNAPSHOT_FILE_KIND) {
    if (input.schemaVersion !== 1) {
      throw new Error('cloud sync snapshot file schema version is unsupported');
    }
    return input.snapshot;
  }
  return input;
}

function normalizeCloudSyncSnapshotForFile(snapshot) {
  return {
    schemaVersion: 1,
    deviceId: snapshot.deviceId,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
    data: snapshot.data,
    dataChecksum: snapshot.dataChecksum || createCloudSyncDataChecksum(snapshot.data),
    contentChecksum: snapshot.contentChecksum
  };
}

function validateCloudSyncSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, reason: 'snapshot must be an object' };
  }

  if (snapshot.schemaVersion !== 1) {
    return { valid: false, reason: 'unsupported snapshot schema version' };
  }

  if (typeof snapshot.deviceId !== 'string' || !snapshot.deviceId) {
    return { valid: false, reason: 'snapshot deviceId is missing' };
  }

  if (typeof snapshot.revision !== 'string' || !snapshot.revision) {
    return { valid: false, reason: 'snapshot revision is missing' };
  }

  if (typeof snapshot.createdAt !== 'string' || !snapshot.createdAt) {
    return { valid: false, reason: 'snapshot createdAt is missing' };
  }

  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
    return { valid: false, reason: 'snapshot data must be an object' };
  }

  for (const collection of REQUIRED_SYNC_COLLECTIONS) {
    if (!Array.isArray(snapshot.data[collection])) {
      return { valid: false, reason: `snapshot data missing collection ${collection}` };
    }
  }

  if (snapshot.dataChecksum !== undefined) {
    if (typeof snapshot.dataChecksum !== 'string' || !snapshot.dataChecksum) {
      return { valid: false, reason: 'snapshot dataChecksum is invalid' };
    }

    const actualChecksum = createCloudSyncDataChecksum(snapshot.data);
    if (snapshot.dataChecksum !== actualChecksum) {
      return { valid: false, reason: 'snapshot data checksum mismatch' };
    }
  }

  if (
    snapshot.contentChecksum !== undefined &&
    (typeof snapshot.contentChecksum !== 'string' || !snapshot.contentChecksum)
  ) {
    return { valid: false, reason: 'snapshot contentChecksum is invalid' };
  }

  return { valid: true };
}

function normalizeDeviceStates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const devices = {};
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    if (typeof value.deviceId !== 'string' || typeof value.lastSyncAt !== 'string') {
      continue;
    }

    devices[key] = {
      deviceId: value.deviceId,
      deviceName: typeof value.deviceName === 'string' ? value.deviceName : undefined,
      platform: typeof value.platform === 'string' ? value.platform : undefined,
      lastSyncAt: value.lastSyncAt,
      lastKnownRevision: typeof value.lastKnownRevision === 'string' ? value.lastKnownRevision : undefined
    };
  }

  return devices;
}

function createCloudSyncDataChecksum(data) {
  return `fnv1a32:${fnv1a32(stableSerialize(normalizeForChecksum(data)))}`;
}

function createBackupDataChecksum(data) {
  return createCloudSyncDataChecksum(data);
}

function parseBackupPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('备份文件格式无效');
  }

  if (!('data' in value) || value.data === undefined || value.data === null) {
    throw new Error('备份文件缺少 data 字段');
  }

  if (typeof value.id !== 'string' || !value.id) {
    throw new Error('备份文件缺少 id 字段');
  }

  if (typeof value.name !== 'string' || !value.name) {
    throw new Error('备份文件缺少 name 字段');
  }

  if (typeof value.createdAt !== 'string' || !value.createdAt) {
    throw new Error('备份文件缺少 createdAt 字段');
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== BACKUP_PAYLOAD_SCHEMA_VERSION) {
    throw new Error(`不支持的备份格式版本: ${value.schemaVersion}`);
  }

  if (value.checksum !== undefined) {
    if (typeof value.checksum !== 'string' || !value.checksum) {
      throw new Error('备份文件校验码无效');
    }

    const actualChecksum = createBackupDataChecksum(value.data);
    if (value.checksum !== actualChecksum) {
      throw new Error('备份数据校验失败，文件可能已损坏或未完整同步');
    }
  }

  return {
    payload: value,
    data: value.data,
    checksum: value.checksum,
    legacy: value.checksum === undefined
  };
}

function stableSerialize(value) {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function normalizeForChecksum(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeForChecksum(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  const normalized = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    normalized[key] = normalizeForChecksum(fieldValue);
  }
  return normalized;
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function testWebDAV({ config }) {
  const client = await createWebDAVClient(config);
  await ensureWebDAVDirectory(client);
  return { ok: true };
}

async function listWebDAVBackups({ config }) {
  const client = await createWebDAVClient(config);
  const dir = normalizeRemotePath(CLOUD_BACKUP_DIR);
  if (!(await client.exists(dir))) {
    return [];
  }

  const entries = await client.getDirectoryContents(dir);
  const list = Array.isArray(entries) ? entries : entries.data || [];
  const backups = [];

  for (const entry of list) {
    const name = entry.basename || Path.basename(entry.filename || entry.path || '');
    if (!isCloudBackupFileName(name)) {
      continue;
    }

    const cloudPath = normalizeRemotePath(CLOUD_BACKUP_DIR, name);
    try {
      const parsedBackup = parseBackupPayload(JSON.parse(await readWebDAVText(client, cloudPath)));
      const backupData = parsedBackup.payload;
      backups.push({
        id: backupData.id,
        name: backupData.name || name,
        description: backupData.description,
        createdAt: backupData.createdAt,
        modifiedAt: typeof entry.lastmod === 'string' ? entry.lastmod : undefined,
        size: Number(entry.size) || Buffer.byteLength(JSON.stringify(backupData)),
        cloudPath,
        storageId: config.id,
        version: backupData.version,
        checksum: parsedBackup.checksum,
        backupType: backupData.backupType,
        trigger: backupData.trigger,
        deviceId: backupData.deviceId,
        dataChecksum: backupData.dataChecksum
      });
    } catch (error) {
      console.warn(`[web] 跳过无法解析的备份文件 ${cloudPath}:`, error);
    }
  }

  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function writeWebDAVBackup({ config, fileName, backupData }) {
  const client = await createWebDAVClient(config);
  await ensureWebDAVDirectory(client);
  const parsedBackup = parseBackupPayload(backupData);
  const backupPayload = parsedBackup.payload;
  const safeName = Path.basename(
    fileName || `${CLOUD_BACKUP_FILE_PREFIX}${backupPayload.id || Date.now()}${CLOUD_BACKUP_FILE_EXTENSION}`
  );
  if (!isCloudBackupFileName(safeName)) {
    throw new Error('备份写入路径超出允许的命名空间');
  }
  const cloudPath = normalizeRemotePath(CLOUD_BACKUP_DIR, safeName);
  const content = JSON.stringify(backupPayload, null, 2);
  await client.putFileContents(cloudPath, content, { overwrite: true });
  const verified = parseBackupPayload(JSON.parse(await readWebDAVText(client, cloudPath)));
  if (verified.payload.id !== backupPayload.id || verified.checksum !== parsedBackup.checksum) {
    throw new Error('备份写入后的远端读回校验失败');
  }
  return {
    id: verified.payload.id,
    name: verified.payload.name || safeName,
    description: verified.payload.description,
    createdAt: verified.payload.createdAt,
    size: Buffer.byteLength(content),
    cloudPath,
    storageId: config.id,
    version: verified.payload.version,
    checksum: verified.checksum,
    backupType: verified.payload.backupType,
    trigger: verified.payload.trigger,
    deviceId: verified.payload.deviceId,
    dataChecksum: verified.payload.dataChecksum
  };
}

async function readWebDAVBackup({ config, cloudPath }) {
  const client = await createWebDAVClient(config);
  return parseBackupPayload(JSON.parse(await readWebDAVText(client, cloudPath))).payload;
}

async function deleteWebDAVBackup({ config, cloudPath }) {
  const normalizedPath = normalizeRemotePath(cloudPath);
  const fileName = Path.posix.basename(normalizedPath);
  if (!isCloudBackupFileName(fileName) || normalizedPath !== normalizeRemotePath(CLOUD_BACKUP_DIR, fileName)) {
    throw new Error('备份删除路径超出允许的命名空间');
  }
  const client = await createWebDAVClient(config);
  try {
    await client.deleteFile(normalizedPath);
  } catch (error) {
    if (!isWebDAVNotFoundError(error)) throw error;
  }
  return { ok: true };
}

async function getWebDAVSyncManifest({ config }) {
  const client = await createWebDAVClient(config);
  const manifestPath = normalizeRemotePath(CLOUD_BACKUP_DIR, CLOUD_SYNC_MANIFEST_FILE);
  const backupPath = normalizeRemotePath(CLOUD_BACKUP_DIR, CLOUD_SYNC_MANIFEST_BACKUP_FILE);
  try {
    const primaryState = await tryReadWebDAVSyncManifestFileWithMeta(client, manifestPath);
    if (primaryState?.manifest) return primaryState.manifest;
    const backupState = await tryReadWebDAVSyncManifestFileWithMeta(client, backupPath);
    return backupState?.manifest || createEmptyCloudSyncManifest();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('404') || message.includes('not found')) {
      return createEmptyCloudSyncManifest();
    }
    console.warn('[web] 读取云同步 manifest 失败，尝试读取备份副本:', error);
    try {
      if (!(await client.exists(backupPath))) {
        throw new Error('backup manifest not found');
      }
      return (await readWebDAVSyncManifestFileWithMeta(client, backupPath)).manifest;
    } catch (backupError) {
      throw new Error(
        `读取云同步 manifest 失败，且备份副本不可用: ${formatErrorMessage(error)}；` +
        `备份副本错误: ${formatErrorMessage(backupError)}`
      );
    }
  }
}

async function readWebDAVSyncManifestFile(client, remotePath) {
  return (await readWebDAVSyncManifestFileWithMeta(client, remotePath)).manifest;
}

async function readWebDAVSyncManifestFileWithMeta(client, remotePath) {
  try {
    const [text, stat] = await Promise.all([
      readWebDAVText(client, remotePath),
      client.stat(remotePath).catch(() => null)
    ]);
    return {
      manifest: assertValidCloudSyncManifest(JSON.parse(text)),
      etag: typeof stat?.etag === 'string' ? stat.etag : undefined
    };
  } catch (error) {
    throw new Error(`云同步 manifest 内容无效（${remotePath}）: ${formatErrorMessage(error)}`);
  }
}

async function saveWebDAVSyncManifest({ config, manifest, options = {} }) {
  const client = await createWebDAVClient(config);
  await ensureWebDAVDirectory(client);
  const manifestPath = normalizeRemotePath(CLOUD_BACKUP_DIR, CLOUD_SYNC_MANIFEST_FILE);
  const backupPath = normalizeRemotePath(CLOUD_BACKUP_DIR, CLOUD_SYNC_MANIFEST_BACKUP_FILE);
  const normalizedManifest = assertValidCloudSyncManifest({
    ...manifest,
    updatedAt: new Date().toISOString()
  });
  const content = JSON.stringify(normalizedManifest, null, 2);

  const primaryState = await tryReadWebDAVSyncManifestFileWithMeta(client, manifestPath);
  const backupState = primaryState?.manifest
    ? null
    : await tryReadWebDAVSyncManifestFileWithMeta(client, backupPath);
  const currentManifest = primaryState?.manifest || backupState?.manifest || createEmptyCloudSyncManifest();

  assertExpectedCloudSyncRevision(currentManifest, options.expectedRevision);

  const headers = {};
  if (options.expectedRevision !== undefined) {
    if (primaryState?.etag) {
      headers['If-Match'] = normalizeIfMatchHeaderValue(primaryState.etag);
    } else if (!currentManifest.latestSnapshot) {
      headers['If-None-Match'] = '*';
    }
  }

  try {
    await client.putFileContents(manifestPath, content, {
      overwrite: true,
      headers
    });
  } catch (error) {
    if (isRevisionConflictError(error)) {
      throw createCloudSyncManifestRevisionConflictError(
        options.expectedRevision,
        getCloudSyncManifestRevision(currentManifest)
      );
    }
    throw error;
  }

  await client.putFileContents(backupPath, content, { overwrite: true });
  return { ok: true };
}

async function listWebDAVSyncSnapshots({ config }) {
  const client = await createWebDAVClient(config);
  const snapshotsDir = getCloudSyncSnapshotsDirectoryPath();
  try {
    if (!(await client.exists(snapshotsDir))) {
      return [];
    }

    const contents = await client.getDirectoryContents(snapshotsDir);
    const files = Array.isArray(contents) ? contents : contents.data || [];
    return files
      .filter(file => file?.type !== 'directory')
      .map(file => {
        const fileName = file.basename || Path.basename(file.filename || file.path || '');
        const revision = getCloudSyncSnapshotRevisionFromFileName(fileName);
        if (!revision) {
          return null;
        }

        return {
          revision,
          path: getCloudSyncSnapshotPath(revision),
          modifiedAt: typeof file.lastmod === 'string' ? file.lastmod : undefined,
          size: typeof file.size === 'number' ? file.size : undefined
        };
      })
      .filter(Boolean);
  } catch (error) {
    if (/404|not\s*found/i.test(formatErrorMessage(error))) {
      return [];
    }
    throw error;
  }
}

async function readWebDAVSyncSnapshot({ config, snapshot }) {
  const client = await createWebDAVClient(config);
  const snapshotInfo = normalizeSnapshotReference(snapshot);
  const text = await readWebDAVText(client, snapshotInfo.path);
  return assertValidCloudSyncSnapshotFile(JSON.parse(text));
}

async function saveWebDAVSyncSnapshot({ config, snapshot }) {
  const client = await createWebDAVClient(config);
  const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot);
  const snapshotsDir = getCloudSyncSnapshotsDirectoryPath();
  const snapshotPath = getCloudSyncSnapshotPath(normalizedSnapshot.revision);
  const content = JSON.stringify(createCloudSyncSnapshotFile(normalizedSnapshot), null, 2);

  await ensureWebDAVNestedDirectory(client, snapshotsDir);
  try {
    await client.putFileContents(snapshotPath, content, {
      overwrite: false,
      headers: {
        'If-None-Match': '*'
      }
    });
  } catch (error) {
    if (!isRevisionConflictError(error) && !/already exists|412/i.test(formatErrorMessage(error))) {
      throw error;
    }

    const existingSnapshot = await readWebDAVSyncSnapshot({
      config,
      snapshot: {
        revision: normalizedSnapshot.revision,
        path: snapshotPath
      }
    });
    if (isSameCloudSyncSnapshot(existingSnapshot, normalizedSnapshot)) {
      return { ok: true };
    }

    throw new Error(`云同步快照 ${normalizedSnapshot.revision} 已存在但内容不一致`);
  }

  return { ok: true };
}

async function deleteWebDAVSyncSnapshot({ config, snapshot }) {
  const client = await createWebDAVClient(config);
  const revision = typeof snapshot === 'string' ? snapshot : snapshot?.revision;
  if (typeof revision !== 'string' || !revision) {
    throw new Error('云同步快照 revision 不能为空');
  }
  const snapshotPath = getCloudSyncSnapshotPath(revision);
  try {
    await client.deleteFile(snapshotPath);
  } catch (error) {
    if (!isWebDAVNotFoundError(error)) throw error;
  }
  return { ok: true };
}

async function readWebDAVSyncV2Object({ config, path }) {
  const relativePath = assertCloudSyncV2TransportPath(path, { requireObject: true });
  const remotePath = normalizeRemotePath(relativePath);
  const client = await createWebDAVClient(config);
  const result = await readStableWebDAVBinary(client, remotePath);
  if (!result) {
    return null;
  }
  return {
    path: remotePath,
    dataBase64: result.content.toString('base64'),
    etag: result.stat.etag,
    byteLength: result.content.byteLength
  };
}

async function statWebDAVSyncV2Object({ config, path }) {
  const relativePath = assertCloudSyncV2TransportPath(path);
  const remotePath = normalizeRemotePath(relativePath);
  const client = await createWebDAVClient(config);
  return statWebDAVObject(client, remotePath);
}

async function writeWebDAVSyncV2Object({ config, path, dataBase64, ifMatch, ifNoneMatch }) {
  const relativePath = assertCloudSyncV2TransportPath(path, { requireObject: true });
  const remotePath = normalizeRemotePath(relativePath);
  const content = decodeStrictBase64(dataBase64);
  const normalizedIfMatch = normalizeConditionalHeader(ifMatch, 'If-Match');
  const normalizedIfNoneMatch = normalizeConditionalHeader(ifNoneMatch, 'If-None-Match');
  if (normalizedIfMatch !== undefined && normalizedIfNoneMatch !== undefined) {
    throw new Error('If-Match 与 If-None-Match 不能同时使用');
  }

  const client = await createWebDAVClient(config);
  const current = await statWebDAVObject(client, remotePath);
  if (current?.isDirectory) {
    throw new Error(`sync-v2 对象路径指向目录: ${remotePath}`);
  }
  if (normalizedIfMatch !== undefined && (!current || !etagMatches(current.etag, normalizedIfMatch))) {
    return { status: 'precondition_failed', etag: current?.etag };
  }
  if (normalizedIfNoneMatch === '*' && current) {
    return { status: 'precondition_failed', etag: current.etag };
  }
  if (normalizedIfNoneMatch !== undefined && normalizedIfNoneMatch !== '*' &&
      current && etagMatches(current.etag, normalizedIfNoneMatch)) {
    return { status: 'precondition_failed', etag: current.etag };
  }

  await ensureWebDAVNestedDirectory(client, Path.posix.dirname(remotePath));
  const headers = {};
  if (normalizedIfMatch !== undefined) {
    headers['If-Match'] = normalizedIfMatch;
  }
  if (normalizedIfNoneMatch !== undefined) {
    headers['If-None-Match'] = normalizedIfNoneMatch;
  }

  try {
    await client.putFileContents(remotePath, content, {
      overwrite: normalizedIfNoneMatch === '*' ? false : true,
      headers
    });
  } catch (error) {
    if (isRevisionConflictError(error) || /already exists/i.test(formatErrorMessage(error))) {
      const latest = await statWebDAVObject(client, remotePath).catch(() => null);
      return { status: 'precondition_failed', etag: latest?.etag };
    }
    throw error;
  }

  const written = await statWebDAVObject(client, remotePath);
  if (!written || written.isDirectory ||
      (written.byteLength !== undefined && written.byteLength !== content.byteLength)) {
    throw new Error(`sync-v2 对象写入后校验失败: ${remotePath}`);
  }
  return { status: 'written', etag: written.etag };
}

async function deleteWebDAVSyncV2Object({ config, path }) {
  const relativePath = assertCloudSyncV2TransportPath(path, { requireObject: true });
  const remotePath = normalizeRemotePath(relativePath);
  const client = await createWebDAVClient(config);
  const current = await statWebDAVObject(client, remotePath);
  if (!current) {
    return { ok: true };
  }
  if (current.isDirectory) {
    throw new Error('sync-v2 transport 不允许删除目录');
  }
  try {
    await client.deleteFile(remotePath);
  } catch (error) {
    if (!isWebDAVNotFoundError(error)) {
      throw error;
    }
  }
  return { ok: true };
}

async function listWebDAVSyncV2Objects({ config, prefix = CLOUD_SYNC_V2_RELATIVE_ROOT }) {
  const relativePrefix = assertCloudSyncV2TransportPath(prefix);
  const remotePrefix = normalizeRemotePath(relativePrefix);
  const client = await createWebDAVClient(config);
  const rootStat = await statWebDAVObject(client, remotePrefix);
  if (!rootStat) {
    return [];
  }
  if (!rootStat.isDirectory) {
    return [{
      path: remotePrefix,
      etag: rootStat.etag,
      byteLength: rootStat.byteLength
    }];
  }

  const objects = [];
  const pending = [{ path: remotePrefix, depth: 0 }];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current.path)) {
      continue;
    }
    visited.add(current.path);
    if (current.depth > MAX_SYNC_V2_LIST_DEPTH) {
      throw new Error('sync-v2 对象目录层级超出安全限制');
    }

    const response = await client.getDirectoryContents(current.path);
    const entries = Array.isArray(response) ? response : response.data || [];
    for (const entry of entries) {
      const basename = entry?.basename || Path.posix.basename(entry?.filename || entry?.path || '');
      if (!basename || basename === '.' || basename === '..' || /[/\\%\0\r\n]/.test(basename)) {
        throw new Error('WebDAV 返回了非法的 sync-v2 对象名称');
      }
      const childRelativePath = assertCloudSyncV2TransportPath(
        `${current.path.replace(/^\/+/, '')}/${basename}`
      );
      const childPath = normalizeRemotePath(childRelativePath);
      if (entry?.type === 'directory') {
        pending.push({ path: childPath, depth: current.depth + 1 });
        continue;
      }
      objects.push({
        path: childPath,
        etag: typeof entry?.etag === 'string' ? entry.etag : undefined,
        byteLength: typeof entry?.size === 'number' ? entry.size : undefined
      });
      if (objects.length > MAX_SYNC_V2_LIST_OBJECTS) {
        throw new Error('sync-v2 对象数量超出安全限制');
      }
    }
  }
  return objects.sort((left, right) => left.path.localeCompare(right.path));
}

async function tryReadWebDAVSyncManifestFileWithMeta(client, remotePath) {
  try {
    if (!(await client.exists(remotePath))) {
      return null;
    }
    return await readWebDAVSyncManifestFileWithMeta(client, remotePath);
  } catch (error) {
    const message = formatErrorMessage(error);
    if (/404|not\s*found/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function getCloudSyncManifestRevision(manifest) {
  return manifest?.latestSnapshot?.revision || null;
}

function assertExpectedCloudSyncRevision(manifest, expectedRevision) {
  if (expectedRevision === undefined) {
    return;
  }

  const currentRevision = getCloudSyncManifestRevision(manifest);
  if (currentRevision !== expectedRevision) {
    throw createCloudSyncManifestRevisionConflictError(expectedRevision, currentRevision);
  }
}

function normalizeSnapshotReference(snapshot) {
  if (typeof snapshot === 'string') {
    return {
      revision: snapshot,
      path: getCloudSyncSnapshotPath(snapshot)
    };
  }

  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.revision !== 'string') {
    throw new Error('云同步快照引用无效');
  }

  return {
    ...snapshot,
    path: snapshot.path || getCloudSyncSnapshotPath(snapshot.revision)
  };
}

function isSameCloudSyncSnapshot(left, right) {
  return left.revision === right.revision &&
    left.dataChecksum === right.dataChecksum &&
    JSON.stringify(left.data) === JSON.stringify(right.data);
}

function createCloudSyncManifestRevisionConflictError(expectedRevision, currentRevision) {
  const expected = expectedRevision || '空';
  const current = currentRevision || '空';
  return new Error(`云同步 manifest 已被其他设备更新：期望 revision ${expected}，当前 revision ${current}`);
}

function isRevisionConflictError(error) {
  return /manifest 已被其他设备更新|Precondition|412|If-Match|If-None-Match|已被其他设备更新/i
    .test(formatErrorMessage(error));
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeIfMatchHeaderValue(etag) {
  const value = String(etag || '').trim();
  if (!value || value === '*' || value.startsWith('"') || value.startsWith('W/"')) {
    return value;
  }

  return `"${value.replace(/^"+|"+$/g, '')}"`;
}

function getProviderType(config) {
  return config?.type || 'openai';
}

function getBaseURL(config) {
  const type = getProviderType(config);
  return String(config.baseURL || DEFAULT_BASE_URLS[type] || '').replace(/\/+$/, '');
}

function getDefaultModels(type) {
  return DEFAULT_MODELS[type] || DEFAULT_MODELS.openai;
}

function getModel(config, requestedModel) {
  const type = getProviderType(config);
  return requestedModel || config.defaultModel || config.customModel || config.model || config.models?.[0] || getDefaultModels(type)[0];
}

function assertApiKey(config, providerName) {
  if ((getProviderType(config) === 'ollama' || getProviderType(config) === 'lmstudio') && !config.apiKey) {
    return;
  }
  if (!config.apiKey) {
    throw new Error(`${providerName} API Key 不能为空`);
  }
}

function buildMessages(config, requestOrPrompt) {
  const topic = typeof requestOrPrompt === 'string'
    ? requestOrPrompt
    : requestOrPrompt.customPrompt || requestOrPrompt.topic;
  const systemPrompt = typeof requestOrPrompt === 'string'
    ? (config.systemPrompt || DEFAULT_SYSTEM_PROMPT)
    : (requestOrPrompt.systemPrompt || config.systemPrompt || DEFAULT_SYSTEM_PROMPT);
  return {
    systemPrompt,
    userPrompt: topic || '请回复 OK'
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = typeof data === 'object' && data
      ? (data.error?.message || data.message || JSON.stringify(data))
      : text;
    throw new Error(`AI 请求失败（HTTP ${response.status}）：${detail}`);
  }

  return data;
}

async function assertFetchOk(response, providerName) {
  if (response.ok) {
    return;
  }

  const text = await response.text();
  let detail = text;
  try {
    const data = text ? JSON.parse(text) : null;
    detail = data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    // Keep the original text response.
  }

  throw new Error(`${providerName} 请求失败（HTTP ${response.status}）：${detail}`);
}

function buildOpenAIHeaders(config) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  if (getProviderType(config) === 'openrouter') {
    headers['HTTP-Referer'] = 'https://getaigist.com';
    headers['X-Title'] = 'AI Gist';
  }
  return headers;
}

async function callOpenAICompatible(config, prompt, model) {
  const baseURL = getBaseURL(config);
  if (!baseURL) {
    throw new Error('Base URL 不能为空');
  }
  assertApiKey(config, getProviderType(config));
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const data = await fetchJson(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: buildOpenAIHeaders(config),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: prompt.temperature ?? 0.7,
      max_tokens: prompt.maxTokens ?? 1000
    })
  });
  return data.choices?.[0]?.message?.content || '';
}

async function readSSEStream(response, onData) {
  if (!response.body) {
    throw new Error('服务端没有返回可读取的流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const dataLines = block
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart());

      if (dataLines.length > 0) {
        await onData(dataLines.join('\n'));
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const dataLines = buffer
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart());
    if (dataLines.length > 0) {
      await onData(dataLines.join('\n'));
    }
  }
}

async function readNDJSONStream(response, onData) {
  if (!response.body) {
    throw new Error('服务端没有返回可读取的流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        await onData(line.trim());
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await onData(buffer.trim());
  }
}

async function callOpenAICompatibleStream(config, prompt, model, onDelta, signal) {
  const baseURL = getBaseURL(config);
  if (!baseURL) {
    throw new Error('Base URL 不能为空');
  }

  assertApiKey(config, getProviderType(config));
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: buildOpenAIHeaders(config),
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: prompt.temperature ?? 0.7,
      max_tokens: prompt.maxTokens ?? 1000,
      stream: true
    })
  });

  await assertFetchOk(response, getProviderType(config));
  await readSSEStream(response, async payload => {
    if (payload === '[DONE]') {
      return;
    }

    const data = JSON.parse(payload);
    const content = data.choices?.[0]?.delta?.content || '';
    if (content) {
      await onDelta(content);
    }
  });
}

async function callAnthropic(config, prompt, model) {
  assertApiKey(config, 'Anthropic');
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const data = await fetchJson(`${getBaseURL(config)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: prompt.maxTokens ?? 1000,
      temperature: prompt.temperature ?? 0.7
    })
  });
  return data.content?.map(part => part.text || '').join('') || '';
}

async function callAnthropicStream(config, prompt, model, onDelta, signal) {
  assertApiKey(config, 'Anthropic');
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const response = await fetch(`${getBaseURL(config)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    signal,
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: prompt.maxTokens ?? 1000,
      temperature: prompt.temperature ?? 0.7,
      stream: true
    })
  });

  await assertFetchOk(response, 'Anthropic');
  await readSSEStream(response, async payload => {
    const data = JSON.parse(payload);
    const content = data.type === 'content_block_delta' ? data.delta?.text : '';
    if (content) {
      await onDelta(content);
    }
  });
}

async function callGoogle(config, prompt, model) {
  assertApiKey(config, 'Google');
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const url = `${getBaseURL(config)}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 1000
      }
    })
  });
  return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
}

async function callGoogleStream(config, prompt, model, onDelta, signal) {
  assertApiKey(config, 'Google');
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const url = `${getBaseURL(config)}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(config.apiKey)}&alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 1000
      }
    })
  });

  await assertFetchOk(response, 'Google');
  await readSSEStream(response, async payload => {
    const data = JSON.parse(payload);
    const content = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (content) {
      await onDelta(content);
    }
  });
}

async function callOllama(config, prompt, model) {
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const data = await fetchJson(`${getBaseURL(config)}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false
    })
  });
  return data.response || '';
}

async function callOllamaStream(config, prompt, model, onDelta, signal) {
  const { systemPrompt, userPrompt } = buildMessages(config, prompt);
  const response = await fetch(`${getBaseURL(config)}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: true
    })
  });

  await assertFetchOk(response, 'Ollama');
  await readNDJSONStream(response, async line => {
    const data = JSON.parse(line);
    if (data.response) {
      await onDelta(data.response);
    }
  });
}

function createGenerationResult(request, config, model, generatedPrompt) {
  const prompt = request || { topic: 'AI 生成' };
  return {
    id: `web_gen_${Date.now()}`,
    configId: config.configId,
    topic: prompt.topic || prompt.customPrompt || 'AI 生成',
    generatedPrompt,
    model,
    customPrompt: prompt.customPrompt,
    systemPrompt: prompt.systemPrompt,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
    createdAt: new Date()
  };
}

async function simulateStreamingProgress(content, onProgress, signal) {
  if (!content) {
    return;
  }

  const step = Math.max(1, Math.ceil(content.length / 20));
  for (let index = step; index <= content.length; index += step) {
    if (signal?.aborted) {
      throw new Error('用户中断生成');
    }
    const partialContent = content.slice(0, Math.min(index, content.length));
    await onProgress(partialContent.length, partialContent);
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  await onProgress(content.length, content);
}

async function generateAI({ request, config, model: explicitModel }) {
  const type = getProviderType(config);
  const model = getModel(config, explicitModel || request?.model);
  const prompt = request || { topic: '请回复 OK' };

  let generatedPrompt = '';
  if (type === 'anthropic') {
    generatedPrompt = await callAnthropic(config, prompt, model);
  } else if (type === 'google') {
    generatedPrompt = await callGoogle(config, prompt, model);
  } else if (type === 'ollama') {
    generatedPrompt = await callOllama(config, prompt, model);
  } else {
    generatedPrompt = await callOpenAICompatible(config, prompt, model);
  }

  return createGenerationResult(prompt, config, model, generatedPrompt);
}

async function generateAIStream({ request, config, model: explicitModel }, onProgress, signal) {
  const type = getProviderType(config);
  const model = getModel(config, explicitModel || request?.model);
  const prompt = request || { topic: '请回复 OK' };
  let generatedPrompt = '';

  const appendDelta = async content => {
    if (!content) {
      return;
    }
    generatedPrompt += content;
    await onProgress(generatedPrompt.length, generatedPrompt);
  };

  try {
    if (type === 'anthropic') {
      await callAnthropicStream(config, prompt, model, appendDelta, signal);
    } else if (type === 'google') {
      await callGoogleStream(config, prompt, model, appendDelta, signal);
    } else if (type === 'ollama') {
      await callOllamaStream(config, prompt, model, appendDelta, signal);
    } else {
      await callOpenAICompatibleStream(config, prompt, model, appendDelta, signal);
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('用户中断生成');
    }

    if (generatedPrompt.length > 0) {
      throw error;
    }

    const fallback = await generateAI({ request: prompt, config, model });
    generatedPrompt = fallback.generatedPrompt;
    await simulateStreamingProgress(generatedPrompt, onProgress, signal);
    return fallback;
  }

  return createGenerationResult(prompt, config, model, generatedPrompt);
}

async function getAIModels({ config }) {
  const type = getProviderType(config);
  if (type === 'anthropic' || type === 'google') {
    return { models: getDefaultModels(type), modelSource: 'default' };
  }

  if (type === 'ollama') {
    try {
      const data = await fetchJson(`${getBaseURL(config)}/api/tags`, { method: 'GET' });
      const models = data.models?.map(model => model.name).filter(Boolean) || [];
      return { models: models.length ? models : getDefaultModels(type), modelSource: models.length ? 'remote' : 'default' };
    } catch {
      return { models: getDefaultModels(type), modelSource: 'default' };
    }
  }

  try {
    const data = await fetchJson(`${getBaseURL(config)}/models`, {
      method: 'GET',
      headers: buildOpenAIHeaders(config)
    });
    const models = data.data?.map(model => model.id).filter(Boolean) || [];
    return { models: models.length ? models : getDefaultModels(type), modelSource: models.length ? 'remote' : 'default' };
  } catch {
    return { models: getDefaultModels(type), modelSource: 'default' };
  }
}

async function testAIModel({ config, model }) {
  try {
    const selectedModel = getModel(config, model);
    const result = await generateAI({
      config,
      model: selectedModel,
      request: {
        configId: config.configId || 'test',
        model: selectedModel,
        topic: '请用一句话回复：AI Gist connection test'
      }
    });
    return {
      success: true,
      model: selectedModel,
      response: result.generatedPrompt
    };
  } catch (error) {
    return {
      success: false,
      model,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testAIConfig({ config }) {
  const modelInfo = await getAIModels({ config });
  const model = getModel(config, modelInfo.models?.[0]);
  try {
    const modelResult = await testAIModel({ config, model });
    if (!modelResult.success) {
      throw new Error(modelResult.error || '模型测试失败');
    }
    return {
      success: true,
      models: modelInfo.models,
      modelSource: modelInfo.modelSource,
      modelListMessage: modelInfo.modelSource === 'default' ? '使用默认模型列表' : undefined
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      models: modelInfo.models,
      modelSource: modelInfo.modelSource
    };
  }
}

async function intelligentTest({ config }) {
  try {
    const result = await generateAI({
      config,
      request: {
        configId: config.configId || 'intelligent-test',
        topic: '请生成一个三点式的写作提示词，用于改进一段产品说明。'
      }
    });
    return {
      success: true,
      response: result.generatedPrompt,
      inputPrompt: '请生成一个三点式的写作提示词，用于改进一段产品说明。'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getCapabilities() {
  return {
    webBackend: true,
    aiProxy: true,
    webdavProxy: true,
    staticRoot: WEB_ROOT
  };
}

const apiRoutes = {
  '/api/capabilities': getCapabilities,
  '/api/cloud/webdav/test': testWebDAV,
  '/api/cloud/webdav/list-backups': listWebDAVBackups,
  '/api/cloud/webdav/write-backup': writeWebDAVBackup,
  '/api/cloud/webdav/read-backup': readWebDAVBackup,
  '/api/cloud/webdav/delete-backup': deleteWebDAVBackup,
  '/api/cloud/webdav/get-sync-manifest': getWebDAVSyncManifest,
  '/api/cloud/webdav/save-sync-manifest': saveWebDAVSyncManifest,
  '/api/cloud/webdav/list-sync-snapshots': listWebDAVSyncSnapshots,
  '/api/cloud/webdav/read-sync-snapshot': readWebDAVSyncSnapshot,
  '/api/cloud/webdav/save-sync-snapshot': saveWebDAVSyncSnapshot,
  '/api/cloud/webdav/delete-sync-snapshot': deleteWebDAVSyncSnapshot,
  '/api/cloud/webdav/sync-v2/read': readWebDAVSyncV2Object,
  '/api/cloud/webdav/sync-v2/write': writeWebDAVSyncV2Object,
  '/api/cloud/webdav/sync-v2/list': listWebDAVSyncV2Objects,
  '/api/cloud/webdav/sync-v2/stat': statWebDAVSyncV2Object,
  '/api/cloud/webdav/sync-v2/delete': deleteWebDAVSyncV2Object,
  '/api/ai/test-config': testAIConfig,
  '/api/ai/test-model': testAIModel,
  '/api/ai/models': getAIModels,
  '/api/ai/generate': generateAI,
  '/api/ai/intelligent-test': intelligentTest
};

const streamingApiRoutes = {
  '/api/ai/generate-stream': generateAIStream
};

async function handleApi(req, res, pathname) {
  const route = apiRoutes[pathname];
  if (!route) {
    sendApiError(res, new Error('API route not found'), 404);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const data = await route(body);
    sendApiSuccess(res, data);
  } catch (error) {
    sendApiError(res, error);
  }
}

async function handleStreamingApi(req, res, pathname) {
  const route = streamingApiRoutes[pathname];
  if (!route) {
    sendApiError(res, new Error('API route not found'), 404);
    return;
  }

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const body = await readJsonBody(req);
    sendStreamHeaders(res);
    const result = await route(
      body,
      (charCount, partialContent) => writeStreamEvent(res, {
        type: 'progress',
        charCount,
        partialContent
      }),
      abortController.signal
    );
    await writeStreamEvent(res, { type: 'done', result });
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendApiError(res, error);
      return;
    }
    await writeStreamEvent(res, {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
    res.end();
  }
}

function getContentType(filePath) {
  const ext = Path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const relative = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  let filePath = Path.resolve(WEB_ROOT, relative);
  const webRoot = Path.resolve(WEB_ROOT);

  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${Path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = Path.join(webRoot, 'index.html');
  }

  fs.createReadStream(filePath)
    .on('error', () => {
      res.writeHead(404);
      res.end('Not Found');
    })
    .once('open', () => {
      res.writeHead(200, {
        'Content-Type': getContentType(filePath),
        'Cache-Control': Path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      });
    })
    .pipe(res);
}

function handleWebRequest(req, res, options = {}) {
  const serveStaticFiles = options.serveStaticFiles !== false;
  const next = typeof options.next === 'function' ? options.next : null;
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    if (req.method !== 'POST') {
      sendApiError(res, new Error('Method Not Allowed'), 405);
      return true;
    }

    if (streamingApiRoutes[requestUrl.pathname]) {
      void handleStreamingApi(req, res, requestUrl.pathname);
      return true;
    }

    void handleApi(req, res, requestUrl.pathname);
    return true;
  }

  if (!serveStaticFiles) {
    if (next) {
      next();
    }
    return false;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return true;
  }

  serveStatic(req, res, requestUrl.pathname);
  return true;
}

function createWebRequestHandler(options = {}) {
  return (req, res, next) => {
    handleWebRequest(req, res, {
      ...options,
      next
    });
  };
}

function createWebServer(options = {}) {
  return http.createServer(createWebRequestHandler({
    serveStaticFiles: true,
    ...options
  }));
}

if (require.main === module) {
  const server = createWebServer();
  server.listen(PORT, () => {
    console.log(`[web] AI Gist Web server listening on http://0.0.0.0:${PORT}`);
    console.log(`[web] Serving static assets from ${WEB_ROOT}`);
  });
}

module.exports = {
  createWebRequestHandler,
  createWebServer,
  handleWebRequest
};
