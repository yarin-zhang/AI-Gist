<template>
    <div class="shortcut-settings">
        <NFlex vertical>
            <!-- 权限提示 -->
            <NCard v-if="permissionStatus && !permissionStatus.hasPermission" size="small" type="warning">
                <NFlex vertical size="small">
                    <NText strong style="color: #f0a020;">⚠️ {{ t('shortcuts.permissionRequired') }}</NText>
                    <NText depth="3" style="font-size: 12px;">
                        {{ permissionStatus.message }}
                    </NText>
                    <NFlex size="small">
                        <NButton size="small" @click="openSystemPreferences">
                            {{ t('shortcuts.openSystemPreferences') }}
                        </NButton>
                        <NButton size="small" @click="checkPermissions">
                            {{ t('shortcuts.retryCheck') }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </NCard>

            <NCard size="small">
                <NFlex vertical>
                    <!-- 显示界面快捷键 -->
                    <NFlex vertical size="small">
                        <NFlex align="center" size="small">
                            <NText strong>{{ t('shortcuts.showInterface') }}</NText>
                            <NText v-if="permissionStatus?.hasPermission" depth="3" style="font-size: 12px; color: #18a058;">
                                ✓ {{ t('shortcuts.registered') }}
                            </NText>
                            <NText v-else depth="3" style="font-size: 12px; color: #d03050;">
                                ✗ {{ t('shortcuts.notRegistered') }}
                            </NText>
                        </NFlex>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('shortcuts.showInterfaceDesc') }}
                        </NText>
                        <NInput v-model:value="showInterfaceShortcut" :placeholder="t('shortcuts.clickToInput')" readonly
                            @click="startCaptureShortcut('showInterface')"
                            :class="{ 'capturing': capturingType === 'showInterface' }" />
                    </NFlex>

                    <!-- 复制提示词快捷键 -->
                    <NFlex vertical size="small">
                        <NFlex align="center" size="small">
                            <NText strong>{{ t('shortcuts.copyPrompt') }}</NText>
                            <NText v-if="permissionStatus?.hasPermission" depth="3" style="font-size: 12px; color: #18a058;">
                                ✓ {{ t('shortcuts.registered') }}
                            </NText>
                            <NText v-else depth="3" style="font-size: 12px; color: #d03050;">
                                ✗ {{ t('shortcuts.notRegistered') }}
                            </NText>
                        </NFlex>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('shortcuts.copyPromptDesc') }}
                        </NText>
                        <NInput v-model:value="copyPromptShortcut" :placeholder="t('shortcuts.clickToInput')" readonly
                            @click="startCaptureShortcut('copyPrompt')"
                            :class="{ 'capturing': capturingType === 'copyPrompt' }" />
                        
                        <!-- 选择复制的提示词 -->
                        <NFlex vertical size="small">
                            <NFlex align="center" size="small">
                                <NText strong>{{ t('shortcuts.selectPrompt') }}</NText>
                                <NButton 
                                    size="tiny" 
                                    type="primary" 
                                    ghost
                                    @click="loadPromptOptions" 
                                    :loading="loadingPrompts"
                                    style="margin-left: 8px;">
                                    <template #icon>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                            <path d="M21 3v5h-5"></path>
                                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                            <path d="M3 21v-5h5"></path>
                                        </svg>
                                    </template>
                                    {{ t('shortcuts.refreshPrompts') }}
                                </NButton>
                            </NFlex>
                            <NText depth="3" style="font-size: 12px;">
                                {{ t('shortcuts.selectPromptDesc') }}
                            </NText>
                            <NSelect 
                                v-model:value="selectedPromptId" 
                                :options="promptOptions"
                                :placeholder="promptOptions.length === 0 ? t('shortcuts.noPromptsAvailable') : t('shortcuts.selectPromptPlaceholder')"
                                @update:value="onPromptSelected"
                                filterable
                                remote
                                :loading="loadingPrompts"
                                clearable />
                            
                            <!-- 空状态提示 -->
                            <div v-if="!loadingPrompts && promptOptions.length === 0" style="margin-top: 8px; padding: 12px; background: var(--n-color); border-radius: 4px; text-align: center;">
                                <NText depth="3" style="font-size: 12px;">
                                    {{ t('shortcuts.noPromptsMessage') }}
                                </NText>
                            </div>
                            
                            <!-- 显示选中的提示词预览 -->
                            <div v-if="selectedPromptPreview" style="margin-top: 8px; padding: 8px; background: var(--n-color); border-radius: 4px;">
                                <NText strong style="font-size: 12px;">{{ t('shortcuts.selectedPromptPreview') }}</NText>
                                <NText depth="3" style="font-size: 11px; display: block; margin-top: 4px; white-space: pre-wrap; max-height: 60px; overflow: hidden;">
                                    {{ selectedPromptPreview }}
                                </NText>
                            </div>
                        </NFlex>
                    </NFlex>

                    <!-- 操作按钮 -->
                    <NFlex size="small">
                        <NButton @click="resetShortcuts">
                            {{ t('shortcuts.resetToDefault') }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </NCard>
        </NFlex>

        <!-- 快捷键捕获提示 -->
        <NModal v-model:show="showCaptureModal" :mask-closable="false" :closable="false">
            <NCard style="width: 400px;" :title="t('shortcuts.inputShortcut')">
                <NFlex vertical size="medium" align="center">
                    <NText>{{ t('shortcuts.pressShortcut') }}</NText>
                    <NText strong style="font-size: 18px; color: var(--primary-color);">
                        {{ capturingShortcut || t('shortcuts.waitingInput') }}
                    </NText>
                    <NText depth="3" style="font-size: 12px;">
                        {{ t('shortcuts.modifierKeys') }}
                    </NText>
                    <NFlex size="small">
                        <NButton type="primary" @click="confirmCapture" :disabled="!capturingShortcut">
                            {{ t('common.confirm') }}
                        </NButton>
                        <NButton @click="cancelCapture">{{ t('common.cancel') }}</NButton>
                    </NFlex>
                </NFlex>
            </NCard>
        </NModal>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { NModal, NCard, NText, NButton, NFlex, NInput, NSelect, useMessage } from 'naive-ui';
import { ref, onMounted, onUnmounted } from 'vue';

const { t } = useI18n();
const message = useMessage();

// 响应式数据
const showInterfaceShortcut = ref('Ctrl+Shift+G');
const copyPromptShortcut = ref('Ctrl+Shift+Alt+C');
const saving = ref(false);
const selectedPromptId = ref<number | null>(null);
const selectedPromptUUID = ref<string | null>(null);
const promptOptions = ref<Array<{ label: string; value: number; uuid?: string; content?: string }>>([]);
const loadingPrompts = ref(false);
const selectedPromptPreview = ref<string>('');
const shortcutsTemporarilyDisabled = ref(false);

// 从用户设置加载快捷键
const loadShortcutsFromSettings = async () => {
  try {
    const prefs = await window.electronAPI.preferences.get();
    console.log('加载的用户偏好设置:', prefs);
    
    if (prefs.shortcuts) {
      // 根据平台显示正确的快捷键格式
      const isMac = navigator.platform.includes('Mac');
      const defaultShowKey = isMac ? 'Cmd+Shift+G' : 'Ctrl+Shift+G';
      const defaultCopyKey = isMac ? 'Cmd+Shift+Alt+C' : 'Ctrl+Shift+Alt+C';
      
      showInterfaceShortcut.value = prefs.shortcuts.showInterface?.key || defaultShowKey;
      copyPromptShortcut.value = prefs.shortcuts.copyPrompt?.key || defaultCopyKey;
      selectedPromptId.value = prefs.shortcuts.copyPrompt?.selectedPromptId || null;
      selectedPromptUUID.value = prefs.shortcuts.copyPrompt?.selectedPromptUUID || null;
      
      console.log('加载的提示词设置:', {
        selectedPromptId: selectedPromptId.value,
        selectedPromptUUID: selectedPromptUUID.value
      });
      
      // 加载选中提示词的预览，优先使用UUID
      if (selectedPromptUUID.value || selectedPromptId.value) {
        try {
          const { apiClientManager } = await import('@/lib/api');
          let prompt = null;
          
          // 优先使用UUID查找
          if (selectedPromptUUID.value) {
            prompt = await apiClientManager.prompt.prompts.getByUUID.query(selectedPromptUUID.value);
          }
          
          // 如果UUID查找失败，回退到ID查找
          if (!prompt && selectedPromptId.value) {
            prompt = await apiClientManager.prompt.prompts.getById.query(selectedPromptId.value);
          }
          
          if (prompt) {
            selectedPromptPreview.value = prompt.content;
            // 确保UUID和ID都正确设置
            selectedPromptId.value = prompt.id || selectedPromptId.value;
            selectedPromptUUID.value = prompt.uuid || selectedPromptUUID.value;
          }
        } catch (error) {
          console.error('加载提示词预览失败:', error);
        }
      }
    }
  } catch (error) {
    console.error('加载快捷键设置失败:', error);
  }
};

// 快捷键捕获相关
const capturingType = ref<'showInterface' | 'copyPrompt' | null>(null);
const capturingShortcut = ref('');
const showCaptureModal = ref(false);

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
    if (!capturingType.value) return;

    event.preventDefault();
    event.stopPropagation();

    const modifiers: string[] = [];
    const isMac = navigator.platform.includes('Mac');

    // 处理修饰键，避免重复识别
    if (isMac) {
        if (event.metaKey) modifiers.push('Cmd');
        if (event.ctrlKey && !event.metaKey) modifiers.push('Ctrl');
    } else {
        if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
    }
    
    if (event.shiftKey) modifiers.push('Shift');
    if (event.altKey) modifiers.push('Alt');

    // 获取按键名称，处理Mac下Alt键产生特殊字符的问题
    let key = event.key;
    
    // 在Mac下，如果按下了Alt键，需要特殊处理
    if (isMac && event.altKey) {
        // 使用code属性来获取原始按键，避免Alt键产生的特殊字符
        const keyCode = event.code;
        if (keyCode.startsWith('Key')) {
            key = keyCode.replace('Key', '');
        } else if (keyCode.startsWith('Digit')) {
            key = keyCode.replace('Digit', '');
        } else {
            // 对于其他按键，使用code属性
            const codeMap: Record<string, string> = {
                'Minus': '-',
                'Equal': '=',
                'BracketLeft': '[',
                'BracketRight': ']',
                'Backslash': '\\',
                'Semicolon': ';',
                'Quote': "'",
                'Comma': ',',
                'Period': '.',
                'Slash': '/',
                'Backquote': '`',
                'Space': 'Space',
                'Enter': 'Enter',
                'Tab': 'Tab',
                'Backspace': 'Backspace',
                'Delete': 'Delete',
                'ArrowUp': '↑',
                'ArrowDown': '↓',
                'ArrowLeft': '←',
                'ArrowRight': '→',
                'Home': 'Home',
                'End': 'End',
                'PageUp': 'PageUp',
                'PageDown': 'PageDown',
                'Insert': 'Insert',
                'F1': 'F1',
                'F2': 'F2',
                'F3': 'F3',
                'F4': 'F4',
                'F5': 'F5',
                'F6': 'F6',
                'F7': 'F7',
                'F8': 'F8',
                'F9': 'F9',
                'F10': 'F10',
                'F11': 'F11',
                'F12': 'F12',
            };
            key = codeMap[keyCode] || keyCode;
        }
    } else {
        // 非Mac或没有Alt键的情况，使用正常的key处理
        key = key.toUpperCase();
        
        // 特殊按键映射
        const keyMap: Record<string, string> = {
            ' ': 'Space',
            'Escape': 'Esc',
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Backspace': 'Backspace',
            'Delete': 'Delete',
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'ArrowLeft': '←',
            'ArrowRight': '→',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
            'Insert': 'Insert',
            'F1': 'F1',
            'F2': 'F2',
            'F3': 'F3',
            'F4': 'F4',
            'F5': 'F5',
            'F6': 'F6',
            'F7': 'F7',
            'F8': 'F8',
            'F9': 'F9',
            'F10': 'F10',
            'F11': 'F11',
            'F12': 'F12',
        };

        if (keyMap[key]) {
            key = keyMap[key];
        }
    }

    // 组合快捷键
    if (modifiers.length > 0) {
        capturingShortcut.value = `${modifiers.join('+')}+${key}`;
    } else {
        capturingShortcut.value = key;
    }
};

