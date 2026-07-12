<template>
    <NCard size="small">
        <NFlex vertical :size="12">
                <NText strong>{{ t('language.selectLanguage') }}</NText>
                <NSelect
                    v-model:value="currentLocale"
                    :options="supportedLocales.map(locale => ({
                        label: locale.name,
                        value: locale.code
                    }))"
                    :placeholder="t('language.selectLanguage')"
                    style="max-width: 280px;"
                    @update:value="switchLocale"
                />
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NFlex, NText, NSelect, NCard } from "naive-ui";
import { useI18n } from '~/composables/useI18n';

const { t, currentLocale, supportedLocales, switchLocale } = useI18n();
</script>
