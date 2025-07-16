import { ref } from 'vue';
import { apiClientManager } from '@/lib/api';

/**
 * 快捷键插入提示词功能
 */
export function useShortcutInsert() {
  const isInserting = ref(false);

  /**
   * 插入提示词到当前输入框
   * @param promptId 提示词ID
   */
  const insertPrompt = async (promptId: number) => {
    if (isInserting.value) return;
    
    try {
      isInserting.value = true;
      
      // 获取提示词内容
      const prompt = await apiClientManager.prompt.prompts.getById.query(promptId);
      
      if (!prompt) {
        console.error('提示词不存在:', promptId);
        return;
      }

      // 查找当前活跃的输入框或文本域
      const activeElement = document.activeElement;
      let targetElement: HTMLInputElement | HTMLTextAreaElement | null = null;

      // 检查当前活跃元素是否为输入框
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        targetElement = activeElement as HTMLInputElement | HTMLTextAreaElement;
      } else {
        // 如果没有活跃的输入框，智能查找最合适的输入框
        // 优先查找文本域（通常用于长文本输入）
        const textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
          targetElement = textareas[0] as HTMLTextAreaElement;
        } else {
          // 查找文本输入框
          const textInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
          if (textInputs.length > 0) {
            targetElement = textInputs[0] as HTMLInputElement;
          }
        }
      }

      if (targetElement) {
        // 获取当前光标位置
        const start = targetElement.selectionStart || 0;
        const end = targetElement.selectionEnd || 0;
        const currentValue = targetElement.value;

        // 在光标位置插入提示词内容
        const newValue = currentValue.substring(0, start) + prompt.content + currentValue.substring(end);
        targetElement.value = newValue;

        // 设置新的光标位置
        const newCursorPos = start + prompt.content.length;
        targetElement.setSelectionRange(newCursorPos, newCursorPos);

        // 触发输入事件，确保Vue响应式更新
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));

        // 重新聚焦到输入框
        targetElement.focus();

        console.log('成功插入提示词到输入框:', prompt.title || prompt.content.substring(0, 50));
        
        // 显示成功通知
        const event = new CustomEvent('show-notification', {
          detail: {
            type: 'success',
            title: '插入成功',
            message: `已插入提示词: ${prompt.title || prompt.content.substring(0, 30)}...`
          }
        });
        window.dispatchEvent(event);
      } else {
        console.warn('未找到可插入的输入框');
        // 如果找不到输入框，显示通知
        const event = new CustomEvent('show-notification', {
          detail: {
            type: 'warning',
            title: '插入提示词失败',
            message: '请先点击一个输入框，然后再使用快捷键插入提示词。'
          }
        });
        window.dispatchEvent(event);
      }
      
    } catch (error) {
      console.error('插入提示词失败:', error);
    } finally {
      isInserting.value = false;
    }
  };

  /**
   * 监听插入提示词事件
   * @param callback 回调函数
   */
  const onInsertPrompt = (callback: (data: { promptId: number; content: string; title?: string }) => void) => {
    const handler = (event: CustomEvent) => {
      callback(event.detail);
    };
    
    window.addEventListener('insert-prompt', handler as EventListener);
    
    // 返回清理函数
    return () => {
      window.removeEventListener('insert-prompt', handler as EventListener);
    };
  };

  return {
    isInserting,
    insertPrompt,
    onInsertPrompt
  };
} 