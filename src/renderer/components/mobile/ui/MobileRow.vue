<template>
  <component :is="static ? 'div' : 'button'" :type="static ? undefined : 'button'" class="m-row"
    :class="{ 'm-row--static': static, 'm-row--danger': danger }" @click="handleClick">
    <span v-if="icon" class="m-tile" :class="`m-tile--${tone}`" aria-hidden="true"><ion-icon :icon="icon" /></span>
    <span v-if="sub || $slots.sub" class="two">
      <span>{{ title }}<slot name="title" /></span>
      <span class="sub"><slot name="sub">{{ sub }}</slot></span>
    </span>
    <span v-else class="title">{{ title }}<slot name="title" /></span>
    <span v-if="value || $slots.end || chevron" class="end">
      <slot name="end"><span v-if="value">{{ value }}</span></slot>
      <ion-icon v-if="chevron" :icon="chevronForward" class="chev" aria-hidden="true" />
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'
import type { MobileTileTone } from './types'

const props = withDefaults(defineProps<{
  title?: string
  sub?: string
  value?: string
  icon?: string
  tone?: MobileTileTone
  /** 点击后跳转的路由 */
  to?: string
  /** 只展示信息、不能点 */
  static?: boolean
  danger?: boolean
  /** 不传时：有 to 就显示箭头 */
  showChevron?: boolean
}>(), {
  title: '',
  sub: '',
  value: '',
  icon: '',
  tone: 'blue',
  to: '',
  static: false,
  danger: false,
  showChevron: undefined
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const router = useRouter()

const chevron = computed(() => props.showChevron ?? Boolean(props.to))

const handleClick = (event: MouseEvent) => {
  if (props.static) return
  emit('click', event)
  if (props.to) router.push(props.to)
}
</script>
