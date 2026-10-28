<template>
    <UiPanel :title="t('appearance.title')">
        <div class="appearance">
            <span class="appearance__label">{{ t('appearance.theme') }}</span>
            <div class="theme-cards" role="radiogroup" :aria-label="t('appearance.theme')">
                <label v-for="option in themeOptions" :key="option.value" class="theme-card"
                    :class="{ 'is-selected': modelValue.themeSource === option.value }">
                    <span class="theme-preview" :class="`theme-preview--${option.value}`" :style="previewStyle" aria-hidden="true">
                        <template v-if="option.value === 'system'">
                            <span class="theme-preview__half theme-preview__half--light" />
                            <span class="theme-preview__half theme-preview__half--dark" />
                        </template>
                        <template v-else>
                            <span class="theme-preview__line" />
                            <span class="theme-preview__line theme-preview__line--short" />
                            <span class="theme-preview__button" />
                        </template>
                    </span>
                    <span class="theme-card__choice">
                        <input type="radio" name="theme-source" :value="option.value" :checked="modelValue.themeSource === option.value"
                            @change="handleUpdate(option.value)" />
                        {{ option.label }}
                    </span>
                </label>
            </div>
        </div>
    </UiPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiPanel from '@/components/ui/UiPanel.vue'
import { getCssVars } from '@/theme'

type ThemeSource = 'system' | 'light' | 'dark'

defineProps<{
    modelValue: { themeSource: ThemeSource }
}>()

const emit = defineEmits<{
    'update:modelValue': [value: { themeSource: ThemeSource }]
}>()

const { t } = useI18n()

const themeOptions = computed(() => [
    { value: 'system' as const, label: t('appearance.auto') },
    { value: 'light' as const, label: t('appearance.light') },
    { value: 'dark' as const, label: t('appearance.dark') },
])

// 预览图固定画出浅色 / 深色界面的样子：颜色取自两套主题令牌，不随当前主题变化（和移动端同一套）
const lightVars = getCssVars('light')
const darkVars = getCssVars('dark')
const previewStyle = {
    '--preview-light-bg': lightVars['surface-primary'],
    '--preview-light-line': lightVars['border-default'],
    '--preview-light-accent': lightVars['accent-brand'],
    '--preview-dark-bg': darkVars['surface-body'],
    '--preview-dark-line': darkVars['border-default'],
    '--preview-dark-accent': darkVars['accent-brand'],
}

const handleUpdate = (value: ThemeSource) => {
    emit('update:modelValue', { themeSource: value })
}
</script>

<style scoped>
.appearance {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.appearance__label {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.theme-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.theme-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-panel);
    background: var(--surface-primary);
    cursor: pointer;
}

.theme-card:hover {
    border-color: var(--border-strong);
}

.theme-card.is-selected {
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
}

.theme-card:focus-within {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
}

/*
 * 三张预览一样高：高度含内边距和描边（border-box），「跟随系统」没有内边距也不会变矮。
 * 描边用 outline 画在最上层，「跟随系统」左右两半铺满后仍能看到外框
 */
.theme-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
    height: 72px;
    padding: 10px;
    overflow: hidden;
    border-radius: var(--radius-control);
    outline: 1px solid var(--border-default);
    outline-offset: -1px;
}

.theme-preview--system {
    flex-direction: row;
    gap: 0;
    padding: 0;
}

.theme-preview__half {
    flex: 1;
}

.theme-preview__half--light,
.theme-preview--light {
    background: var(--preview-light-bg);
}

.theme-preview__half--dark,
.theme-preview--dark {
    background: var(--preview-dark-bg);
}

.theme-preview__line {
    width: 60%;
    height: 6px;
    border-radius: 3px;
    background: var(--preview-light-line);
}

.theme-preview__line--short {
    width: 40%;
}

.theme-preview--dark .theme-preview__line {
    background: var(--preview-dark-line);
}

.theme-preview__button {
    width: 36px;
    height: 14px;
    margin-top: auto;
    border-radius: 4px;
    background: var(--preview-light-accent);
}

.theme-preview--dark .theme-preview__button {
    background: var(--preview-dark-accent);
}

.theme-card__choice {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--content-primary);
    font-size: var(--font-size-base);
}

.theme-card__choice input {
    margin: 0;
    accent-color: var(--accent-primary);
}

.theme-card__choice input:focus-visible {
    outline: none;
}

@media (max-width: 640px) {
    .theme-cards {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