const handleKeyUp = (event: KeyboardEvent) => {
    if (!capturingType.value) return;

    // 如果按下的是 Escape，取消捕获
    if (event.key === 'Escape') {
        cancelCapture();
    }
};

// 开始捕获快捷键
const startCaptureShortcut = (type: 'showInterface' | 'copyPrompt') => {
    capturingType.value = type;
    capturingShortcut.value = '';
    showCaptureModal.value = true;

    // 临时禁用快捷键
    window.electronAPI.shortcuts.temporarilyDisable();
    shortcutsTemporarilyDisabled.value = true;

    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
};

// 确认快捷键
const confirmCapture = async () => {
    if (!capturingShortcut.value) return;

    if (capturingType.value === 'showInterface') {
        showInterfaceShortcut.value = capturingShortcut.value;
    } else if (capturingType.value === 'copyPrompt') {
        copyPromptShortcut.value = capturingShortcut.value;
    }

    cancelCapture();
    
    // 自动保存快捷键设置
    await saveShortcuts();
};

// 取消捕获
const cancelCapture = () => {
    capturingType.value = null;
    capturingShortcut.value = '';
    showCaptureModal.value = false;

    // 移除键盘事件监听
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);

    // 恢复快捷键
    if (shortcutsTemporarilyDisabled.value) {
        window.electronAPI.shortcuts.restore();
        shortcutsTemporarilyDisabled.value = false;
    }
};

