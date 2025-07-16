<template>
  <!-- 这是一个无渲染组件，只负责处理通知 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useMessage } from 'naive-ui';

const message = useMessage();

// 清理函数引用
let cleanupNotification: (() => void) | null = null;

onMounted(() => {
  // 监听通知事件
  cleanupNotification = () => {
    window.removeEventListener('show-notification', handleNotification as EventListener);
  };
  
  window.addEventListener('show-notification', handleNotification as EventListener);
});

onUnmounted(() => {
  // 清理事件监听器
  if (cleanupNotification) {
    cleanupNotification();
  }
});

// 处理通知事件
const handleNotification = (event: CustomEvent) => {
  const { type, title, message: msg } = event.detail;
  
  switch (type) {
    case 'success':
      message.success(msg);
      break;
    case 'warning':
      message.warning(msg);
      break;
    case 'error':
      message.error(msg);
      break;
    case 'info':
      message.info(msg);
      break;
    default:
      message.info(msg);
  }
};
</script> 