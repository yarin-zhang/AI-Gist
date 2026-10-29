# AI Gist Web 本地部署与多端差异说明

本文档说明如何用 Docker 在本地部署 AI Gist Web 版，以及 Web、桌面端、移动端之间的能力差异。它面向部署者和后续维护者，优先记录当前代码中已经实现的事实。

## 一、适用范围

AI Gist 目前有三类运行形态：

- 桌面端：Electron + Vue 3，包含 Electron 主进程能力。
- 移动端：当前仓库实现为 Capacitor + Vue 3，目标平台为 iOS 和 Android。
- Web 端：Vue 3 渲染层 + Node.js 同源后端，通过 Docker 在本地部署；桌面浏览器使用桌面壳，移动浏览器使用移动壳。

Web 端不是公网 SaaS 版，也不提供多用户账号系统。它的设计目标是让用户可以在自己的电脑、局域网或受控服务器上运行一个浏览器版本，同时用 Web 后端补齐浏览器无法直接完成的 WebDAV 和 AI 代理能力。

## 二、Web 版架构

Web 部署由两个部分组成：

- 前端静态资源：`yarn build:web` 生成到 `build/web`。
- Web 后端：`scripts/web-server.js`，负责静态资源托管、WebDAV 代理和 AI 代理。

Docker 镜像使用 `docker/Dockerfile.web` 构建：

1. `deps` 阶段安装依赖。
2. `build` 阶段执行 `yarn build:web`。
3. `runtime` 阶段复制 `build/web`、`node_modules` 和 `scripts/web-server.js`，用 Node.js 监听 `PORT`。

默认端口是 `8080`。容器内静态资源目录为 `/app/build/web`。

## 三、快速部署

### 1. 环境要求

- Docker Engine 或 Docker Desktop。
- 可以访问 npm/Yarn 依赖源和 Docker Hub。
- 一个现代浏览器。
- 可选：WebDAV 服务，用于云端备份和同步。
- 可选：AI 服务 API Key，用于 AI 生成、模型测试和智能测试。

### 2. 使用 Docker Compose 启动

在仓库根目录执行：

```bash
docker compose -f docker-compose.web.yml up -d --build
```

启动后访问：

```text
http://localhost:8080
```

检查 Web 后端能力：

```bash
curl -s http://127.0.0.1:8080/api/capabilities \
  -H 'Content-Type: application/json' \
  -d '{}'
```

预期返回类似：

```json
{
  "success": true,
  "data": {
    "webBackend": true,
    "aiProxy": true,
    "webdavProxy": true,
    "staticRoot": "/app/build/web"
  }
}
```

查看日志：

```bash
docker compose -f docker-compose.web.yml logs -f
```

停止服务：

```bash
docker compose -f docker-compose.web.yml down
```

### 3. 使用 docker run 启动

也可以手动构建并运行镜像：

```bash
docker build -f docker/Dockerfile.web -t ai-gist-web:local .
docker run --rm -p 8080:8080 --name ai-gist-web ai-gist-web:local
```

如果需要换端口，例如宿主机使用 `18080`：

```bash
docker run --rm -p 18080:8080 --name ai-gist-web ai-gist-web:local
```

然后访问：

```text
http://localhost:18080
```

## 四、更新部署

拉取或切换到新代码后，重新构建并启动：

```bash
docker compose -f docker-compose.web.yml up -d --build
```

如果怀疑 Docker 缓存导致旧资源残留，可以强制重新构建：

```bash
docker compose -f docker-compose.web.yml build --no-cache
docker compose -f docker-compose.web.yml up -d
```

确认新容器已经运行：

```bash
docker compose -f docker-compose.web.yml ps
```

## 五、Web 端数据与安全边界

### 1. 本地数据在哪里

Web 端没有 Electron 主进程，也没有应用专属的本机文件目录。主要数据保存在浏览器侧：

- 提示词、分类、AI 配置、历史记录等业务数据：IndexedDB。
- Web 端偏好设置：`localStorage`，key 为 `ai-gist:web:user-preferences`。
- WebDAV 存储配置：`localStorage`，key 为 `ai-gist:web:cloud-storage-configs`。
- Web 本地备份列表：`localStorage`，key 为 `ai-gist:web:local-backups`。

