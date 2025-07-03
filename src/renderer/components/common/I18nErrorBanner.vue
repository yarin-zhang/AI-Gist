<template>
    <div v-if="hasErrors" class="i18n-error-banner">
        <NAlert type="error" :show-icon="true" :closable="false">
            <template #header>
                <NFlex align="center" size="small">
                    <NIcon>
                        <AlertTriangle />
                    </NIcon>
                    <NText strong>国际化错误检测</NText>
                </NFlex>
            </template>
            <NFlex vertical size="small">
                <NText>检测到 {errorCount} 个国际化错误，请修复后重新加载页面：</NText>
                <div v-for="(error, index) in errors" :key="index" class="error-item">
                    <NText type="error" style="font-family: monospace; font-size: 12px;">
                        {{ error }}
                    </NText>
                </div>
                <NButton size="small" @click="reloadPage" style="margin-top: 8px;">
                    重新加载页面
                </NButton>
            </NFlex>
        </NAlert>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NAlert, NIcon, NText, NButton, NFlex } from 'naive-ui';
import { AlertTriangle } from '@vicons/tabler';

const errors = ref<string[]>([]);
const hasErrors = ref(false);
const errorCount = ref(0);

// 监听 i18n 错误
const setupI18nErrorListener = () => {
    // 重写 console.error 来捕获 i18n 错误
    const originalError = console.error;
    console.error = (...args) => {
        const message = args.join(' ');
        if (message.includes('Message compilation error') ||
            message.includes('vue-i18n') ||
            message.includes('Not allowed nest placeholder')) {

            // 避免重复添加相同的错误
            if (!errors.value.includes(message)) {
                errors.value.push(message);
                errorCount.value = errors.value.length;
                hasErrors.value = true;
            }
        }
        originalError.apply(console, args);
    };

    // 监听全局错误
    window.addEventListener('error', (event) => {
        const message = event.message || event.error?.message || '';
        if (message.includes('Message compilation error') ||
            message.includes('vue-i18n') ||
            message.includes('Not allowed nest placeholder')) {

            if (!errors.value.includes(message)) {
                errors.value.push(message);
                errorCount.value = errors.value.length;
                hasErrors.value = true;
            }
        }
    });

    // 监听未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (event) => {
        const message = event.reason?.message || String(event.reason);
        if (message.includes('Message compilation error') ||
            message.includes('vue-i18n') ||
            message.includes('Not allowed nest placeholder')) {

            if (!errors.value.includes(message)) {
                errors.value.push(message);
                errorCount.value = errors.value.length;
                hasErrors.value = true;
            }
        }
    });
};

const reloadPage = () => {
    window.location.reload();
};

onMounted(() => {
    setupI18nErrorListener();
});
</script>

<style scoped>
.i18n-error-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    padding: 16px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 2px solid var(--error-color);
}

.error-item {
    background: var(--error-color-suppl);
    padding: 8px;
    border-radius: 4px;
    margin: 4px 0;
    border-left: 3px solid var(--error-color);
}

/* 深色主题适配 */
[data-theme="dark"] .i18n-error-banner {
    background: rgba(0, 0, 0, 0.95);
}
</style>