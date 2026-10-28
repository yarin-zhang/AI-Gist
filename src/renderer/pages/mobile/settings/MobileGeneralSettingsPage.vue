<template>
  <ion-page>
    <MobileNavBar :title="t('settings.sections.general')" fallback="/tabs/settings" />

    <ion-content class="m-page-content">
      <div class="m-body general-body">
        <section class="m-section">
          <span id="general-theme-title" class="m-gt">{{ t('appearance.theme') }}</span>
          <div class="theme-cards" role="radiogroup" aria-labelledby="general-theme-title">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              role="radio"
              class="theme-card"
              :class="{ 'theme-card--on': currentTheme === option.value }"
              :aria-checked="currentTheme === option.value"
              @click="handleThemeChange(option.value)"
            >
              <!-- 预览图固定画出浅色 / 深色界面的样子，颜色取自两套主题令牌，不随当前主题变化 -->
              <span class="theme-preview" :class="`theme-preview--${option.value}`" :style="previewStyle" aria-hidden="true">
                <template v-if="option.value === 'system'">
                  <span class="theme-preview__half theme-preview__half--light" />
                  <span class="theme-preview__half theme-preview__half--dark" />
                </template>
                <template v-else>
                  <i class="theme-preview__line" />
                  <i class="theme-preview__line theme-preview__line--short" />
                  <i class="theme-preview__button" />
                </template>
              </span>
              <span class="theme-card__label">
                <span>{{ option.label }}</span>
                <ion-icon v-if="currentTheme === option.value" :icon="checkmarkCircle" class="theme-card__check" aria-hidden="true" />
                <span v-else class="theme-card__ring" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <section class="m-section">
          <span id="general-language-title" class="m-gt">{{ t('language.panelTitle') }}</span>
          <div class="m-group" role="radiogroup" aria-labelledby="general-language-title">
            <button
              v-for="item in supportedLocales"
              :key="item.code"
              type="button"
              role="radio"
              class="m-row"
              :aria-checked="locale === item.code"
              :lang="item.code"
              @click="handleLanguageChange(item.code)"
            >
              <span class="title">{{ item.name }}</span>
              <span class="end">
                <ion-icon v-if="locale === item.code" :icon="checkmark" class="language-check" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonPage, IonContent, IonIcon } from '@ionic/vue'
import { checkmark, checkmarkCircle } from 'ionicons/icons'
import type { SupportedLocale } from '@shared/types/preferences'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { getCssVars } from '~/theme'

type ThemeSource = 'system' | 'light' | 'dark'

const { t, locale, supportedLocales, switchLocale } = useI18n()
const { themeSource, setThemeSource } = useTheme()

const currentTheme = computed<ThemeSource>(() => (themeSource.value || 'system') as ThemeSource)

const themeOptions = computed(() => [
  { value: 'system' as const, label: t('appearance.auto') },
  { value: 'light' as const, label: t('appearance.light') },
  { value: 'dark' as const, label: t('appearance.dark') }
])

// 两套主题各取几种颜色给预览图用，避免在样式里写死色值
const lightVars = getCssVars('light')
const darkVars = getCssVars('dark')
const previewStyle = {
  '--preview-light-bg': lightVars['surface-primary'],
  '--preview-light-line': lightVars['border-default'],
  '--preview-light-accent': lightVars['accent-brand'],
  '--preview-dark-bg': darkVars['surface-body'],
  '--preview-dark-line': darkVars['border-default'],
  '--preview-dark-accent': darkVars['accent-text']
}

const handleLanguageChange = (code: SupportedLocale) => {
  if (locale.value !== code) switchLocale(code)
}

const handleThemeChange = async (value: ThemeSource) => {
  if (currentTheme.value !== value) await setThemeSource(value)
}
</script>

<style scoped>
.m-body.general-body {
  padding-top: 4px;
}

.theme-cards {
  display: flex;
  gap: 10px;
}

.theme-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 10px 10px 12px;
  border: 0;
  border-radius: var(--m-radius-card);
  background: var(--surface-primary);
  box-shadow: var(--shadow-card);
  color: var(--content-primary);
  font: inherit;
  cursor: pointer;
}

.theme-card--on {
  box-shadow: inset 0 0 0 2px var(--accent-primary), var(--shadow-card);
}

.theme-preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  height: 92px;
  padding: 8px;
  overflow: hidden;
  border-radius: 10px;
}

.theme-preview--system {
  flex-direction: row;
  gap: 0;
  padding: 0;
  /* 两半各自铺底色，描边要画在它们上面 */
  outline: 1px solid var(--border-strong);
  outline-offset: -1px;
}

.theme-preview__half {
  flex: 1;
}

.theme-preview__half--light,
.theme-preview--light {
  background: var(--preview-light-bg);
}

.theme-preview--light {
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.theme-preview__half--dark,
.theme-preview--dark {
  background: var(--preview-dark-bg);
}

.theme-preview--dark {
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

.theme-preview__line {
  width: 70%;
  height: 6px;
  border-radius: 3px;
  background: var(--preview-light-line);
}

.theme-preview__line--short {
  width: 50%;
}

.theme-preview__button {
  width: 28px;
  height: 12px;
  margin-top: auto;
  border-radius: 4px;
  background: var(--preview-light-accent);
}

.theme-preview--dark .theme-preview__line {
  background: var(--preview-dark-line);
}

.theme-preview--dark .theme-preview__button {
  background: var(--preview-dark-accent);
}

.theme-card__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 18px;
  font-size: var(--m-font-sub);
  font-weight: 500;
  text-align: left;
}

.theme-card--on .theme-card__label {
  font-weight: 600;
}

.theme-card__check {
  flex: none;
  color: var(--accent-primary);
  font-size: 18px;
}

.theme-card__ring {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  box-shadow: inset 0 0 0 1.5px var(--border-strong);
}

.language-check {
  color: var(--accent-primary);
  font-size: 20px;
}
</style>