这意味着同一个 Web 服务地址在不同浏览器、不同浏览器 Profile、不同设备中会拥有不同的本地数据。跨设备共享应使用 WebDAV 云端备份/同步。

### 2. WebDAV 数据在哪里

WebDAV 远端目录固定为：

```text
AI-Gist-Backup
```

Web 端通过同源 Web 后端访问 WebDAV，涉及以下能力：

- 测试 WebDAV 连接。
- 列出云端备份。
- 创建、读取、删除云端备份。
- 读取和保存云同步 manifest。

Web 端不支持 iCloud Drive，请使用 WebDAV。

### 3. AI API Key 如何流转

Web 端浏览器把用户配置的 AI 服务信息发送给同源 Web 后端，由 Web 后端请求真实 AI 服务。这样可以绕过浏览器 CORS 限制，并统一 OpenAI-compatible、Anthropic、Google、Ollama 等服务的调用入口。

注意：

- Web 后端当前不持久化 AI Key。
- AI Key 会存在浏览器本地数据库/存储中，取决于用户在应用中保存的 AI 配置。
- 如果把 Web 服务暴露到局域网或公网，必须自行加 TLS、访问控制和网络隔离。
- 不建议把当前 Web 服务裸露到公网。

## 六、Web 后端 API

所有 `/api/*` 接口仅接受 `POST`。

基础能力：

- `/api/capabilities`

WebDAV 代理：

- `/api/cloud/webdav/test`
- `/api/cloud/webdav/list-backups`
- `/api/cloud/webdav/write-backup`
- `/api/cloud/webdav/read-backup`
- `/api/cloud/webdav/delete-backup`
- `/api/cloud/webdav/get-sync-manifest`
- `/api/cloud/webdav/save-sync-manifest`

AI 代理：

- `/api/ai/test-config`
- `/api/ai/test-model`
- `/api/ai/models`
- `/api/ai/generate`
- `/api/ai/generate-stream`
- `/api/ai/intelligent-test`

`/api/ai/generate-stream` 返回 `application/x-ndjson`，事件形态包括：

```json
{"type":"progress","charCount":13,"partialContent":"partial text"}
{"type":"done","result":{"generatedPrompt":"final text"}}
```

## 七、多端能力差异

平台能力由 `src/shared/platform.ts` 的 `PlatformDetector.getCapabilities()` 统一描述。产品 UI 应尽量根据能力矩阵隐藏或改写不可用功能，而不是让用户点到失败。

| 能力 | Electron 桌面端 | iOS/Android 移动端 | Web Docker 端 |
|------|-----------------|--------------------|---------------|
| 主 UI 壳 | 桌面壳 | 移动壳 | 桌面浏览器为桌面壳，移动浏览器为移动壳 |
| 本地数据库 | 支持，IndexedDB | 支持，IndexedDB | 支持，IndexedDB |
| 用户偏好 | Electron IPC/本地偏好 | Capacitor Preferences/适配层 | `localStorage` |
| 文件导入 | 系统文件选择器 | 移动端适配 | 浏览器文件选择器 |
| 文件导出 | 系统保存对话框 | 移动端适配 | 浏览器下载 |
| 本地备份目录 | 支持打开本机目录 | 不支持 | 不支持 |
| 外部链接 | Electron shell | 系统浏览器/移动系统 | `window.open` |
| 全局快捷键 | 支持 | 不支持 | 不支持 |
| 系统托盘 | 支持 | 不支持 | 不支持 |
| 开机启动 | 支持 | 不支持 | 不支持 |
| 系统代理设置 | 支持 | 不支持 | 不支持 |
| Electron 自动更新 | 支持 | 不支持 | 不支持 |
| 云端备份 | 支持 | 支持 | 支持 |
| WebDAV 同步 | 支持 | 支持 | 支持 |
| iCloud Drive | 支持 | iOS 支持，Android 不支持 | 不支持 |
| AI 生成 | 支持 | 支持 | 支持 |
| AI 请求通道 | Electron 主进程原生服务 | 移动端直接请求/移动适配 | Web 后端代理 |
| AI 流式生成 | 支持 | 支持 | 支持，经 `/api/ai/generate-stream` |

## 八、Web 端隐藏或改写的功能

