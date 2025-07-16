<template>
  <!-- 这是一个无渲染组件，只负责监听快捷键事件 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// 清理函数引用
let cleanupInsertData: (() => void) | null = null;

onMounted(() => {
  // 监听插入数据快捷键
  cleanupInsertData = window.electronAPI.shortcuts.onInsertData(() => {
    console.log('快捷键触发：插入数据');
    // 这里可以添加插入预设数据的逻辑
  });
  
  // 监听提示词触发器快捷键
  const cleanupTriggerPrompt = window.electronAPI.shortcuts.onTriggerPrompt((promptId: number) => {
    console.log(`快捷键触发：提示词触发器 ${promptId}`);
    // 这里可以添加触发特定提示词的逻辑
  });
  
  // 保存清理函数
  return () => {
    if (cleanupTriggerPrompt) {
      cleanupTriggerPrompt();
    }
  };
});

onUnmounted(() => {
  // 清理事件监听器
  if (cleanupInsertData) {
    cleanupInsertData();
  }
});
</script> 