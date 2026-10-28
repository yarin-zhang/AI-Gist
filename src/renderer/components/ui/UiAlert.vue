<template>
  <div class="ui-alert" :class="tone !== 'info' && `ui-alert--${tone}`" :role="tone === 'error' ? 'alert' : 'status'">
    <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><component :is="icon" /></NIcon>
    <span><slot /></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { AlertCircle, AlertTriangle, CircleCheck, InfoCircle } from '@vicons/tabler'

const props = withDefaults(defineProps<{
  tone?: 'info' | 'success' | 'warning' | 'error'
}>(), {
  tone: 'info'
})

const icon = computed(() => ({
  info: InfoCircle,
  success: CircleCheck,
  warning: AlertTriangle,
  error: AlertCircle
})[props.tone])
</script>
