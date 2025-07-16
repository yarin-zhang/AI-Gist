<template>
  <!-- 这是一个无渲染组件，只负责监听快捷键事件 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/composables/useI18n';
import { useShortcutInsert } from '@/composables/useShortcutInsert';

const { t } = useI18n();
const { insertPrompt } = useShortcutInsert();

// 清理函数引用
let cleanupInsertData: (() => void) | null = null;
let cleanupTriggerPrompt: (() => void) | null = null;

onMounted(() => {
  // 监听插入数据快捷键
  cleanupInsertData = window.electronAPI.shortcuts.onInsertData(async (promptId?: number) => {
    console.log('快捷键触发：插入数据', promptId);
    
    if (promptId) {
      console.log(`插入提示词ID: ${promptId}`);
      await insertPrompt(promptId);
    }
  });
  
  // 监听提示词触发器快捷键
  cleanupTriggerPrompt = window.electronAPI.shortcuts.onTriggerPrompt(async (promptId: number) => {
    console.log(`快捷键触发：提示词触发器 ${promptId}`);
    await insertPrompt(promptId);
  });
});

onUnmounted(() => {
  // 清理事件监听器
  if (cleanupInsertData) {
    cleanupInsertData();
  }
  if (cleanupTriggerPrompt) {
    cleanupTriggerPrompt();
  }
});
</script> 