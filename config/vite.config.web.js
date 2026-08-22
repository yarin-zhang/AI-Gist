// @ts-nocheck
const Path = require('path');
const vuePlugin = require('@vitejs/plugin-vue')
const { version } = require('../package.json');

const { defineConfig } = require('vite');

// 本文件位于 config/，所有路径都以仓库根目录为基准
const Root = Path.join(__dirname, '..');

function aiGistWebBackendPlugin() {
    let apiHandler = null;

    const getApiHandler = () => {
        if (!apiHandler) {
            const { createWebRequestHandler } = require('../scripts/web-server.js');
            apiHandler = createWebRequestHandler({ serveStaticFiles: false });
        }
        return apiHandler;
    };

    const installMiddleware = server => {
        server.middlewares.use((req, res, next) => {
            if (!req.url || !req.url.startsWith('/api/')) {
                next();
                return;
            }

            getApiHandler()(req, res, next);
        });
    };

    return {
        name: 'ai-gist-web-backend',
        configureServer: installMiddleware,
        configurePreviewServer: installMiddleware,
    };
}

const config = defineConfig({
    root: Path.join(Root, 'src', 'renderer'),
    publicDir: 'public',
    server: {
        port: 8080,
    },
    open: false,
    build: {
        outDir: Path.join(Root, 'build', 'web'),
        emptyOutDir: true,
    },
    plugins: [vuePlugin(), aiGistWebBackendPlugin()],
    define: {
        '__PLATFORM__': JSON.stringify('web'),
        '__APP_PLATFORM__': JSON.stringify('web'),
        '__APP_VERSION__': JSON.stringify(version)
    },
    resolve: {
        alias: {
            '@renderer': Path.resolve(Root, 'src/renderer'),
            '@shared': Path.resolve(Root, 'src/shared'),
            '@main': Path.resolve(Root, 'src/main'),
            '@root': Path.resolve(Root, 'src'),
            '@': Path.resolve(Root, 'src/renderer'),
            '~': Path.resolve(Root, 'src/renderer'),
        }
    }
});

module.exports = config;
