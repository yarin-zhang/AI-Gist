<template>
    <UiPanel :title="t('language.panelTitle')" body="rows">
        <UiSettingRow :title="t('language.interfaceLanguage')" :description="t('language.interfaceLanguageDescription')">
            <NSelect v-model:value="currentLocale" class="language-select" :options="languageOptions"
                :placeholder="t('language.selectLanguage')" @update:value="switchLocale" />
        </UiSettingRow>
    </UiPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSettingRow from '@/components/ui/UiSettingRow.vue'
import { useI18n } from '~/composables/useI18n'

const { t, currentLocale, supportedLocales, switchLocale } = useI18n()

const languageOptions = computed(() => supportedLocales.map(locale => ({ label: locale.name, value: locale.code })))
</script>

<style scoped>
.language-select {
    width: 180px;
}
</style>