// 保存快捷键设置
const saveShortcuts = async () => {
  saving.value = true;
  try {
    const prefs = await window.electronAPI.preferences.get();
    
    console.log('保存前的提示词设置:', {
      selectedPromptId: selectedPromptId.value,
      selectedPromptUUID: selectedPromptUUID.value
    });
    
    // 更新快捷键设置
    const updatedPrefs = {
      ...prefs,
      shortcuts: {
        ...prefs.shortcuts,
        showInterface: {
          key: showInterfaceShortcut.value,
          description: t('shortcuts.showInterface'),
          enabled: true,
          type: 'show-interface'
        },
        copyPrompt: {
          key: copyPromptShortcut.value,
          description: t('shortcuts.copyPrompt'),
          enabled: true,
          type: 'copy-prompt',
          selectedPromptId: selectedPromptId.value,
          selectedPromptUUID: selectedPromptUUID.value
        },
        promptTriggers: prefs.shortcuts?.promptTriggers || []
      }
    };
    
    console.log('保存的快捷键设置:', updatedPrefs.shortcuts);
    
    // 保存设置
    await window.electronAPI.preferences.set(updatedPrefs);
    
    // 通知主进程重新注册快捷键
    await window.electronAPI.shortcuts.reregister();
    
    message.success(t('shortcuts.saveSuccess'));
  } catch (error) {
    console.error('保存快捷键设置失败:', error);
    message.error(t('shortcuts.saveError'));
  } finally {
    saving.value = false;
  }
};

