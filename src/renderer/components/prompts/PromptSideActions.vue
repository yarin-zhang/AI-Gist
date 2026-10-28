<template>
  <div ref="rootRef" class="side-actions">
    <NTooltip v-if="kind === 'definitions'" :disabled="!compact" :show-arrow="false">
      <template #trigger>
        <NButton quaternary size="tiny" class="side-actions__button" :class="{ 'is-icon': compact }"
          :aria-label="compact ? t('promptPage.newVariable') : undefined" @click="emit('add-variable')">
          <template #icon><NIcon :size="12"><Plus /></NIcon></template>
          <template v-if="!compact" #default>{{ t('promptPage.newVariable') }}</template>
        </NButton>
      </template>
      {{ t('promptPage.newVariable') }}
    </NTooltip>

    <template v-else-if="kind === 'fill'">
      <NTooltip v-if="showUsage" :disabled="!compact" :show-arrow="false">
        <template #trigger>
          <NButton quaternary size="tiny" class="side-actions__button" :class="{ 'is-icon': compact }"
            :aria-label="compact ? t('promptUsage.title') : undefined" @click="emit('open-usage')">
            <template v-if="compact" #icon><NIcon :size="14"><Clock /></NIcon></template>
            <template v-else #default>{{ t('promptUsage.title') }}</template>
          </NButton>
        </template>
        {{ t('promptUsage.title') }}
      </NTooltip>
      <NPopconfirm :show="confirming" :show-icon="false" @update:show="value => (confirming = value)" @positive-click="emit('clear')">
        <template #trigger>
          <NTooltip :disabled="!compact || confirming" :show-arrow="false">
            <template #trigger>
              <NButton quaternary size="tiny" class="side-actions__button" :class="{ 'is-icon': compact }" :disabled="!canClear"
                :aria-label="compact ? t('promptPage.clear') : undefined">
                <template v-if="compact" #icon><NIcon :size="14"><Eraser /></NIcon></template>
                <template v-else #default>{{ t('promptPage.clear') }}</template>
              </NButton>
            </template>
            {{ t('promptPage.clear') }}
          </NTooltip>
        </template>
        {{ t('promptPage.clearConfirm') }}
      </NPopconfirm>
    </template>

    <ModelPicker v-else :disabled="modelDisabled" @connect="emit('connect')" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NPopconfirm, NTooltip } from 'naive-ui'
import { Clock, Eraser, Plus } from '@vicons/tabler'
import ModelPicker from './ModelPicker.vue'

// 右侧面板标签头右边的操作区：页签保持完整宽度，这里占剩下的空间。
// 文字按钮放不下时（英语、意大利语，或弹窗里给关闭按钮让出位置后）改成带提示的图标按钮。
const props = withDefaults(defineProps<{
  /** definitions：编辑变量定义；fill：填写变量值；model：AI 页签的模型选择 */
  kind: 'definitions' | 'fill' | 'model'
  showUsage?: boolean
  canClear?: boolean
  modelDisabled?: boolean
}>(), {
  showUsage: false,
  canClear: false,
  modelDisabled: false,
})

const emit = defineEmits<{
  'add-variable': []
  'open-usage': []
  clear: []
  connect: []
}>()

const { t, locale } = useI18n()
const rootRef = ref<HTMLElement>()
const compact = ref(false)
// 清空确认框打开时不再显示按钮提示，免得两个浮层叠在一起
const confirming = ref(false)

// Naive 的确认气泡不响应 Esc：打开时由这里收起它，并标记这次 Esc 已用掉，外层的面板和弹窗不跟着关
const closeConfirmOnEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !confirming.value) return
  event.preventDefault()
  confirming.value = false
}

watch(confirming, open => {
  if (open) window.addEventListener('keydown', closeConfirmOnEscape, true)
  else window.removeEventListener('keydown', closeConfirmOnEscape, true)
})
// 文字按钮需要的宽度，切成图标后用它判断空间够不够切回来
let textWidth = 0

// 用 offsetWidth 而不是 getBoundingClientRect：弹窗打开时有缩放动画，后者量到的是缩小后的宽度
const contentWidth = (root: HTMLElement) => {
  const children = Array.from(root.children) as HTMLElement[]
  const gap = parseFloat(getComputedStyle(root).columnGap) || 0
  return children.reduce((sum, child) => sum + child.offsetWidth, 0) + gap * Math.max(0, children.length - 1)
}

const fit = () => {
  const root = rootRef.value
  if (!root || props.kind === 'model') return
  const available = root.clientWidth
  // 窄宽度下右侧面板收起时宽度是 0，等展开后再量
  if (!available) return
  if (!compact.value) {
    textWidth = contentWidth(root)
    if (textWidth > available) compact.value = true
  } else if (textWidth && textWidth <= available) {
    compact.value = false
    // 切回文字后再量一次，防止之前量到的宽度已经过时
    void nextTick(fit)
  }
}

// 按钮组合或语言变了，先按文字按钮排一次再量
const refit = async () => {
  compact.value = false
  textWidth = 0
  await nextTick()
  fit()
}

watch([() => props.kind, () => props.showUsage, locale], refit)

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!rootRef.value) return
  observer = new ResizeObserver(fit)
  observer.observe(rootRef.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', closeConfirmOnEscape, true)
})
</script>

<style scoped>
.side-actions {
  container: side-actions / inline-size;
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

/* 文字按钮保持自然宽度，量出来的才是真正需要的宽度 */
.side-actions__button {
  flex: none;
}

.side-actions__button.is-icon {
  width: 22px;
  padding: 0;
}
</style>
