<template>
  <div class="shortcut-settings">
    <NFlex vertical :size="16">

      <!-- 全局快捷键设置 -->
      <NCard title="全局快捷键">
        <NFlex vertical :size="16">
          <!-- 显示界面快捷键 -->
          <NFlex justify="space-between" align="center">
            <NFlex vertical :size="4">
              <NText depth="2" style="font-size: 14px;">{{ t('shortcuts.showInterface') }}</NText>
              <NText depth="3" style="font-size: 12px;">{{ t('shortcuts.showInterfaceDesc') }}</NText>
            </NFlex>
            <NFlex align="center" :size="8">
              <NSwitch v-model:value="shortcuts.showInterface.enabled" />
              <NInput 
                v-model:value="shortcuts.showInterface.key" 
                :placeholder="t('shortcuts.enterShortcut')"
                style="width: 150px;"
                @keydown="handleKeyDown($event, 'showInterface')"
                readonly
              />
            </NFlex>
          </NFlex>

          <!-- 插入数据快捷键 -->
          <NFlex justify="space-between" align="center">
            <NFlex vertical :size="4">
              <NText depth="2" style="font-size: 14px;">{{ t('shortcuts.insertData') }}</NText>
              <NText depth="3" style="font-size: 12px;">{{ t('shortcuts.insertDataDesc') }}</NText>
            </NFlex>
            <NFlex align="center" :size="8">
              <NSwitch v-model:value="shortcuts.insertData.enabled" />
              <NInput 
                v-model:value="shortcuts.insertData.key" 
                :placeholder="t('shortcuts.enterShortcut')"
                style="width: 150px;"
                @keydown="handleKeyDown($event, 'insertData')"
                readonly
              />
            </NFlex>
          </NFlex>
        </NFlex>
      </NCard>

      <!-- 操作按钮 -->
      <NFlex justify="space-between">
        <NButton @click="resetToDefault">
          <template #icon>
            <NIcon>
              <Refresh />
            </NIcon>
          </template>
          {{ t('shortcuts.resetToDefault') }}
        </NButton>
        <NButton type="primary" @click="saveShortcuts" :loading="saving">
          <template #icon>
            <NIcon>
              <DeviceFloppy />
            </NIcon>
          </template>
          {{ t('shortcuts.save') }}
        </NButton>
      </NFlex>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NFlex,
  NText,
  NButton,
  NIcon,
  NCard,
  NInput,
  NSwitch,
  NEmpty,
  useMessage
} from 'naive-ui'
import { DeviceFloppy, Refresh, Trash } from '@vicons/tabler'
import type { ShortcutConfig } from '@shared/types/preferences'

interface Props {
  modelValue: {
    showInterface: ShortcutConfig;
    insertData: ShortcutConfig;
    promptTriggers: ShortcutConfig[];
  };
}

interface Emits {
  (e: 'update:model-value', value: any): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n();
const message = useMessage();

const saving = ref(false);

// 快捷键配置
const shortcuts = reactive({
  showInterface: { ...props.modelValue.showInterface },
  insertData: { ...props.modelValue.insertData },
  promptTriggers: [...props.modelValue.promptTriggers]
});

// 处理按键输入
const handleKeyDown = (event: KeyboardEvent, type: string, index?: number) => {
  event.preventDefault();
  
  const keys: string[] = [];
  
  if (event.ctrlKey) keys.push('Ctrl');
  if (event.shiftKey) keys.push('Shift');
  if (event.altKey) keys.push('Alt');
  if (event.metaKey) keys.push('Meta');
  
  // 添加主键
  if (event.key && event.key !== 'Control' && event.key !== 'Shift' && event.key !== 'Alt' && event.key !== 'Meta') {
    keys.push(event.key.toUpperCase());
  }
  
  if (keys.length > 0) {
    const keyCombination = keys.join('+');
    
    if (type === 'showInterface') {
      shortcuts.showInterface.key = keyCombination;
    } else if (type === 'insertData') {
      shortcuts.insertData.key = keyCombination;
    } else if (type === 'promptTrigger' && index !== undefined) {
      shortcuts.promptTriggers[index].key = keyCombination;
    }
  }
};

// 移除提示词快捷键
const removePromptTrigger = (index: number) => {
  shortcuts.promptTriggers.splice(index, 1);
};

// 重置为默认值
const resetToDefault = () => {
  shortcuts.showInterface = {
    key: 'Ctrl+Shift+G',
    description: '显示界面',
    enabled: true,
    type: 'show-interface'
  };
  shortcuts.insertData = {
    key: 'Ctrl+Shift+I',
    description: '插入数据',
    enabled: true,
    type: 'insert-data'
  };
  shortcuts.promptTriggers = [];
  
  message.success(t('shortcuts.resetSuccess'));
};

// 保存快捷键设置
const saveShortcuts = async () => {
  saving.value = true;
  try {
    // 验证快捷键是否重复
    const allKeys = [
      shortcuts.showInterface.key,
      shortcuts.insertData.key,
      ...shortcuts.promptTriggers.map(t => t.key)
    ].filter(key => key && shortcuts.showInterface.enabled || shortcuts.insertData.enabled || shortcuts.promptTriggers.some(t => t.enabled));
    
    const uniqueKeys = new Set(allKeys);
    if (uniqueKeys.size !== allKeys.length) {
      message.error(t('shortcuts.duplicateKeys'));
      return;
    }
    
    // 发送更新事件
    emit('update:model-value', {
      showInterface: shortcuts.showInterface,
      insertData: shortcuts.insertData,
      promptTriggers: shortcuts.promptTriggers
    });
    
    message.success(t('shortcuts.saveSuccess'));
  } catch (error) {
    console.error('保存快捷键设置失败:', error);
    message.error(t('shortcuts.saveFailed'));
  } finally {
    saving.value = false;
  }
};

// 监听props变化
onMounted(() => {
  // 初始化快捷键配置
  Object.assign(shortcuts, props.modelValue);
});
</script>

<style scoped>
</style> 