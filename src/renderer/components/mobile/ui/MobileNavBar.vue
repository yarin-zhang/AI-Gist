<template>
  <ion-header class="ion-no-border m-header" :class="{ 'm-header--solid': solid }">
    <div class="m-header__safe" />
    <nav class="m-nav">
      <slot name="start">
        <button v-if="leading !== 'none'" type="button" class="m-btn-c" :aria-label="leadingLabel" @click="handleLeading">
          <ion-icon :icon="leading === 'close' ? close : chevronBack" />
        </button>
      </slot>
      <span class="m-nav-t">{{ title }}</span>
      <slot name="end"><span class="m-header__spacer" aria-hidden="true" /></slot>
    </nav>
  </ion-header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { IonHeader, IonIcon } from '@ionic/vue'
import { chevronBack, close } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'

const props = withDefaults(defineProps<{
  title?: string
  /** 左侧按钮：返回、关闭，或不显示（用 start 插槽放文字按钮） */
  leading?: 'back' | 'close' | 'none'
  /** 返回时没有历史记录可退，就去这个地址 */
  fallback?: string
  /** 内容滚动到导航栏下方时用不透明底色 */
  solid?: boolean
}>(), {
  title: '',
  leading: 'back',
  fallback: '/tabs/prompts',
  solid: false
})

const emit = defineEmits<{ leading: [] }>()

const router = useRouter()
const { t } = useI18n()

const leadingLabel = computed(() => props.leading === 'close' ? t('common.close') : t('common.back'))

const handleLeading = () => {
  emit('leading')
  // 关闭按钮由页面自己处理（比如以弹层打开时），返回按钮默认退一步
  if (props.leading !== 'back') return
  if (window.history.length > 1) router.back()
  else router.replace(props.fallback)
}
</script>

<style scoped>
.m-header {
  background: color-mix(in srgb, var(--surface-body) 88%, transparent);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
}

.m-header--solid {
  background: var(--surface-body);
}

.m-header__safe {
  height: env(safe-area-inset-top, 0px);
}

.m-header__spacer {
  width: 40px;
  flex: none;
}
</style>