Web 端没有 Electron 主进程，所以以下桌面专属功能会隐藏或降级；在移动浏览器中，Web 端会使用移动布局，但平台能力仍然是 Web 能力：

- 快捷键设置。
- 启动行为设置。
- 网络代理设置。
- 打开本地备份目录。
- iCloud Drive 选项。
- Electron 自动更新检查。

Web 端对应替代方案：

- 数据导入使用浏览器文件选择器。
- 数据导出使用浏览器下载。
- 云备份和同步仅使用 WebDAV。
- 外链通过浏览器新标签打开。
- AI 生成通过同源 Web 后端代理。

## 九、反向代理建议

本地单机使用时，直接访问 `http://localhost:8080` 即可。

如果要给局域网设备访问，建议放在反向代理后面：

- 启用 HTTPS。
- 添加访问控制，例如局域网白名单、Basic Auth、VPN 或其他身份验证。
- 不要让未授权用户访问同一个 Web 服务地址。
- 明确告知用户：浏览器本地数据按浏览器 Profile 隔离，WebDAV 才是跨设备同步通道。

示例 Nginx 片段：

```nginx
server {
    listen 443 ssl;
    server_name ai-gist.local;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 十、常见问题

### Docker daemon 连接失败

报错类似：

```text
Cannot connect to the Docker daemon
```

处理方式：

- macOS/Windows：启动 Docker Desktop。
- Linux：确认 Docker 服务运行中，并且当前用户有权限访问 Docker socket。

### 端口 8080 被占用

修改 `docker-compose.web.yml`：

```yaml
ports:
  - "18080:8080"
```

然后访问 `http://localhost:18080`。

### WebDAV 连接失败

检查：

- WebDAV URL、用户名、密码是否正确。
- WebDAV 服务是否允许创建目录和写入文件。
- Docker 容器是否能访问 WebDAV 地址。
- 如果 WebDAV 使用自签名证书，容器内 Node.js 可能拒绝连接；建议使用受信任证书。

### AI 模型列表为空或测试失败

检查：

- API Key 是否正确。
- Base URL 是否包含正确的 `/v1` 路径。
- 本地模型服务是否能从容器访问。
- 宿主机上的 Ollama/LM Studio 可以尝试使用 `host.docker.internal` 作为容器访问宿主机的地址。

### 刷新页面后数据看起来丢失

先确认是否换了浏览器、浏览器 Profile、域名、端口或协议。浏览器会按 origin 隔离 IndexedDB 和 `localStorage`。例如下面两个地址的数据互相隔离：

```text
http://localhost:8080
http://127.0.0.1:8080
```

### Web 端为什么没有 iCloud

iCloud Drive 依赖桌面或 iOS 原生能力。Web Docker 端运行在浏览器 + Node.js 服务中，没有用户系统级 iCloud Drive 授权和文件系统集成，因此只保留 WebDAV。

## 十一、部署后验收清单

每次改动 Web 部署相关代码后，至少执行：

```bash
yarn build:web
node --check scripts/web-server.js
docker compose -f docker-compose.web.yml config
docker build -f docker/Dockerfile.web -t ai-gist-web:local .
docker run --rm -p 18080:8080 --name ai-gist-web-test ai-gist-web:local
```

在另一个终端检查：

```bash
curl -i http://127.0.0.1:18080/
curl -s http://127.0.0.1:18080/api/capabilities \
  -H 'Content-Type: application/json' \
  -d '{}'
```

验证完成后停止测试容器：

```bash
docker stop ai-gist-web-test
```

如果改动了平台能力、云备份或 AI 生成，还应执行：

```bash
yarn test:run
node scripts/build.js
yarn vite build --config config/vite.config.mobile.js
```

## 十二、维护原则

- 新增功能时先决定能力属于平台能力矩阵中的哪一项。
- Electron-only 能力不要在 Web UI 中裸露；应隐藏、降级或提供 Web 替代实现。
- Web 后端只补齐浏览器缺失的系统/网络能力，不承担账号、多租户或长期服务端数据存储。
- 跨端同步以 WebDAV/iCloud 等用户自有云存储为边界，默认保持本地优先。
- 文档中的部署命令应和 `docker/Dockerfile.web`、`docker-compose.web.yml`、`package.json` 中的脚本保持同步。
