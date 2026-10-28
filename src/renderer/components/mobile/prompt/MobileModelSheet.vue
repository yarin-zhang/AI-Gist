<!--
  选择 AI 模型的底部面板：按配置分组列出模型，首选配置排在最前并标星。
  AI 生成、试运行共用。
-->
<template>
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.6, 1]" :initial-breakpoint="0.6"
    :handle="false" @didDismiss="emit('close')">
    <div class="m-sheet model-sheet">
      <div class="m-grab" aria-hidden="true" />
      <header class="model-sheet__head">
        <span class="model-sheet__side" aria-hidden="true" />
        <h2 class="model-sheet__title">{{ t('aiGenerator.selectModel') }}</h2>
        <button type="button" class="m-btn model-sheet__close" @click="emit('close')">{{ t('common.close') }}</button>
      </header>

      <ion-content class="model-sheet__content">
        <div class="m-body model-sheet__body">
          <section v-for="group in groups" :key="group.config.configId" class="m-section">
            <span v-if="groups.length > 1" class="m-gt model-sheet__group-title">
              <span>
                {{ group.config.name }}
                <ion-icon v-if="group.config.isPreferred" :icon="star" class="model-sheet__star"
                  :aria-label="t('models.preferred')" />
              </span>
            </span>
            <div class="m-group model-sheet__group" role="radiogroup" :aria-label="group.config.name">
              <button v-for="option in group.options" :key="option.key" type="button" class="m-row" role="radio"
                :aria-checked="option.key === selectedKey" @click="emit('select', option.key)">
                <span class="title model-sheet__model">{{ option.model }}</span>
                <span class="end">
                  <ion-icon v-if="option.key === selectedKey" :icon="checkmark" class="model-sheet__check" aria-hidden="true" />
                </span>
              </button>
            </div>
          </section>
          <p v-if="!groups.length" class="m-note">{{ t('aiGenerator.addConfigFirst') }}</p>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonContent, IonIcon, IonModal } from '@ionic/vue'
import { checkmark, star } from 'ionicons/icons'
import type { AIConfig } from '@shared/types/ai'
import { useI18n } from '~/composables/useI18n'
import { buildMobileModelOptions, type MobileModelOption } from './mobile-ai'

const props = defineProps<{
  open: boolean
  configs: AIConfig[]
  selectedKey: string
}>()

const emit = defineEmits<{ close: []; select: [key: string] }>()

const { t } = useI18n()

const groups = computed(() => {
  const result: { config: AIConfig; options: MobileModelOption[] }[] = []
  buildMobileModelOptions(props.configs).forEach(option => {
    const group = result.find(item => item.config.configId === option.config.configId)
    if (group) group.options.push(option)
    else result.push({ config: option.config, options: [option] })
  })
  return result
})
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

.model-sheet__group-title ion-icon {
  margin-left: 4px;
  vertical-align: -2px;
}

.model-sheet__star {
  color: var(--accent-favorite);
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
