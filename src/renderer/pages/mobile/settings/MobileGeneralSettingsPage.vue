<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('settings.sections.general') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('language.title') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-select
            :label="t('language.selectLanguage')"
            :value="locale"
            interface="action-sheet"
            @ionChange="handleLanguageChange"
          >
            <ion-select-option v-for="item in supportedLocales" :key="item.code" :value="item.code">
              {{ item.name }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('language.description') }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('appearance.theme') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-select
            :label="t('appearance.theme')"
            :value="themeSource || 'system'"
            interface="action-sheet"
            @ionChange="handleThemeChange"
          >
            <ion-select-option value="light">{{ t('appearance.light') }}</ion-select-option>
            <ion-select-option value="dark">{{ t('appearance.dark') }}</ion-select-option>
            <ion-select-option value="system">{{ t('appearance.auto') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('settings.menus.appearance.description') }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonNote,
  IonSelect,
  IonSelectOption
} from '@ionic/vue'
import type { SupportedLocale } from '@shared/types/preferences'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'

const { t, locale, supportedLocales, switchLocale } = useI18n()
const { themeSource, setThemeSource } = useTheme()

const handleLanguageChange = (event: CustomEvent<{ value: SupportedLocale }>) => {
  switchLocale(event.detail.value)
}

const handleThemeChange = async (event: CustomEvent<{ value: 'system' | 'light' | 'dark' }>) => {
  await setThemeSource(event.detail.value)
}
</script>

<style scoped>
/* ion-list-header 与字号阶梯的统一样式见 assets/styles/mobile.css */

.section-note {
  padding: 4px 0 8px;
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-normal);
  white-space: normal;
}
</style>
