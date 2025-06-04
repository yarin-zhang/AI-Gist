// @ts-nocheck
const Path = require('path');
const vuePlugin = require('@vitejs/plugin-vue')

const { defineConfig } = require('vite');

/**
 * https://vitejs.dev/config
 */
const config = defineConfig({
    root: Path.join(__dirname, 'src', 'renderer'),
    publicDir: 'public',
    main: {
        // 调整 envPrefix 以解决 Electron + Prisma 构建问题
        // 参考：https://github.com/prisma/prisma/discussions/21027
        envPrefix: 'M_VITE_'
    },
    server: {
        port: 8080,
    },
    open: false,
    build: {
        outDir: Path.join(__dirname, 'build', 'renderer'),
        emptyOutDir: true,
        rollupOptions: {
            external: ['@prisma/client', '.prisma/client/default'],
        },
    },
    plugins: [vuePlugin()],
});

module.exports = config;