// 重置快捷键
const resetShortcuts = async () => {
  try {
    // 根据平台设置正确的默认快捷键
    const isMac = navigator.platform.includes('Mac');
    const defaultShowKey = isMac ? 'Cmd+Shift+G' : 'Ctrl+Shift+G';
    const defaultCopyKey = isMac ? 'Cmd+Shift+Alt+C' : 'Ctrl+Shift+Alt+C';
    
    showInterfaceShortcut.value = defaultShowKey;
    copyPromptShortcut.value = defaultCopyKey;
    
    // 清空选中的提示词
    selectedPromptId.value = null;
    selectedPromptUUID.value = null;
    selectedPromptPreview.value = '';
    
    // 保存重置的设置
    await saveShortcuts();
    
    message.success(t('shortcuts.resetSuccess'));
  } catch (error) {
    console.error('重置快捷键失败:', error);
    message.error(t('shortcuts.resetError'));
  }
};

// 权限状态
const permissionStatus = ref<{ hasPermission: boolean; message?: string } | null>(null);

// 检查权限
const checkPermissions = async () => {
  try {
    const result = await window.electronAPI.shortcuts.checkPermissions();
    permissionStatus.value = result;
    
    if (!result.hasPermission) {
      message.warning(result.message || '需要辅助功能权限');
    } else {
      // 如果权限检查通过，重新注册快捷键
      await window.electronAPI.shortcuts.reregister();
    }
  } catch (error) {
    console.error('检查权限失败:', error);
    permissionStatus.value = { hasPermission: false, message: '检查权限时发生错误' };
  }
};

// 打开系统偏好设置
const openSystemPreferences = () => {
  window.electronAPI.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
};

