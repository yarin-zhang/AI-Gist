<template>
  <div class="models-page">
    <div v-if="loading" class="models-page__state">
      <NSpin :size="18" />
      <span>{{ t('aiConfig.workspace.loading') }}</span>
    </div>

    <template v-else>
      <ModelLibraryList v-if="configs.length" v-model:search="searchText" v-model:filter="activeFilter"
        :configs="filteredConfigs" :total="configs.length" :selected-id="selectedConfigId"
        @select="selectConfig" @create="openAddConfigModal" />

      <div v-if="loadError" class="models-page__state">
        <UiEmptyState :title="t('aiConfig.loadFailed')" :description="loadError">
          <template #actions><NButton @click="loadConfigs">{{ t('common.retry') }}</NButton></template>
        </UiEmptyState>
      </div>
      <div v-else-if="!configs.length" class="models-page__state">
        <UiEmptyState :title="t('models.emptyTitle')" :description="t('aiConfig.noConfigsDescription')">
          <template #icon><NIcon :size="24"><Robot /></NIcon></template>
          <template #actions>
            <NButton type="primary" @click="openAddConfigModal">
              <template #icon><NIcon><Plus /></NIcon></template>{{ t('aiConfig.addConfig') }}
            </NButton>
          </template>
        </UiEmptyState>
      </div>
      <!-- 筛选或搜索没有结果：右侧也不再显示之前选中的配置 -->
      <div v-else-if="!filteredConfigs.length" class="models-page__state">
        <UiEmptyState :title="t('aiConfig.workspace.noMatchingConfigs')">
          <template #icon><NIcon :size="24"><Search /></NIcon></template>
          <template #actions><NButton @click="clearFilters">{{ t('promptLibrary.clearFilters') }}</NButton></template>
        </UiEmptyState>
      </div>
      <ModelDetail v-else-if="selectedConfig" :config="selectedConfig"
        :is-fallback="!explicitPreferredConfig && fallbackConfig?.id === selectedConfig.id"
        :toggling="togglingConfigId === selectedConfig.id"
        :testing-connection="testingConfigs.has(selectedConfig.id!)"
        :connection-result="connectionResults[selectedConfig.id!]"
        :model-options="getModelOptions(selectedConfig)"
        :request-model="requestTestModels[selectedConfig.id!] || ''"
        :request-prompt="requestTestPrompts[selectedConfig.id!] ?? ''"
        :request-testing="requestTestingConfigs.has(selectedConfig.id!)"
        :request-result="requestResults[selectedConfig.id!]"
        @toggle="value => toggleConfig(selectedConfig!, value)"
        @preferred="setPreferred(selectedConfig!)"
        @edit="wizardRef?.openEdit(selectedConfig!)"
        @system-prompt="showSystemPrompt = true"
        @delete="deleteConfig(selectedConfig!)"
        @test-connection="testConnection(selectedConfig!)"
        @cancel-connection-test="cancelConnectionTest(selectedConfig!)"
        @request-test="runRequestTest(selectedConfig!)"
        @stop-request-test="stopRequestTest(selectedConfig!)"
        @update:default-model="model => updateDefaultModel(selectedConfig!, model)"
        @update:request-model="model => (requestTestModels[selectedConfig!.id!] = model)"
        @update:request-prompt="prompt => (requestTestPrompts[selectedConfig!.id!] = prompt)" />
      <div v-else class="models-page__state">
        <UiEmptyState :title="t('aiConfig.workspace.selectConfig')" />
      </div>
    </template>

    <ModelConfigWizard ref="wizardRef" @saved="handleSaved" />
    <SystemPromptModal :show="showSystemPrompt" :config="selectedConfig" :saving="savingSystemPrompt"
      @close="showSystemPrompt = false" @save="handleSaveSystemPrompt" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NSpin } from 'naive-ui'
import { Plus, Robot, Search } from '@vicons/tabler'
import type { AIConfig } from '@shared/types/ai'
import ModelConfigWizard from '@/components/models/ModelConfigWizard.vue'
import ModelDetail from '@/components/models/ModelDetail.vue'
import ModelLibraryList from '@/components/models/ModelLibraryList.vue'
import SystemPromptModal from '@/components/models/SystemPromptModal.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import { useAIConfigWorkspace } from '@/composables/ai/useAIConfigWorkspace'
import { useDatabase } from '@/composables/useDatabase'

const { t } = useI18n()
const { waitForDatabase } = useDatabase()
const {
  configs, loading, loadError, selectedConfigId, selectedConfig, searchText, activeFilter, filteredConfigs,
  explicitPreferredConfig, fallbackConfig, togglingConfigId, testingConfigs, requestTestingConfigs,
  connectionResults, requestResults, requestTestModels, requestTestPrompts, getModelOptions, loadConfigs,
  selectConfig, toggleConfig, setPreferred, updateDefaultModel, deleteConfig, testConnection, cancelConnectionTest,
  runRequestTest, stopRequestTest, saveSystemPrompt,
} = useAIConfigWorkspace()

const wizardRef = ref<InstanceType<typeof ModelConfigWizard>>()
const showSystemPrompt = ref(false)
const savingSystemPrompt = ref(false)

const openAddConfigModal = () => wizardRef.value?.openCreate()
const clearFilters = () => {
  searchText.value = ''
  activeFilter.value = 'all'
}

// 向导保存了配置：从提示词引导页过来的，由主界面决定要不要回到提示词页
const emit = defineEmits<{ 'config-saved': [config: AIConfig] }>()

const handleSaved = async (config: AIConfig) => {
  await loadConfigs()
  const saved = configs.value.find(item => item.id === config.id)
  if (saved) selectConfig(saved)
  emit('config-saved', config)
}

const handleSaveSystemPrompt = async (content: string) => {
  if (!selectedConfig.value) return
  savingSystemPrompt.value = true
  try {
    if (await saveSystemPrompt(selectedConfig.value, content)) showSystemPrompt.value = false
  } finally {
    savingSystemPrompt.value = false
  }
}

onMounted(async () => {
  await waitForDatabase()
  await loadConfigs()
})

defineExpose({ openAddConfigModal })
</script>

<style scoped>
.models-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-primary);
}

.models-page__state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}
</style>
