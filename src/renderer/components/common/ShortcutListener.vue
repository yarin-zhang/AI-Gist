<template>
  <!-- 这是一个无渲染组件，只负责监听快捷键事件 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// 清理函数引用
let cleanupInsertData: (() => void) | null = null;
let cleanupTriggerPrompt: (() => void) | null = null;

onMounted(() => {
  // 注册默认快捷键
  window.electronAPI.shortcuts.registerDefaults();
  
  // 监听插入数据快捷键
  cleanupInsertData = window.electronAPI.shortcuts.onInsertData(() => {
    console.log('快捷键触发：插入数据');
    // 这里可以添加插入预设数据的逻辑
  });
  
  // 监听快捷键触发提示词
  cleanupTriggerPrompt = window.electronAPI.shortcuts.onTriggerPrompt((data) => {
    console.log('快捷键触发提示词:', data);
    handleShortcutPrompt(data);
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

// 处理快捷键触发的提示词
const handleShortcutPrompt = (data: { promptId: string; content: string }) => {
  // 查找当前活动的输入框并粘贴内容
  const activeElement = document.activeElement;
  
  if (activeElement && isInputElement(activeElement)) {
    // 在光标位置插入内容
    const textarea = activeElement as HTMLTextAreaElement | HTMLInputElement;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = textarea.value;
    
    // 插入内容
    textarea.value = value.substring(0, start) + data.content + value.substring(end);
    
    // 设置光标位置到插入内容的末尾
    const newCursorPos = start + data.content.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    // 触发input事件
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('内容已插入到输入框');
  } else {
    // 如果没有活动的输入框，显示提示
    console.log('没有找到活动的输入框');
  }
};

// 检查元素是否为输入元素
const isInputElement = (element: Element): boolean => {
  const tagName = element.tagName.toLowerCase();
  const inputTypes = ['input', 'textarea'];
  return inputTypes.includes(tagName);
};
</script> 