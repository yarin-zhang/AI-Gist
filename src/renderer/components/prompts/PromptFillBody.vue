<template>
  <div class="prompt-body">
    <template v-if="!prompt.isJinjaTemplate">
      <div v-if="!prompt.content" class="prompt-body__placeholder">{{ t('promptPage.emptyBody') }}</div>
      <p v-else class="prompt-body__text"><template v-for="(segment, index) in segments" :key="index"
        ><template v-if="segment.kind === 'text'">{{ segment.text }}</template
        ><UiVariableChip v-else :name="segment.name" :value="segment.value" :missing="segment.missing"
          :mode="segment.empty && !segment.missing ? 'name' : 'value'" :active="segment.name === activeName"
          @select="emit('select', segment.name)" /></template></p>
    </template>

    <template v-else>
      <div v-if="jinjaView === 'source'" class="prompt-body__code"><template v-for="(token, index) in jinjaTokens" :key="index"
        ><span v-if="token.kind === 'expression'" class="prompt-body__code-var">{{ token.text }}</span
        ><span v-else-if="token.kind === 'statement'" class="prompt-body__code-tag">{{ token.text }}</span
        ><template v-else>{{ token.text }}</template></template></div>
      <template v-else>
        <div v-if="rendered.error" class="prompt-body__error" role="alert">
          {{ describeTemplateError(rendered.error, t) }}
        </div>
        <p v-else class="prompt-body__text">{{ rendered.content }}</p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PromptWithRelations } from '@shared/types/database'
import UiVariableChip from '@/components/ui/UiVariableChip.vue'
import { describeTemplateError, getActivePromptVariables, isEmptyPromptValue, parsePromptTemplate, renderPrompt } from '@/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  prompt: PromptWithRelations
  values: Record<string, any>
  activeName?: string
  /** Jinja 模板：源码或按当前填写值渲染的结果 */
  jinjaView?: 'source' | 'rendered'
}>(), {
  activeName: '',
  jinjaView: 'source',
})

const emit = defineEmits<{ select: [name: string] }>()
const { t } = useI18n()

const variables = computed(() => getActivePromptVariables(props.prompt))

type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'variable'; name: string; value: string; missing: boolean; empty: boolean }

const segments = computed<BodySegment[]>(() => {
  const content = props.prompt.content || ''
  const byName = new Map(variables.value.map(variable => [variable.name, variable]))
  return parsePromptTemplate(content).segments.map(segment => {
    if (segment.kind === 'text') return { kind: 'text', text: segment.text }
    const variable = byName.get(segment.name)
    // 和复制结果一致：填写值为空时用默认值
    const raw = isEmptyPromptValue(props.values[segment.name]) ? variable?.defaultValue : props.values[segment.name]
    const empty = isEmptyPromptValue(raw)
    return {
      kind: 'variable',
      name: segment.name,
      value: empty ? '' : String(raw),
      empty,
      missing: empty && Boolean(variable?.required),
    }
  })
})

const rendered = computed(() => renderPrompt(props.prompt, props.values, variables.value))

// 源码视图里把 {{ 表达式 }} 和 {% 语句 %}、{# 注释 #} 区分着色
const jinjaTokens = computed(() => {
  const content = props.prompt.content || ''
  const pattern = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\})/g
  return content.split(pattern).filter(Boolean).map(text => ({
    text,
    kind: text.startsWith('{{') ? 'expression' : text.startsWith('{%') || text.startsWith('{#') ? 'statement' : 'text',
  }))
})
</script>

<style scoped>
.prompt-body {
  max-width: var(--reading-width);
  color: var(--content-primary);
  font-size: var(--font-size-base);
  line-height: var(--line-height-prose);
}

.prompt-body__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.prompt-body__text :deep(.ui-var) {
  white-space: normal;
}

.prompt-body__placeholder {
  color: var(--content-muted);
}

.prompt-body__code {
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-prose);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.prompt-body__code-var {
  color: var(--variable-text);
}

.prompt-body__code-tag {
  color: var(--content-tertiary);
}

.prompt-body__error {
  padding: 10px 12px;
  border: 1px solid var(--accent-error-border);
  border-radius: var(--radius-panel);
  background: var(--accent-error-bg);
  color: var(--content-primary);
  font-size: var(--font-size-sm);
}
</style>
