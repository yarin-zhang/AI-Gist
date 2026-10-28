<!--
  提示词正文：普通文字原样换行显示，变量换成 .m-var 标记。
  mode="value"：显示填写值（<small> 里是变量名），没填的用虚线框标出；点一下切到该变量。
  mode="name"：只显示变量名（生成结果、编辑预览用）。
  Jinja 模板没有可对应的占位位置，由调用方传 plain 直接显示文本。
-->
<template>
  <div class="m-prompt-body" :class="{ 'm-prompt-body--plain': plain }">
    <template v-if="plain">{{ content }}</template>
    <template v-else>
      <template v-for="(segment, index) in segments" :key="index">
        <template v-if="segment.kind === 'text'">{{ segment.text }}</template>
        <!-- 用行内 span 而不是 button：长值要像文字一样跨行折行 -->
        <span v-else-if="mode === 'value'" role="button" tabindex="0" class="m-var m-prompt-body__var"
          :class="{ 'm-var--missing': !segment.value, 'm-var--active': segment.name === activeName }"
          :aria-label="segment.value ? t('mobilePrompt.variableValueLabel', { name: segment.name, value: segment.value }) : t('mobilePrompt.variableEmptyLabel', { name: segment.name })"
          @click="emit('select', segment.name)" @keydown.enter.prevent="emit('select', segment.name)">
          <template v-if="segment.value"><small>{{ segment.name }}</small>{{ segment.value }}</template>
          <template v-else>{{ segment.name }}</template>
        </span>
        <span v-else class="m-var m-var--name">{{ segment.name }}</span>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { isEmptyPromptValue, parsePromptTemplate, type EditablePromptVariable } from '~/lib/utils/prompt-template'

type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'variable'; name: string; value: string }

const props = withDefaults(defineProps<{
  content: string
  variables?: EditablePromptVariable[]
  values?: Record<string, unknown>
  mode?: 'value' | 'name'
  activeName?: string
  plain?: boolean
}>(), {
  variables: () => [],
  values: () => ({}),
  mode: 'name',
  activeName: '',
  plain: false,
})

const emit = defineEmits<{ select: [name: string] }>()
const { t } = useI18n()

const MAX_VALUE_LENGTH = 120

const displayValue = (variable: EditablePromptVariable | undefined, value: unknown) => {
  // 和复制结果一致：填写值为空时用默认值
  const text = String(isEmptyPromptValue(value) ? variable?.defaultValue ?? '' : value)
  if (!text.trim()) return ''
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
}

const segments = computed<BodySegment[]>(() => {
  const variableByName = new Map(props.variables.map(variable => [variable.name, variable]))
  const result: BodySegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = result[result.length - 1]
    if (last?.kind === 'text') last.text += text
    else result.push({ kind: 'text', text })
  }
  parsePromptTemplate(props.content).segments.forEach(segment => {
    if (segment.kind === 'text') return pushText(segment.text)
    // 名称模式下所有占位符都标出来；填写模式只标出有定义的变量
    if (props.mode === 'value' && !variableByName.has(segment.name)) return pushText(segment.raw)
    result.push({
      kind: 'variable',
      name: segment.name,
      value: props.mode === 'value' ? displayValue(variableByName.get(segment.name), props.values[segment.name]) : '',
    })
  })
  return result
})
</script>

<style scoped>
.m-prompt-body {
  color: var(--content-primary);
  font-size: var(--m-font-body);
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.m-prompt-body--plain {
  line-height: 1.7;
}

.m-prompt-body__var {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.m-prompt-body__var:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent-primary), var(--focus-ring);
}
</style>
