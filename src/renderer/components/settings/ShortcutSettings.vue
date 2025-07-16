<template>
    <div class="shortcut-settings">
        <NFlex vertical>
            <NCard  size="small">
                <NFlex vertical>
                    <!-- 显示界面快捷键 -->
                    <NFlex vertical size="small">
                        <NText strong>{{ t('shortcuts.showInterface') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('shortcuts.showInterfaceDesc') }}
                        </NText>
                        <NInput v-model:value="showInterfaceShortcut" :placeholder="t('shortcuts.clickToInput')" readonly
                            @click="startCaptureShortcut('showInterface')"
                            :class="{ 'capturing': capturingType === 'showInterface' }" />
                    </NFlex>

                    <!-- 插入数据快捷键 -->
                    <NFlex vertical size="small">
                        <NText strong>{{ t('shortcuts.insertData') }}</NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('shortcuts.insertDataDesc') }}
                        </NText>
                        <NInput v-model:value="insertDataShortcut" :placeholder="t('shortcuts.clickToInput')" readonly
                            @click="startCaptureShortcut('insertData')"
                            :class="{ 'capturing': capturingType === 'insertData' }" />
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
import { NModal, NCard, NText, NButton, NFlex, NInput, NSwitch, NEmpty, useMessage } from 'naive-ui';
import { ref, onMounted, onUnmounted } from 'vue';

const { t } = useI18n();
const message = useMessage();

// 响应式数据
const showInterfaceShortcut = ref('Ctrl+Shift+G');
const insertDataShortcut = ref('Ctrl+Shift+I');
const saving = ref(false);

// 快捷键捕获相关
const capturingType = ref<'showInterface' | 'insertData' | null>(null);
const capturingShortcut = ref('');
const showCaptureModal = ref(false);

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
    if (!capturingType.value) return;

    event.preventDefault();
    event.stopPropagation();

    const modifiers: string[] = [];

    if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.altKey) modifiers.push('Alt');

    // 获取按键名称
    let key = event.key.toUpperCase();

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
const startCaptureShortcut = (type: 'showInterface' | 'insertData') => {
    capturingType.value = type;
    capturingShortcut.value = '';
    showCaptureModal.value = true;

    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
};

// 确认快捷键
const confirmCapture = () => {
    if (!capturingShortcut.value) return;

    if (capturingType.value === 'showInterface') {
        showInterfaceShortcut.value = capturingShortcut.value;
    } else if (capturingType.value === 'insertData') {
        insertDataShortcut.value = capturingShortcut.value;
    }

    cancelCapture();
};

// 取消捕获
const cancelCapture = () => {
    capturingType.value = null;
    capturingShortcut.value = '';
    showCaptureModal.value = false;

    // 移除键盘事件监听
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
};

// 重置快捷键
const resetShortcuts = () => {
    showInterfaceShortcut.value = 'Ctrl+Shift+G';
    insertDataShortcut.value = 'Ctrl+Shift+I';
    message.success(t('shortcuts.resetSuccess'));
};

// 组件卸载时清理事件监听
onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
});
</script>

<style scoped>

</style>