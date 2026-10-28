<template>
  <button
    type="button"
    class="ui-var"
    :class="{
      'ui-var--name': mode === 'name',
      'ui-var--missing': isMissing,
      'ui-var--active': active
    }"
    @click="emit('select', name)"
  >
    <template v-if="mode === 'value' && !isMissing">
      <small class="ui-var__label">{{ name }}</small>{{ value }}
    </template>
    <template v-else>{{ name }}</template>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  value?: string
  /** value：显示填写值和变量名小标；name：只显示变量名（编辑模板时） */
  mode?: 'value' | 'name'
  /** 必填但还没填，用橙色虚线框提示 */
  missing?: boolean
  active?: boolean
}>(), {
  value: '',
  mode: 'value',
  missing: false,
  active: false
})

const emit = defineEmits<{
  select: [name: string]
}>()

const isMissing = computed(() => props.mode === 'value' && props.missing)
</script>
