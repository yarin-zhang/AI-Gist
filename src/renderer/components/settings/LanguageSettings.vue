<template>
    <NCard>
        <NFlex vertical :size="16">
            <NFlex vertical :size="12">
                <NText depth="2">{{ t('language.title') }}</NText>
                <NText depth="3" style="font-size: 12px;">
                    {{ t('language.description') }}
                </NText>
            </NFlex>
            
            <NFlex vertical :size="12">
                <NText depth="2" style="font-size: 14px;">{{ t('language.selectLanguage') }}：</NText>
                <NSelect
                    v-model:value="currentLocale"
                    :options="supportedLocales.map(locale => ({
                        label: locale.name,
                        value: locale.code
                    }))"
                    :placeholder="t('language.selectLanguage')"
                    style="max-width: 200px;"
                    @update:value="switchLocale"
                />
            </NFlex>
        </NFlex>
    </NCard>
</template>

<script setup lang="ts">
import { NFlex, NText, NSelect, NCard } from "naive-ui";
import { useI18n } from '~/composables/useI18n';

const { t, currentLocale, supportedLocales, switchLocale } = useI18n();
</script>
