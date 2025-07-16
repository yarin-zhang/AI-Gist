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

      // 发送插入事件到当前页面
      const event = new CustomEvent('insert-prompt', {
        detail: {
          promptId,
          content: prompt.content,
          title: prompt.title
        }
      });
      
      window.dispatchEvent(event);
      
      console.log('插入提示词:', prompt.title || prompt.content.substring(0, 50));
      
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