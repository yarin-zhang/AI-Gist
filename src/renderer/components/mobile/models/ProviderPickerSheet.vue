<template>
  <!-- expand-to-scroll=false：内容区限制在可见范围内滚动，最底下的说明不会停在屏幕外 -->
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.92]" :initial-breakpoint="0.92"
    :handle="false" :expand-to-scroll="false" @didDismiss="emit('close')">
    <div class="m-sheet provider-sheet">
      <div class="m-grab" aria-hidden="true" />
      <header class="provider-sheet__head">
        <span class="provider-sheet__side" aria-hidden="true" />
        <h2 class="provider-sheet__title">{{ t('aiConfig.workspace.chooseProvider') }}</h2>
        <button type="button" class="m-btn provider-sheet__close" @click="emit('close')">{{ t('common.close') }}</button>
      </header>

      <ion-content class="provider-sheet__content">
        <div class="m-body provider-sheet__body">
          <section v-for="group in groups" :key="group.key" class="m-section">
            <div class="m-gt"><span>{{ group.label }}</span></div>
            <div class="provider-sheet__grid">
              <ProviderChoiceButton v-for="choice in group.providers" :key="choice.id"
                :visual="getChoiceVisual(choice)" :label="choice.label" :selected="choice.id === selectedId"
                @select="emit('select', choice)" />
            </div>
          </section>
          <p v-if="note" class="m-note">
            <ion-icon :icon="desktopOutline" aria-hidden="true" />
            <span>{{ note }}</span>
          </p>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonContent, IonIcon, IonModal } from '@ionic/vue'
import { desktopOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import ProviderChoiceButton from './ProviderChoiceButton.vue'
import { getChoiceVisual, type ProviderChoice, type ProviderGroupKey } from './provider-catalog'

defineProps<{
  open: boolean
  groups: { key: ProviderGroupKey; label: string; providers: ProviderChoice[] }[]
  selectedId: string
  /** 面板底部的说明（哪些服务只能在桌面版使用） */
  note?: string
}>()

const emit = defineEmits<{ close: []; select: [choice: ProviderChoice] }>()

const { t } = useI18n()
</script>

<style scoped>
/* 宫格卡片是白底，整块面板用画布色才分得出层次 */
.provider-sheet {
  height: 100%;
  background: var(--surface-body);
}

.provider-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.provider-sheet__side {
  width: 64px;
}

.provider-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.provider-sheet__close {
  min-width: 64px;
  color: var(--accent-primary);
  font-weight: 600;
}

.provider-sheet__content {
  --background: var(--surface-body);
  flex: 1;
}

.provider-sheet__body {
  gap: 22px;
  padding-top: 12px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
}

.provider-sheet__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
</style>
