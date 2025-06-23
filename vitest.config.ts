import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // 测试环境配置
    environment: 'jsdom',
    
    // 全局设置
    globals: true,
    
    // 设置文件
    setupFiles: ['./test/setup.ts'],
    
    // 包含的测试文件
    include: ['test/**/*.{test,spec}.{js,ts}'],
    
    // 排除的文件
    exclude: [
      'node_modules',
      'build',
      'dist',
      'src/**/*.d.ts'
    ],
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'build/',
        'dist/',
        'test/',
        'scripts/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/vite.config.js'
      ]
    },
    
    // 测试超时设置
    testTimeout: 10000,
    
    // 设置测试根目录
    root: process.cwd(),
    
    // Mock 设置
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    
    // 并行执行设置
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    }
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '~': resolve(__dirname, 'src/renderer'),
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@test': resolve(__dirname, 'test')
    }
  },
  
  // Electron 相关的模拟
  define: {
    __TEST__: true
  }
})
