// @ts-nocheck
const Path = require('path');
const vuePlugin = require('@vitejs/plugin-vue')
const { version } = require('../package.json');

const { defineConfig } = require('vite');

// 本文件位于 config/，所有路径都以仓库根目录为基准
const Root = Path.join(__dirname, '..');

/**
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
    plugins: [vuePlugin()],
    define: {
        '__PLATFORM__': JSON.stringify('electron'),
        '__APP_PLATFORM__': JSON.stringify('electron'),
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