// 加载提示词列表
const loadPromptOptions = async () => {
  try {
    loadingPrompts.value = true;
    console.log('开始加载提示词列表...');
    
    // 使用API获取提示词列表
    const { apiClientManager } = await import('@/lib/api');
    console.log('API客户端管理器加载成功');
    
    // 尝试使用 getAllForTags 方法，它返回直接的数组
    const prompts = await apiClientManager.prompt.prompts.getAllForTags.query();
    console.log('获取到的提示词数据:', prompts);
    
    if (prompts && Array.isArray(prompts)) {
      promptOptions.value = prompts
        .filter(prompt => prompt.id !== undefined)
        .map(prompt => ({
          label: `${prompt.title || prompt.content.substring(0, 30)} [${prompt.category?.name || '未分类'}]`,
          value: prompt.id!,
          uuid: prompt.uuid,
          // 添加更多信息用于显示
          content: prompt.content,
          category: prompt.category?.name || '未分类'
        }));
      console.log('处理后的提示词选项:', promptOptions.value);
      
      // 如果有选中的提示词，确保UUID正确设置并加载预览
      if (selectedPromptId.value) {
        const selectedOption = promptOptions.value.find(option => option.value === selectedPromptId.value);
        if (selectedOption && selectedOption.uuid) {
          selectedPromptUUID.value = selectedOption.uuid;
          // 加载预览
          selectedPromptPreview.value = selectedOption.content || '';
          console.log('在loadPromptOptions中设置选中提示词:', {
            id: selectedPromptId.value,
            uuid: selectedPromptUUID.value,
            content: selectedPromptPreview.value
          });
        }
      }
    } else {
      console.warn('未获取到提示词数据或数据格式不正确:', prompts);
      promptOptions.value = [];
    }
  } catch (error) {
    console.error('加载提示词列表失败:', error);
    message.error(t('shortcuts.loadPromptsError'));
    // 如果API调用失败，使用空列表
    promptOptions.value = [];
  } finally {
    loadingPrompts.value = false;
  }
};

// 处理提示词选择
const onPromptSelected = async (promptId: number | null) => {
  console.log('提示词选择变化:', { promptId, currentOptions: promptOptions.value });
  
  selectedPromptId.value = promptId;
  
  // 同时设置UUID
  if (promptId) {
    const selectedOption = promptOptions.value.find(option => option.value === promptId);
    selectedPromptUUID.value = selectedOption?.uuid || null;
    console.log('选中的提示词选项:', selectedOption);
  } else {
    selectedPromptUUID.value = null;
  }
  
  // 更新预览
  if (promptId) {
    try {
      const { apiClientManager } = await import('@/lib/api');
      let prompt = null;
      
      // 优先使用UUID查找
      if (selectedPromptUUID.value) {
        prompt = await apiClientManager.prompt.prompts.getByUUID.query(selectedPromptUUID.value);
      }
      
      // 如果UUID查找失败，回退到ID查找
      if (!prompt) {
        prompt = await apiClientManager.prompt.prompts.getById.query(promptId);
      }
      
      if (prompt) {
        selectedPromptPreview.value = prompt.content;
        // 确保UUID和ID都正确设置
        selectedPromptId.value = prompt.id || selectedPromptId.value;
        selectedPromptUUID.value = prompt.uuid || selectedPromptUUID.value;
      } else {
        selectedPromptPreview.value = '';
      }
    } catch (error) {
      console.error('获取提示词详情失败:', error);
      selectedPromptPreview.value = '';
    }
  } else {
    selectedPromptPreview.value = '';
  }
  
  // 保存选择的提示词ID和UUID到设置中
  await saveShortcuts();
};



// 组件挂载时加载设置和检查权限
onMounted(async () => {
  // 先加载用户设置
  await loadShortcutsFromSettings();
  
  // 然后加载提示词选项
  await loadPromptOptions();
  
  // 在加载提示词选项后，确保选中的提示词正确显示
  if (selectedPromptId.value && promptOptions.value.length > 0) {
    const selectedOption = promptOptions.value.find(option => option.value === selectedPromptId.value);
    if (selectedOption) {
      // 确保UUID正确设置
      selectedPromptUUID.value = selectedOption.uuid || selectedPromptUUID.value;
      console.log('找到选中的提示词选项:', selectedOption);
    } else {
      // 如果选中的提示词不在当前列表中，清空选择
      console.log('选中的提示词不在当前列表中，清空选择');
      selectedPromptId.value = null;
      selectedPromptUUID.value = null;
      selectedPromptPreview.value = '';
    }
  }
  
  await checkPermissions();
});

// 组件卸载时清理事件监听和恢复快捷键
onUnmounted(async () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
    
    // 如果Modal还在打开状态，恢复快捷键
    if (shortcutsTemporarilyDisabled.value) {
        try {
            await window.electronAPI.shortcuts.restore();
            shortcutsTemporarilyDisabled.value = false;
            console.log('已恢复快捷键');
        } catch (error) {
            console.error('恢复快捷键失败:', error);
        }
    }
});
</script>

<style scoped>

</style>