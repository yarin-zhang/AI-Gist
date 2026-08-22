// @ts-nocheck
const Path = require('path');
const vuePlugin = require('@vitejs/plugin-vue')
const { version } = require('../package.json');

const { defineConfig } = require('vite');

// 本文件位于 config/，所有路径都以仓库根目录为基准
const Root = Path.join(__dirname, '..');

/**
 * Vite 配置 - 移动端构建
 * https://vitejs.dev/config
 */
const config = defineConfig({
    root: Path.join(Root, 'src', 'renderer'),
    publicDir: 'public',
    server: {
        port: 8080,
    },
    open: false,
    build: {
        outDir: Path.join(Root, 'build', 'renderer'),
        emptyOutDir: true,
    },
    esbuild: {
        charset: 'utf8',
    },
    plugins: [vuePlugin()],
    resolve: {
        alias: {
            '@renderer': Path.resolve(Root, 'src/renderer'),
            '@shared': Path.resolve(Root, 'src/shared'),
            '@main': Path.resolve(Root, 'src/main'),
            '@root': Path.resolve(Root, 'src'),
            '@': Path.resolve(Root, 'src/renderer'),
            '~': Path.resolve(Root, 'src/renderer'),
        }
    },
    define: {
        // 定义环境变量，用于区分移动端和桌面端
        '__PLATFORM__': JSON.stringify('mobile'),
        '__APP_PLATFORM__': JSON.stringify('mobile'),
        '__APP_VERSION__': JSON.stringify(version)
    }
});

module.exports = config;
