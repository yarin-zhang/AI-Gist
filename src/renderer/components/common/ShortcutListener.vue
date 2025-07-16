<template>
  <!-- 这是一个无渲染组件，只负责监听快捷键事件 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// 清理函数引用
let cleanupCopyPrompt: (() => void) | null = null;
let cleanupTriggerPrompt: (() => void) | null = null;

onMounted(() => {
  // 监听复制提示词快捷键
  cleanupCopyPrompt = window.electronAPI.shortcuts.onInsertData(async (promptId?: number) => {
    console.log('快捷键触发：复制提示词', promptId);
    
    if (promptId) {
      console.log(`复制提示词ID: ${promptId}`);
      // 这里不需要做任何操作，因为主进程已经处理了复制到剪贴板
    }
  });
  
  // 监听提示词触发器快捷键
  cleanupTriggerPrompt = window.electronAPI.shortcuts.onTriggerPrompt(async (promptId: number) => {
    console.log(`快捷键触发：提示词触发器 ${promptId}`);
    // 这里不需要做任何操作，因为主进程已经处理了复制到剪贴板
  });
});

onUnmounted(() => {
  // 清理事件监听器
  if (cleanupCopyPrompt) {
    cleanupCopyPrompt();
  }
  if (cleanupTriggerPrompt) {
    cleanupTriggerPrompt();
  }
});
</script> 