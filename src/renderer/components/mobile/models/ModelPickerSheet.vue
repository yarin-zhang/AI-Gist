<template>
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.6, 1]" :initial-breakpoint="0.6"
    :handle="false" @didDismiss="emit('close')">
    <div class="m-sheet model-sheet">
      <div class="m-grab" aria-hidden="true" />
      <header class="model-sheet__head">
        <span class="model-sheet__side" aria-hidden="true" />
        <h2 class="model-sheet__title">{{ t('aiConfig.defaultModel') }}</h2>
        <button type="button" class="m-btn model-sheet__close" @click="emit('close')">{{ t('common.close') }}</button>
      </header>

      <ion-content class="model-sheet__content">
        <div class="m-body model-sheet__body">
          <div v-if="models.length > 0" class="m-group model-sheet__group" role="radiogroup"
            :aria-label="t('aiConfig.defaultModel')">
            <button v-for="model in models" :key="model" type="button" class="m-row" role="radio"
              :aria-checked="model === selected" @click="emit('select', model)">
              <span class="title model-sheet__model">{{ model }}</span>
              <span class="end">
                <ion-icon v-if="model === selected" :icon="checkmark" class="model-sheet__check" aria-hidden="true" />
              </span>
            </button>
          </div>

          <template v-else>
            <p class="m-note">
              <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
              <span>{{ t('aiConfig.workspace.modelsNotFetched') }}</span>
            </p>
            <button type="button" class="m-cta m-cta-2" @click="emit('edit')">
              <ion-icon :icon="createOutline" aria-hidden="true" />
              {{ t('aiConfig.editConfig') }}
            </button>
          </template>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonContent, IonIcon, IonModal } from '@ionic/vue'
import { checkmark, createOutline, informationCircleOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'

defineProps<{
  open: boolean
  models: string[]
  selected: string
}>()

const emit = defineEmits<{ close: []; select: [model: string]; edit: [] }>()

const { t } = useI18n()
</script>

<style scoped>
.model-sheet {
  height: 100%;
}

.model-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.model-sheet__side {
  width: 64px;
}

.model-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.model-sheet__close {
  min-width: 64px;
  color: var(--accent-primary);
  font-weight: 600;
}

.model-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.model-sheet__body {
  padding-top: 12px;
}

/* 面板本身就是白底，分组改用细描边区分 */
.model-sheet__group {
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.model-sheet__model {
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: var(--m-font-sub);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-sheet__check {
  color: var(--accent-primary);
  font-size: 20px;
}
</style>
