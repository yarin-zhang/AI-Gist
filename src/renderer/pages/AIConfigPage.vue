<template>
    <div class="ai-config-page">
        <header class="ai-command-bar">
            <div class="page-identity">
                <span class="page-identity-icon"><NIcon size="18"><Robot /></NIcon></span>
                <div>
                    <NText strong class="page-title">{{ t('aiConfig.title') }}</NText>
                    <NText depth="3" class="page-subtitle">{{ t('aiConfig.subtitle') }}</NText>
                </div>
            </div>

            <div v-if="configs.length" class="preference-summary">
                <NIcon size="16"><Star /></NIcon>
                <span v-if="explicitPreferredConfig">
                    {{ t('aiConfig.workspace.explicitPreferred', { name: explicitPreferredConfig.name }) }}
                </span>
                <span v-else-if="fallbackConfig">
                    {{ t('aiConfig.workspace.fallbackPreferred', { name: fallbackConfig.name }) }}
                </span>
                <span v-else>{{ t('aiConfig.workspace.noEnabledConfig') }}</span>
            </div>

            <div class="page-actions">
                <NButton size="small" @click="showQuickOptimizationModal = true">
                    <template #icon><NIcon size="16"><Settings /></NIcon></template>
                    <span class="action-label">{{ t('aiConfig.optimizePrompt') }}</span>
                </NButton>
                <NButton type="primary" size="small" @click="openCreateConfig">
                    <template #icon><NIcon size="16"><Plus /></NIcon></template>
                    <span class="action-label">{{ t('aiConfig.addConfig') }}</span>
                </NButton>
            </div>
        </header>

        <div class="ai-page-content">
            <div v-if="loading" class="page-state ui-surface">
                <NSpin size="small" />
                <NText depth="3">{{ t('aiConfig.workspace.loading') }}</NText>
            </div>

            <NResult v-else-if="loadError" status="error" :title="t('aiConfig.loadFailed')"
                :description="loadError" class="page-state ui-surface">
                <template #footer>
                    <NButton @click="loadConfigs"><template #icon><NIcon><Refresh /></NIcon></template>{{ t('common.retry') }}</NButton>
                </template>
            </NResult>

            <div v-else-if="configs.length === 0" class="page-state ui-surface">
                <NEmpty :description="t('aiConfig.noConfigs')">
                    <template #extra>
                        <NButton type="primary" @click="openCreateConfig">
                            <template #icon><NIcon><Plus /></NIcon></template>
                            {{ t('aiConfig.addConfig') }}
                        </NButton>
                    </template>
                </NEmpty>
            </div>

            <NSplit v-else v-model:size="libraryPaneSize" direction="horizontal" min="240px" max="400px"
                :resize-trigger-size="1" class="config-workspace-split">
                <template #1>
                    <aside class="config-library">
                        <div class="library-search">
                            <NInput v-model:value="searchText" clearable size="small"
                                :placeholder="t('aiConfig.workspace.searchPlaceholder')">
                                <template #prefix><NIcon size="16"><Search /></NIcon></template>
                            </NInput>
                        </div>

                        <div class="library-filters" role="navigation" :aria-label="t('aiConfig.workspace.filterLabel')">
                            <button v-for="filter in filterOptions" :key="filter.key" type="button"
                                class="filter-item" :class="{ active: activeFilter === filter.key }"
                                @click="activeFilter = filter.key">
                                <NIcon size="16"><component :is="filter.icon" /></NIcon>
                                <span>{{ filter.label }}</span>
                                <span class="filter-count">{{ filter.count }}</span>
                            </button>
                        </div>

                        <div class="library-heading">
                            <NText depth="3">{{ t('aiConfig.workspace.configCount', { count: filteredConfigs.length }) }}</NText>
                        </div>

                        <NScrollbar class="config-results">
                            <NEmpty v-if="filteredConfigs.length === 0" size="small"
                                :description="t('aiConfig.workspace.noMatchingConfigs')" class="library-empty" />
                            <button v-for="config in filteredConfigs" v-else :key="config.id" type="button"
                                class="config-list-item" :class="{ active: selectedConfig?.id === config.id }"
                                @click="selectConfig(config)">
                                <span class="provider-icon"><NIcon size="18"><component :is="getConfigIcon(config)" /></NIcon></span>
                                <span class="config-list-copy">
                                    <span class="config-list-title-row">
                                        <span class="config-list-title">{{ config.name }}</span>
                                    </span>
                                    <span class="config-list-meta">
                                        <span>{{ getConfigDisplayLabel(config) }}</span>
                                        <span>·</span>
                                        <span>{{ config.defaultModel || config.customModel || t('aiConfig.workspace.noDefaultModel') }}</span>
                                    </span>
                                </span>
                                <span v-if="config.isPreferred && config.enabled" class="preferred-marker"
                                    :title="t('aiConfig.globalPreferred')">
                                    <NIcon size="15" color="var(--accent-warning)"><Star /></NIcon>
                                </span>
                                <span class="status-dot" :class="config.enabled ? 'enabled' : 'disabled'"
                                    :title="config.enabled ? t('aiConfig.enabled') : t('aiConfig.disabled')" />
                            </button>
                        </NScrollbar>
                    </aside>
                </template>

                <template #resize-trigger><div class="workspace-resize-line" /></template>

                <template #2>
                    <main v-if="selectedConfig" class="config-workspace">
                        <header class="workspace-header">
                            <div class="workspace-identity">
                                <span class="workspace-provider-icon"><NIcon size="22"><component :is="getConfigIcon(selectedConfig)" /></NIcon></span>
                                <div class="workspace-title-copy">
                                    <div class="workspace-title-row">
                                        <NText strong class="workspace-title">{{ selectedConfig.name }}</NText>
                                        <NTag size="small">{{ getConfigDisplayLabel(selectedConfig) }}</NTag>
                                        <NTag size="small" :type="selectedConfig.enabled ? 'success' : 'default'">
                                            {{ selectedConfig.enabled ? t('aiConfig.enabled') : t('aiConfig.disabled') }}
                                        </NTag>
                                    </div>
                                    <NText depth="3" class="workspace-subtitle">
                                        {{ selectedConfig.defaultModel || selectedConfig.customModel || t('aiConfig.workspace.noDefaultModel') }}
                                    </NText>
                                </div>
                            </div>

                            <div class="workspace-actions">
                                <NTooltip>
                                    <template #trigger>
                                        <NSwitch :value="selectedConfig.enabled" :loading="togglingConfigId === selectedConfig.id"
                                            @update:value="value => toggleConfig(selectedConfig!, value)" />
                                    </template>
                                    {{ selectedConfig.enabled ? t('aiConfig.workspace.disableConfig') : t('aiConfig.workspace.enableConfig') }}
                                </NTooltip>
                                <NButton size="small" :disabled="!selectedConfig.enabled" @click="setPreferred(selectedConfig)">
                                    <template #icon><NIcon size="16"><Star /></NIcon></template>
                                    {{ selectedConfig.isPreferred ? t('aiConfig.cancelPreferred') : t('aiConfig.setAsPreferred') }}
                                </NButton>
                                <NButton size="small" @click="editSystemPrompt(selectedConfig)">
                                    <template #icon><NIcon size="16"><Edit /></NIcon></template>
                                    {{ t('aiConfig.systemPrompt') }}
                                </NButton>
                                <NButton type="primary" size="small" @click="openEditConfig(selectedConfig)">
                                    <template #icon><NIcon size="16"><Settings /></NIcon></template>
                                    {{ t('aiConfig.edit') }}
                                </NButton>
                                <NTooltip>
                                    <template #trigger>
                                        <NButton quaternary circle size="small" type="error" :aria-label="t('aiConfig.delete')"
                                            @click="deleteConfig(selectedConfig)">
                                            <template #icon><NIcon size="16"><Trash /></NIcon></template>
                                        </NButton>
                                    </template>
                                    {{ t('aiConfig.delete') }}
                                </NTooltip>
                            </div>
                        </header>

                        <NScrollbar class="workspace-scroll">
                            <div class="workspace-sections">
                                <NAlert v-if="selectedConfig.isPreferred && selectedConfig.enabled" type="success" :show-icon="false">
                                    {{ t('aiConfig.workspace.preferredDescription') }}
                                </NAlert>
                                <NAlert v-else-if="selectedConfig.id === fallbackConfig?.id" type="warning" :show-icon="false">
                                    {{ t('aiConfig.workspace.fallbackDescription') }}
                                </NAlert>

                                <section class="detail-panel ui-surface">
                                    <div class="section-heading">
                                        <div>
                                            <NText strong class="section-title">{{ t('aiConfig.workspace.connectionSection') }}</NText>
                                            <NText depth="3" class="section-description">{{ t('aiConfig.workspace.connectionSectionDesc') }}</NText>
                                        </div>
                                        <NButton size="small" :loading="testingConfigs.has(selectedConfig.id!)"
                                            :disabled="!selectedConfig.enabled" @click="testConfig(selectedConfig)">
                                            <template #icon><NIcon size="16"><AccessPoint /></NIcon></template>
                                            {{ t('aiConfig.connectionTest') }}
                                        </NButton>
                                    </div>
                                    <div class="detail-grid">
                                        <div class="detail-field detail-field-wide">
                                            <span class="field-label">{{ t('aiConfig.baseURL') }}</span>
                                            <span class="field-value code-value">{{ selectedConfig.baseURL || t('aiConfig.workspace.officialEndpoint') }}</span>
                                        </div>
                                        <div class="detail-field">
                                            <span class="field-label">{{ t('aiConfig.workspace.credential') }}</span>
                                            <span class="field-value">{{ selectedConfig.apiKey ? maskSecret(selectedConfig.apiKey) : t('aiConfig.workspace.notRequired') }}</span>
                                        </div>
                                    </div>
                                    <NAlert v-if="connectionResults[selectedConfig.id!]" class="inline-result"
                                        :type="connectionResults[selectedConfig.id!].success ? 'success' : 'error'"
                                        :title="connectionResults[selectedConfig.id!].success ? t('aiConfig.connectionTestSuccess') : t('aiConfig.testFailedTitle')">
                                        {{ connectionResults[selectedConfig.id!].success ? t('aiConfig.workspace.connectionVerified') : connectionResults[selectedConfig.id!].error }}
                                    </NAlert>
                                </section>

                                <section class="detail-panel ui-surface">
                                    <div class="section-heading">
                                        <div>
                                            <NText strong class="section-title">{{ t('aiConfig.workspace.modelsSection') }}</NText>
                                            <NText depth="3" class="section-description">{{ t('aiConfig.workspace.modelsSectionDesc') }}</NText>
                                        </div>
                                    </div>
                                    <div class="detail-grid">
                                        <div class="detail-field">
                                            <span class="field-label">{{ t('aiConfig.defaultModel') }}</span>
                                            <span class="field-value">{{ selectedConfig.defaultModel || t('aiConfig.workspace.notConfigured') }}</span>
                                        </div>
                                        <div class="detail-field">
                                            <span class="field-label">{{ t('aiConfig.availableModels') }}</span>
                                            <span class="field-value">{{ t('aiConfig.workspace.modelCount', { count: selectedConfig.models?.length || 0 }) }}</span>
                                        </div>
                                    </div>
                                    <div v-if="selectedConfig.models?.length" class="model-tags">
                                        <NTag v-for="model in selectedConfig.models" :key="model" size="small"
                                            :type="model === selectedConfig.defaultModel ? 'primary' : 'default'">{{ model }}</NTag>
                                    </div>
                                    <div class="request-test-bar ui-surface-muted">
                                        <NSelect v-model:value="requestTestModels[selectedConfig.id!]" size="small" filterable tag
                                            :options="getModelOptions(selectedConfig)" :placeholder="t('aiConfig.selectModelToTest')" />
                                        <NButton size="small" :loading="intelligentTestingConfigs.has(selectedConfig.id!)"
                                            :disabled="!selectedConfig.enabled || !requestTestModels[selectedConfig.id!]"
                                            @click="intelligentTest(selectedConfig)">
                                            <template #icon><NIcon size="16"><Robot /></NIcon></template>
                                            {{ t('aiConfig.requestTest') }}
                                        </NButton>
                                    </div>
                                    <NAlert v-if="requestResults[selectedConfig.id!]" class="inline-result"
                                        :type="requestResults[selectedConfig.id!].success ? 'success' : 'error'"
                                        :title="requestResults[selectedConfig.id!].success ? t('aiConfig.modelTestSuccess') : t('aiConfig.modelTestFailed')">
                                        <div v-if="requestResults[selectedConfig.id!].inputPrompt" class="result-block">
                                            <span class="field-label">{{ t('aiConfig.inputPrompt') }}</span>
                                            <pre>{{ requestResults[selectedConfig.id!].inputPrompt }}</pre>
                                        </div>
                                        <div v-if="requestResults[selectedConfig.id!].response" class="result-block">
                                            <span class="field-label">{{ t('aiConfig.aiResponse') }}</span>
                                            <pre>{{ requestResults[selectedConfig.id!].response }}</pre>
                                        </div>
                                        <span v-if="requestResults[selectedConfig.id!].error">{{ requestResults[selectedConfig.id!].error }}</span>
                                    </NAlert>
                                </section>

                                <section class="detail-panel ui-surface">
                                    <div class="section-heading">
                                        <div>
                                            <NText strong class="section-title">{{ t('aiConfig.workspace.behaviorSection') }}</NText>
                                            <NText depth="3" class="section-description">{{ t('aiConfig.workspace.behaviorSectionDesc') }}</NText>
                                        </div>
                                        <NButton size="small" @click="editSystemPrompt(selectedConfig)">{{ t('aiConfig.workspace.editPrompt') }}</NButton>
                                    </div>
                                    <div class="prompt-preview">{{ selectedConfig.systemPrompt || t('aiConfig.workspace.defaultPromptInUse') }}</div>
                                </section>

                                <section class="detail-panel ui-surface">
                                    <div class="section-heading compact-heading">
                                        <NText strong class="section-title">{{ t('aiConfig.workspace.metadataSection') }}</NText>
                                    </div>
                                    <div class="detail-grid metadata-grid">
                                        <div class="detail-field"><span class="field-label">{{ t('aiConfig.createdAt') }}</span><span class="field-value">{{ formatDate(selectedConfig.createdAt) }}</span></div>
                                        <div class="detail-field"><span class="field-label">{{ t('aiConfig.workspace.updatedAt') }}</span><span class="field-value">{{ formatDate(selectedConfig.updatedAt) }}</span></div>
                                        <div class="detail-field detail-field-wide"><span class="field-label">Config ID</span><span class="field-value code-value">{{ selectedConfig.configId }}</span></div>
                                    </div>
                                </section>
                            </div>
                        </NScrollbar>
                    </main>

                    <div v-else class="workspace-empty">
                        <NEmpty :description="t('aiConfig.workspace.selectConfig')" />
                    </div>
                </template>
            </NSplit>
        </div>

        <CommonModal :show="showEditorModal" @update:show="handleEditorShowUpdate">
            <template #header>
                <div class="modal-title-row">
                    <span class="modal-title-icon"><NIcon size="20"><Settings /></NIcon></span>
                    <div>
                        <NText strong class="modal-title">{{ editingConfig ? t('aiConfig.editConfig') : t('aiConfig.addConfig') }}</NText>
                        <NText depth="3" class="modal-subtitle">{{ editingConfig ? t('aiConfig.editConfigDesc') : t('aiConfig.addConfigDesc') }}</NText>
                    </div>
                </div>
            </template>

            <template #content="{ contentHeight }">
                <div class="editor-shell" :style="{ height: `${contentHeight}px` }">
                    <div class="editor-navigation" :class="{ 'create-navigation': !editingConfig }">
                        <button v-for="section in editorSections" :key="section.key" type="button"
                            class="editor-nav-item" :class="{ active: activeEditorSection === section.key, complete: isEditorSectionComplete(section.key) }"
                            :disabled="!editingConfig && !canNavigateToCreateSection(section.key)"
                            @click="navigateEditorSection(section.key)">
                            <span class="step-index">{{ section.index }}</span>
                            <span><strong>{{ section.label }}</strong><small>{{ section.description }}</small></span>
                        </button>
                    </div>

                    <NScrollbar class="editor-content">
                        <div class="editor-content-inner">
                            <section v-if="activeEditorSection === 'provider'" class="editor-section">
                                <div class="editor-section-heading">
                                    <NText strong>{{ t('aiConfig.workspace.chooseProvider') }}</NText>
                                    <NText depth="3">{{ t('aiConfig.workspace.chooseProviderDesc') }}</NText>
                                </div>
                                <div v-for="group in providerGroups" :key="group.key" class="provider-group">
                                    <div class="provider-group-title"><NIcon size="16"><component :is="group.icon" /></NIcon>{{ group.label }}</div>
                                    <div class="provider-grid">
                                        <button v-for="provider in group.providers" :key="provider.id" type="button"
                                            class="provider-card" :class="{ active: selectedProviderChoiceId === provider.id }"
                                            @click="selectProviderChoice(provider)">
                                            <span class="provider-card-icon"><NIcon size="20"><component :is="provider.icon" /></NIcon></span>
                                            <span class="provider-card-copy"><strong>{{ provider.label }}</strong><small>{{ provider.description }}</small></span>
                                            <NIcon v-if="selectedProviderChoiceId === provider.id" size="18" color="var(--content-secondary)"><Check /></NIcon>
                                        </button>
                                    </div>
                                </div>
                            </section>

                            <section v-else-if="activeEditorSection === 'connection'" class="editor-section">
                                <div class="editor-section-heading">
                                    <NText strong>{{ t('aiConfig.workspace.configureConnection') }}</NText>
                                    <NText depth="3">{{ t('aiConfig.workspace.configureConnectionDesc') }}</NText>
                                </div>
                                <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="top">
                                    <div class="form-panel ui-surface">
                                        <div class="form-grid">
                                            <NFormItem :label="t('aiConfig.serviceType')" path="type">
                                                <NSelect v-model:value="formData.type" :options="flatProviderOptions" @update:value="onTypeChange" />
                                            </NFormItem>
                                            <NFormItem :label="t('aiConfig.configName')" path="name">
                                                <NInput v-model:value="formData.name" :placeholder="t('aiConfig.configNamePlaceholder')" />
                                            </NFormItem>
                                            <NFormItem v-if="needsBaseURL || supportsCustomEndpoint" :label="getBaseURLInfo.label" path="baseURL" class="form-span-2">
                                                <NInput v-model:value="formData.baseURL" :placeholder="getBaseURLInfo.placeholder" />
                                            </NFormItem>
                                            <NFormItem v-if="needsApiKey" :label="getApiKeyLabel" path="apiKey" class="form-span-2">
                                                <NInput v-model:value="formData.apiKey" type="password" show-password-on="click"
                                                    :placeholder="t('aiConfig.workspace.apiKeyPlaceholder')" />
                                            </NFormItem>
                                        </div>
                                    </div>

                                    <div class="provider-help ui-surface-muted">
                                        <div><NText strong>{{ selectedProviderChoice?.label || getConfigTypeLabel(formData.type) }}</NText><NText depth="3">{{ selectedProviderChoice?.description || getProviderDescription(formData.type) }}</NText></div>
                                        <NFlex size="small">
                                            <NButton v-if="getApiKeyInfo.apiKeyUrl" text size="small" @click="openApiKeyUrl"><template #icon><NIcon><ExternalLink /></NIcon></template>{{ t('aiConfig.getApiKey') }}</NButton>
                                            <NButton v-if="getApiKeyInfo.docUrl" text size="small" @click="openDocumentationUrl"><template #icon><NIcon><Book /></NIcon></template>{{ t('aiConfig.viewDocumentation') }}</NButton>
                                        </NFlex>
                                    </div>

                                    <div class="connection-test-panel ui-surface">
                                        <div class="section-heading">
                                            <div><NText strong>{{ t('aiConfig.connectionTest') }}</NText><NText depth="3" class="section-description">{{ t('aiConfig.workspace.connectionTestDesc') }}</NText></div>
                                            <NButton type="primary" size="small" :loading="testingFormConnection" :disabled="!canTestConnection" @click="testFormConnection">
                                                <template #icon><NIcon><AccessPoint /></NIcon></template>{{ t('aiConfig.connectionTest') }}
                                            </NButton>
                                        </div>
                                        <NAlert v-if="formTestResult" :type="formTestResult.success ? 'success' : 'error'"
                                            :title="formTestResult.success ? t('aiConfig.testSuccess') : t('aiConfig.testFailed')">
                                            {{ formTestResult.success ? t('aiConfig.workspace.connectionVerified') : formTestResult.error }}
                                        </NAlert>
                                    </div>
                                </NForm>
                            </section>

                            <section v-else class="editor-section">
                                <div class="editor-section-heading">
                                    <NText strong>{{ t('aiConfig.workspace.configureModels') }}</NText>
                                    <NText depth="3">{{ t('aiConfig.workspace.configureModelsDesc') }}</NText>
                                </div>
                                <div class="form-panel ui-surface">
                                    <div class="section-heading model-list-heading">
                                        <div>
                                            <NText strong>{{ t('aiConfig.modelList') }}</NText>
                                            <NText depth="3" class="section-description">{{ t('aiConfig.workspace.modelFetchDesc') }}</NText>
                                        </div>
                                        <NButton size="small" :loading="fetchingModels" :disabled="!canTestConnection" @click="fetchModelList(true)">
                                            <template #icon><NIcon><CloudDownload /></NIcon></template>{{ t('aiConfig.workspace.fetchModels') }}
                                        </NButton>
                                    </div>
                                    <NAlert v-if="modelFetchState !== 'idle'" class="model-fetch-result"
                                        :type="modelFetchState === 'success' ? 'success' : modelFetchState === 'error' ? 'error' : 'warning'"
                                        :title="modelFetchState === 'success' ? t('aiConfig.workspace.modelsFetched') : t('aiConfig.workspace.modelsNotFetched')">
                                        {{ modelFetchMessage }}
                                    </NAlert>
                                    <NForm :model="formData" label-placement="top">
                                        <NFormItem :label="t('aiConfig.workspace.availableModelNames')">
                                            <NDynamicTags v-model:value="formData.models" />
                                            <template #feedback>{{ t('aiConfig.workspace.manualModelTip') }}</template>
                                        </NFormItem>
                                        <div class="form-grid">
                                            <NFormItem :label="t('aiConfig.defaultModel')">
                                                <NSelect v-model:value="formData.defaultModel" :options="modelOptions" filterable tag clearable
                                                    :placeholder="t('aiConfig.selectDefaultModel')" />
                                            </NFormItem>
                                            <NFormItem :label="t('aiConfig.customModel')">
                                                <NInput v-model:value="formData.customModel" :placeholder="t('aiConfig.customModelPlaceholder')" />
                                            </NFormItem>
                                        </div>
                                    </NForm>
                                </div>
                                <div class="connection-test-panel ui-surface">
                                    <div class="section-heading">
                                        <div><NText strong>{{ t('aiConfig.modelTest') }}</NText><NText depth="3" class="section-description">{{ t('aiConfig.workspace.modelTestDesc') }}</NText></div>
                                    </div>
                                    <div class="request-test-bar ui-surface-muted">
                                        <NSelect v-model:value="selectedTestModel" :options="modelOptions" filterable tag
                                            :placeholder="t('aiConfig.selectModelToTest')" />
                                        <NButton size="small" :loading="testingSelectedModel" :disabled="!selectedTestModel || !canTestConnection" @click="testSelectedModel">
                                            <template #icon><NIcon><Robot /></NIcon></template>{{ t('aiConfig.testSelectedModel') }}
                                        </NButton>
                                    </div>
                                    <NAlert v-if="modelTestResult" :type="modelTestResult.success ? 'success' : 'error'"
                                        :title="modelTestResult.success ? t('aiConfig.modelTestSuccess') : t('aiConfig.modelTestFailed')">
                                        <span v-if="modelTestResult.response">{{ modelTestResult.response }}</span>
                                        <span v-else>{{ modelTestResult.error }}</span>
                                    </NAlert>
                                </div>
                            </section>
                        </div>
                    </NScrollbar>
                </div>
            </template>

            <template #footer>
                <NFlex justify="space-between" align="center">
                    <NText depth="3" class="dirty-indicator">{{ editorDirty ? t('aiConfig.workspace.unsavedChanges') : '' }}</NText>
                    <NFlex>
                        <NButton @click="requestCloseEditor">{{ t('common.cancel') }}</NButton>
                        <NButton v-if="!editingConfig && activeEditorSection !== 'provider'" @click="previousCreateStep">
                            <template #icon><NIcon><ChevronLeft /></NIcon></template>{{ t('common.previous') }}
                        </NButton>
                        <NButton v-if="!editingConfig && activeEditorSection !== 'models'" type="primary" @click="nextCreateStep">
                            {{ t('common.next') }}<template #icon><NIcon><ChevronRight /></NIcon></template>
                        </NButton>
                        <NButton v-else type="primary" :loading="saving" @click="saveConfig">
                            {{ editingConfig ? t('aiConfig.updateConfig') : t('aiConfig.addConfigButton') }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </template>
        </CommonModal>

        <CommonModal :show="showSystemPromptModal" @update:show="handleSystemPromptShowUpdate">
            <template #header>
                <div class="modal-title-row">
                    <span class="modal-title-icon"><NIcon size="20"><Edit /></NIcon></span>
                    <div><NText strong class="modal-title">{{ t('aiConfig.editGenerationPrompt') }}</NText><NText depth="3" class="modal-subtitle">{{ editingSystemPromptConfig?.name }} · {{ t('aiConfig.customSystemPromptDesc') }}</NText></div>
                </div>
            </template>
            <template #content="{ contentHeight }">
                <div class="prompt-editor-shell" :style="{ height: `${contentHeight}px` }">
                    <NAlert type="info" :show-icon="false">{{ t('aiConfig.systemPromptTip') }}</NAlert>
                    <NInput v-model:value="systemPromptContent" type="textarea" :placeholder="t('aiConfig.systemPromptPlaceholder')"
                        class="system-prompt-input" :autosize="false" show-count />
                </div>
            </template>
            <template #footer>
                <NFlex justify="space-between">
                    <NButton secondary @click="resetSystemPromptToDefault">{{ t('aiConfig.resetToDefault') }}</NButton>
                    <NFlex><NButton @click="requestCloseSystemPrompt">{{ t('common.cancel') }}</NButton><NButton type="primary" :loading="savingSystemPrompt" @click="saveSystemPrompt">{{ t('common.save') }}</NButton></NFlex>
                </NFlex>
            </template>
        </CommonModal>

        <QuickOptimizationConfigModal :show="showQuickOptimizationModal"
            @update:show="showQuickOptimizationModal = $event"
            @configs-updated="handleQuickOptimizationConfigsUpdated" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    NAlert, NButton, NDynamicTags, NEmpty, NFlex, NForm, NFormItem, NIcon, NInput,
    NResult, NScrollbar, NSelect, NSpin, NSplit, NSwitch, NTag, NText, NTooltip,
    useDialog, useMessage,
} from 'naive-ui'
import {
    AccessPoint, Api, Atom, Book, BrandGoogle, BrandOpenSource, BrandWindows, Check,
    ChevronLeft, ChevronRight, Circles, Cloud, CloudDownload, DeviceDesktop, Edit, ExternalLink,
    LetterA, LetterD, LetterM, LetterT, LetterX, LetterZ, ListDetails, Plus, Refresh, Robot, Route,
    Search, Server, Settings, Star, Trash,
} from '@vicons/tabler'
import type { AIConfig, AIConfigTestResult, AIProviderType } from '@shared/types/ai'
import { getDefaultBaseURL, getProviderMetadata } from '@shared/ai-provider-metadata'
import { databaseService } from '@/lib/db'
import { useDatabase } from '@/composables/useDatabase'
import { openExternalUrl } from '@/lib/platform/shell'
import CommonModal from '@/components/common/CommonModal.vue'
import QuickOptimizationConfigModal from '@/components/ai/QuickOptimizationConfigModal.vue'

type ConfigFilter = 'all' | 'enabled' | 'disabled' | 'local' | 'online'
type EditorSection = 'provider' | 'connection' | 'models'
type RequestTestResult = AIConfigTestResult & { inputPrompt?: string }
type ModelFetchState = 'idle' | 'success' | 'empty' | 'error'

interface ProviderChoice {
    id: string
    type: AIProviderType
    label: string
    description: string
    icon: Component
    defaultName: string
    baseURL?: string
    placeholder?: string
    apiKeyUrl?: string
    docUrl?: string
    custom?: boolean
}

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const { waitForDatabase } = useDatabase()

const configs = ref<AIConfig[]>([])
const loading = ref(true)
const loadError = ref('')
const selectedConfigId = ref<number | null>(null)
const searchText = ref('')
const activeFilter = ref<ConfigFilter>('all')
const storedLibraryPaneSize = localStorage.getItem('ai_config_library_pane_size')
const libraryPaneSize = ref(storedLibraryPaneSize && /^\d+(\.\d+)?px$/.test(storedLibraryPaneSize) ? storedLibraryPaneSize : '280px')

const showEditorModal = ref(false)
const editingConfig = ref<AIConfig | null>(null)
const activeEditorSection = ref<EditorSection>('provider')
const editorSnapshot = ref('')
const saving = ref(false)
const formRef = ref<any>()
const testingFormConnection = ref(false)
const formTestResult = ref<AIConfigTestResult | null>(null)
const lastTestFingerprint = ref('')
const fetchingModels = ref(false)
const modelFetchAttempted = ref(false)
const modelFetchState = ref<ModelFetchState>('idle')
const modelFetchMessage = ref('')
const selectedTestModel = ref('')
const testingSelectedModel = ref(false)
const modelTestResult = ref<AIConfigTestResult | null>(null)

const testingConfigs = ref(new Set<number>())
const intelligentTestingConfigs = ref(new Set<number>())
const togglingConfigId = ref<number | null>(null)
const connectionResults = reactive<Record<number, AIConfigTestResult>>({})
const requestResults = reactive<Record<number, RequestTestResult>>({})
const requestTestModels = reactive<Record<number, string>>({})

const showSystemPromptModal = ref(false)
const editingSystemPromptConfig = ref<AIConfig | null>(null)
const systemPromptContent = ref('')
const systemPromptSnapshot = ref('')
const savingSystemPrompt = ref(false)
const showQuickOptimizationModal = ref(false)

const formData = reactive({
    type: 'openai' as AIProviderType,
    name: '',
    baseURL: '',
    apiKey: '',
    models: [] as string[],
    defaultModel: '',
    customModel: '',
    systemPrompt: '',
})

const localProviderTypes: AIProviderType[] = ['ollama', 'lmstudio']
const onlineProviderTypes: AIProviderType[] = ['openai', 'anthropic', 'google', 'azure', 'mistral', 'openrouter', 'deepseek', 'tencent', 'aliyun', 'zhipu', 'siliconflow']
const allProviderTypes = [...localProviderTypes, ...onlineProviderTypes]

const providerIcons: Record<AIProviderType, Component> = {
    openai: Atom,
    ollama: BrandOpenSource,
    anthropic: LetterA,
    google: BrandGoogle,
    azure: BrandWindows,
    lmstudio: DeviceDesktop,
    deepseek: LetterD,
    mistral: LetterM,
    siliconflow: Circles,
    tencent: LetterT,
    aliyun: Cloud,
    zhipu: LetterZ,
    openrouter: Route,
}

const officialProviderChoices = computed<ProviderChoice[]>(() => allProviderTypes.map(type => ({
    id: `official:${type}`,
    type,
    label: getConfigTypeLabel(type),
    description: getProviderDescription(type),
    icon: providerIcons[type],
    defaultName: getConfigTypeLabel(type),
    baseURL: getDefaultBaseURL(type),
})))

const compatibilityProviderChoices = computed<ProviderChoice[]>(() => [
    {
        id: 'custom:openai', type: 'openai', label: t('aiConfig.workspace.customOpenAI'),
        description: t('aiConfig.workspace.customOpenAIDesc'), icon: Api,
        defaultName: t('aiConfig.workspace.customOpenAI'), baseURL: '',
        placeholder: 'https://your-provider.example/v1', custom: true,
    },
    {
        id: 'custom:claude', type: 'anthropic', label: t('aiConfig.workspace.customClaude'),
        description: t('aiConfig.workspace.customClaudeDesc'), icon: LetterA,
        defaultName: t('aiConfig.workspace.customClaude'), baseURL: '',
        placeholder: 'https://your-provider.example', custom: true,
    },
])

const onlinePresetChoices = computed<ProviderChoice[]>(() => [
    {
        id: 'preset:groq', type: 'openai', label: 'Groq',
        description: t('aiConfig.workspace.groqPresetDesc'), icon: LetterX,
        defaultName: 'Groq', baseURL: 'https://api.groq.com/openai/v1', custom: true,
        apiKeyUrl: 'https://console.groq.com/keys', docUrl: 'https://console.groq.com/docs/quickstart',
    },
    {
        id: 'preset:moonshot', type: 'openai', label: 'Moonshot AI',
        description: t('aiConfig.workspace.moonshotPresetDesc'), icon: LetterM,
        defaultName: 'Moonshot AI', baseURL: 'https://api.moonshot.cn/v1', custom: true,
        apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys', docUrl: 'https://platform.moonshot.cn/docs/intro',
    },
    {
        id: 'preset:together', type: 'openai', label: 'Together AI',
        description: t('aiConfig.workspace.togetherPresetDesc'), icon: Circles,
        defaultName: 'Together AI', baseURL: 'https://api.together.xyz/v1', custom: true,
        apiKeyUrl: 'https://api.together.ai/settings/api-keys', docUrl: 'https://docs.together.ai/docs/quickstart',
    },
    {
        id: 'preset:vllm', type: 'openai', label: 'vLLM',
        description: t('aiConfig.workspace.vllmPresetDesc'), icon: Server,
        defaultName: 'vLLM', baseURL: 'http://localhost:8000/v1', custom: true,
        docUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
    },
])

const providerGroups = computed(() => [
    { key: 'local', label: t('aiConfig.localServices'), icon: DeviceDesktop, providers: officialProviderChoices.value.filter(provider => localProviderTypes.includes(provider.type)) },
    { key: 'online', label: t('aiConfig.onlineServices'), icon: Cloud, providers: [...officialProviderChoices.value.filter(provider => onlineProviderTypes.includes(provider.type)), ...onlinePresetChoices.value] },
    { key: 'custom', label: t('aiConfig.workspace.customServices'), icon: Api, providers: compatibilityProviderChoices.value },
])
const flatProviderOptions = computed(() => allProviderTypes.map(value => ({ value, label: getConfigTypeLabel(value) })))
const selectedProviderChoiceId = ref('official:openai')
const lastAutoConfigName = ref('OpenAI')
const allProviderChoices = computed(() => [...officialProviderChoices.value, ...onlinePresetChoices.value, ...compatibilityProviderChoices.value])
const selectedProviderChoice = computed(() => allProviderChoices.value.find(choice => choice.id === selectedProviderChoiceId.value) || null)

const selectedConfig = computed(() => configs.value.find(config => config.id === selectedConfigId.value) || null)
const explicitPreferredConfig = computed(() => configs.value.find(config => config.isPreferred && config.enabled) || null)
const fallbackConfig = computed(() => explicitPreferredConfig.value || configs.value.find(config => config.enabled) || null)
const enabledCount = computed(() => configs.value.filter(config => config.enabled).length)

const filterOptions = computed(() => [
    { key: 'all' as const, label: t('aiConfig.workspace.allConfigs'), icon: ListDetails, count: configs.value.length },
    { key: 'enabled' as const, label: t('aiConfig.enabled'), icon: Check, count: enabledCount.value },
    { key: 'disabled' as const, label: t('aiConfig.disabled'), icon: Settings, count: configs.value.length - enabledCount.value },
    { key: 'local' as const, label: t('aiConfig.localServices'), icon: DeviceDesktop, count: configs.value.filter(config => isLocalProvider(config.type)).length },
    { key: 'online' as const, label: t('aiConfig.onlineServices'), icon: Server, count: configs.value.filter(config => !isLocalProvider(config.type)).length },
])

const filteredConfigs = computed(() => {
    let result = configs.value.filter(config => {
        if (activeFilter.value === 'enabled') return config.enabled
        if (activeFilter.value === 'disabled') return !config.enabled
        if (activeFilter.value === 'local') return isLocalProvider(config.type)
        if (activeFilter.value === 'online') return !isLocalProvider(config.type)
        return true
    })
    const query = searchText.value.trim().toLocaleLowerCase()
    if (query) {
        result = result.filter(config => `${config.name} ${getConfigTypeLabel(config.type)} ${config.baseURL} ${(config.models || []).join(' ')}`.toLocaleLowerCase().includes(query))
    }
    return result
})

const isCustomProviderChoice = computed(() => Boolean(selectedProviderChoice.value?.custom))
const needsBaseURL = computed(() => isCustomProviderChoice.value || !['anthropic', 'google'].includes(formData.type))
const supportsCustomEndpoint = computed(() => ['anthropic', 'google'].includes(formData.type))
const needsApiKey = computed(() => !isLocalProvider(formData.type))
const canTestConnection = computed(() => (!needsApiKey.value || Boolean(formData.apiKey.trim())) && (!needsBaseURL.value || Boolean(formData.baseURL.trim())))
const connectionFingerprint = computed(() => JSON.stringify({ type: formData.type, baseURL: formData.baseURL.trim(), apiKey: formData.apiKey }))
const getApiKeyLabel = computed(() => `${getConfigTypeLabel(formData.type)} API Key`)
const getApiKeyInfo = computed(() => selectedProviderChoice.value?.custom
    ? { apiKeyUrl: selectedProviderChoice.value.apiKeyUrl || '', docUrl: selectedProviderChoice.value.docUrl || '' }
    : getProviderMetadata(formData.type))
const getBaseURLInfo = computed(() => ({
    label: isCustomProviderChoice.value ? t('aiConfig.workspace.customServiceEndpoint') : ['anthropic', 'google'].includes(formData.type) ? t('aiConfig.customEndpoint') : t('aiConfig.baseURL'),
    placeholder: selectedProviderChoice.value?.placeholder || getDefaultBaseURL(formData.type) || t('aiConfig.useOfficialEndpoint'),
}))
const modelOptions = computed(() => formData.models.map(model => ({ label: model, value: model })))

const editorSections = computed(() => [
    { key: 'provider' as const, index: 1, label: t('aiConfig.workspace.providerStep'), description: t('aiConfig.workspace.providerStepDesc') },
    { key: 'connection' as const, index: 2, label: t('aiConfig.workspace.connectionStep'), description: t('aiConfig.workspace.connectionStepDesc') },
    { key: 'models' as const, index: 3, label: t('aiConfig.workspace.modelsStep'), description: t('aiConfig.workspace.modelsStepDesc') },
])

const serializeForm = () => JSON.stringify({
    type: formData.type, name: formData.name, baseURL: formData.baseURL, apiKey: formData.apiKey,
    models: formData.models, defaultModel: formData.defaultModel, customModel: formData.customModel,
    systemPrompt: formData.systemPrompt,
})
const editorDirty = computed(() => showEditorModal.value && serializeForm() !== editorSnapshot.value)
const systemPromptDirty = computed(() => showSystemPromptModal.value && systemPromptContent.value !== systemPromptSnapshot.value)

const formRules = computed(() => ({
    type: [{ required: true, message: t('aiConfig.pleaseSelectType'), trigger: 'change' }],
    name: [{ required: true, message: t('aiConfig.pleaseEnterConfigName'), trigger: 'blur' }],
    baseURL: [{ required: needsBaseURL.value, message: t('aiConfig.pleaseEnterBaseURL'), trigger: 'blur' }],
    apiKey: [{ required: needsApiKey.value, message: t('aiConfig.pleaseEnterAPIKey'), trigger: 'blur' }],
}))

const isLocalProvider = (type: AIProviderType) => localProviderTypes.includes(type)
const getConfigTypeLabel = (type: AIProviderType) => getProviderMetadata(type).displayName
const getProviderDescription = (type: AIProviderType) => t(`aiConfig.serviceDescriptions.${type}`)
const normalizeURL = (value?: string) => (value || '').trim().replace(/\/+$/, '')
const isCustomConfig = (config: AIConfig) => (
    config.type === 'openai' && normalizeURL(config.baseURL) !== normalizeURL(getDefaultBaseURL('openai'))
) || (
    config.type === 'anthropic' && Boolean(normalizeURL(config.baseURL))
)
const findPresetChoice = (config: AIConfig) => onlinePresetChoices.value.find(choice => (
    choice.type === config.type
    && Boolean(choice.baseURL)
    && normalizeURL(choice.baseURL) === normalizeURL(config.baseURL)
))
const getConfigDisplayLabel = (config: AIConfig) => findPresetChoice(config)?.label || (isCustomConfig(config)
    ? config.type === 'anthropic' ? t('aiConfig.workspace.claudeCompatible') : t('aiConfig.workspace.openAICompatible')
    : getConfigTypeLabel(config.type))
const getProviderIcon = (type: AIProviderType) => providerIcons[type]
const getConfigIcon = (config: AIConfig) => findPresetChoice(config)?.icon || (isCustomConfig(config) ? Api : getProviderIcon(config.type))
const maskSecret = (value: string) => value.length <= 8 ? '••••••••' : `${value.slice(0, 3)}••••••${value.slice(-3)}`
const formatDate = (date: Date | string) => new Date(date).toLocaleString()
const getModelOptions = (config: AIConfig) => [...new Set([...(config.models || []), config.defaultModel, config.customModel].filter(Boolean) as string[])].map(model => ({ label: model, value: model }))

const serializeConfig = (config: AIConfig) => ({
    id: config.id, configId: config.configId, name: config.name, type: config.type, baseURL: config.baseURL,
    apiKey: config.apiKey, secretKey: config.secretKey, models: [...(config.models || [])],
    defaultModel: config.defaultModel, customModel: config.customModel, enabled: config.enabled,
    systemPrompt: config.systemPrompt, createdAt: new Date(config.createdAt), updatedAt: new Date(config.updatedAt),
})

const loadConfigs = async () => {
    loading.value = true
    loadError.value = ''
    try {
        const result = await databaseService.aiConfig.getAllAIConfigs()
        configs.value = result
        const storedId = Number(localStorage.getItem('ai_config_workspace_last_id'))
        const selected = result.find(config => config.id === selectedConfigId.value)
            || result.find(config => config.id === storedId)
            || result.find(config => config.isPreferred && config.enabled)
            || result.find(config => config.enabled)
            || result[0]
        selectedConfigId.value = selected?.id || null
        result.forEach(config => {
            if (config.id && !requestTestModels[config.id]) requestTestModels[config.id] = config.defaultModel || config.customModel || config.models?.[0] || ''
        })
    } catch (error) {
        console.error(error)
        loadError.value = (error as Error).message
    } finally {
        loading.value = false
    }
}

const selectConfig = (config: AIConfig) => {
    selectedConfigId.value = config.id || null
    if (config.id) localStorage.setItem('ai_config_workspace_last_id', String(config.id))
}

const resolveProviderChoiceId = (config?: AIConfig) => {
    if (!config) return 'official:openai'
    const preset = findPresetChoice(config)
    if (preset) return preset.id
    if (isCustomConfig(config)) return config.type === 'anthropic' ? 'custom:claude' : 'custom:openai'
    return `official:${config.type}`
}

const resetEditorForm = (config?: AIConfig) => {
    formData.type = config?.type || 'openai'
    formData.name = config?.name || getConfigTypeLabel(formData.type)
    formData.baseURL = config?.baseURL ?? getDefaultBaseURL(formData.type)
    formData.apiKey = config?.apiKey || ''
    formData.models = [...(config?.models || [])]
    formData.defaultModel = config?.defaultModel || ''
    formData.customModel = config?.customModel || ''
    formData.systemPrompt = config?.systemPrompt || ''
    selectedProviderChoiceId.value = resolveProviderChoiceId(config)
    lastAutoConfigName.value = config ? '' : getConfigTypeLabel(formData.type)
    formTestResult.value = null
    lastTestFingerprint.value = ''
    fetchingModels.value = false
    modelFetchAttempted.value = false
    modelFetchState.value = 'idle'
    modelFetchMessage.value = ''
    modelTestResult.value = null
    selectedTestModel.value = config?.defaultModel || config?.customModel || config?.models?.[0] || ''
    editorSnapshot.value = serializeForm()
}

const openCreateConfig = () => {
    editingConfig.value = null
    activeEditorSection.value = 'provider'
    resetEditorForm()
    showEditorModal.value = true
}

const openEditConfig = (config: AIConfig) => {
    editingConfig.value = config
    activeEditorSection.value = 'connection'
    resetEditorForm(config)
    showEditorModal.value = true
}

const confirmDiscard = (content: string) => new Promise<boolean>(resolve => {
    let settled = false
    const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    dialog.warning({
        title: t('aiConfig.workspace.unsavedChanges'), content,
        positiveText: t('aiConfig.workspace.discardChanges'), negativeText: t('aiConfig.workspace.continueEditing'),
        maskClosable: false, onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
    })
})

const requestCloseEditor = async () => {
    if (editorDirty.value && !(await confirmDiscard(t('aiConfig.workspace.unsavedEditorMessage')))) return
    showEditorModal.value = false
    editingConfig.value = null
}
const handleEditorShowUpdate = (value: boolean) => { if (!value) requestCloseEditor() }

const selectProviderChoice = (choice: ProviderChoice) => {
    const shouldReplaceName = !formData.name.trim() || formData.name === lastAutoConfigName.value
    selectedProviderChoiceId.value = choice.id
    formData.type = choice.type
    if (shouldReplaceName) formData.name = choice.defaultName
    lastAutoConfigName.value = choice.defaultName
    formData.baseURL = choice.baseURL ?? getDefaultBaseURL(choice.type)
    formData.apiKey = ''
    formData.models = []
    formData.defaultModel = ''
    formData.customModel = ''
    formTestResult.value = null
    lastTestFingerprint.value = ''
    modelFetchAttempted.value = false
    modelFetchState.value = 'idle'
    modelFetchMessage.value = ''
    modelTestResult.value = null
    selectedTestModel.value = ''
}

const onTypeChange = (type: AIProviderType) => {
    const choice = officialProviderChoices.value.find(provider => provider.type === type)
    if (choice) selectProviderChoice(choice)
}

const canNavigateToCreateSection = (section: EditorSection) => {
    return Boolean(section)
}
const isEditorSectionComplete = (section: EditorSection) => {
    if (section === 'provider') return Boolean(formData.type)
    if (section === 'connection') return Boolean(formTestResult.value?.success)
    return Boolean(formData.defaultModel || formData.customModel)
}
const validateConnectionFields = () => {
    if (!formData.name.trim()) { message.warning(t('aiConfig.pleaseEnterConfigName')); return false }
    if (needsBaseURL.value && !formData.baseURL.trim()) { message.warning(t('aiConfig.pleaseEnterBaseURL')); return false }
    if (needsApiKey.value && !formData.apiKey.trim()) { message.warning(t('aiConfig.pleaseEnterAPIKey')); return false }
    return true
}

const confirmContinueAfterConnectionTest = () => new Promise<boolean>(resolve => {
    if (formTestResult.value?.success) { resolve(true); return }
    let settled = false
    const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    dialog.warning({
        title: formTestResult.value ? t('aiConfig.workspace.continueAfterFailedTestTitle') : t('aiConfig.workspace.continueWithoutTestTitle'),
        content: formTestResult.value
            ? t('aiConfig.workspace.continueAfterFailedTestMessage', { error: formTestResult.value.error || t('common.unknownError') })
            : t('aiConfig.workspace.continueWithoutTestMessage'),
        positiveText: t('aiConfig.workspace.continueToModels'),
        negativeText: t('aiConfig.workspace.stayAndTest'),
        maskClosable: false,
        onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
    })
})

const buildTemporaryConfig = (): AIConfig => ({
    configId: editingConfig.value?.configId || 'temp_test',
    name: formData.name || 'Test', type: formData.type, baseURL: formData.baseURL,
    apiKey: formData.apiKey, models: [...formData.models], defaultModel: formData.defaultModel || undefined,
    customModel: formData.customModel || undefined, enabled: true,
    createdAt: editingConfig.value?.createdAt || new Date(), updatedAt: new Date(),
})

const confirmReplaceModels = () => new Promise<boolean>(resolve => {
    let settled = false
    const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    dialog.warning({
        title: t('aiConfig.workspace.replaceModelsTitle'), content: t('aiConfig.workspace.replaceModelsMessage'),
        positiveText: t('aiConfig.workspace.fetchAndReplace'), negativeText: t('common.cancel'),
        onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
    })
})

const fetchModelList = async (manual = false) => {
    if (!validateConnectionFields()) return false
    if (manual && formData.models.length && !(await confirmReplaceModels())) return false
    fetchingModels.value = true
    modelFetchAttempted.value = true
    modelFetchState.value = 'idle'
    modelFetchMessage.value = ''
    try {
        const models = [...new Set(await window.electronAPI.ai.getModels(serializeConfig(buildTemporaryConfig())))]
        if (!models.length) {
            modelFetchState.value = 'empty'
            modelFetchMessage.value = t('aiConfig.workspace.noModelsReturned')
            return false
        }
        formData.models = models
        if (!formData.defaultModel) formData.defaultModel = models[0]
        if (!selectedTestModel.value) selectedTestModel.value = formData.defaultModel || models[0]
        modelFetchState.value = 'success'
        modelFetchMessage.value = t('aiConfig.workspace.modelFetchSuccess', { count: models.length })
        return true
    } catch (error) {
        modelFetchState.value = 'error'
        modelFetchMessage.value = (error as Error).message
        return false
    } finally { fetchingModels.value = false }
}

const enterModelsStep = async () => {
    if (!validateConnectionFields()) { activeEditorSection.value = 'connection'; return }
    if (!(await confirmContinueAfterConnectionTest())) return
    activeEditorSection.value = 'models'
    if (!modelFetchAttempted.value && (!editingConfig.value || formData.models.length === 0)) await fetchModelList(false)
}

const navigateEditorSection = async (section: EditorSection) => {
    if (section === activeEditorSection.value) return
    if (section === 'models') { await enterModelsStep(); return }
    activeEditorSection.value = section
}
const previousCreateStep = () => { activeEditorSection.value = activeEditorSection.value === 'models' ? 'connection' : 'provider' }
const nextCreateStep = async () => {
    if (activeEditorSection.value === 'provider') { activeEditorSection.value = 'connection'; return }
    try { await formRef.value?.validate() } catch { return }
    await enterModelsStep()
}

const testFormConnection = async () => {
    try { await formRef.value?.validate() } catch { return }
    testingFormConnection.value = true
    formTestResult.value = null
    try {
        const result = await window.electronAPI.ai.testConfig(serializeConfig(buildTemporaryConfig()))
        formTestResult.value = result.success
            ? { success: true, message: t('aiConfig.workspace.connectionVerified') }
            : { success: false, error: result.error || t('common.unknownError') }
        lastTestFingerprint.value = connectionFingerprint.value
    } catch (error) {
        formTestResult.value = { success: false, error: (error as Error).message }
    } finally { testingFormConnection.value = false }
}

const testSelectedModel = async () => {
    if (!selectedTestModel.value) return
    testingSelectedModel.value = true
    modelTestResult.value = null
    try {
        modelTestResult.value = await window.electronAPI.ai.testModel(serializeConfig({
            configId: 'temp_test', name: formData.name || 'Test', type: formData.type, baseURL: formData.baseURL,
            apiKey: formData.apiKey, models: [...formData.models], defaultModel: selectedTestModel.value,
            enabled: true, createdAt: new Date(), updatedAt: new Date(),
        }), selectedTestModel.value)
    } catch (error) { modelTestResult.value = { success: false, error: (error as Error).message } }
    finally { testingSelectedModel.value = false }
}

const saveConfig = async () => {
    if (!editingConfig.value && activeEditorSection.value !== 'models') return
    if (!formData.name.trim()) { message.warning(t('aiConfig.pleaseEnterConfigName')); return }
    if (needsBaseURL.value && !formData.baseURL.trim()) { message.warning(t('aiConfig.pleaseEnterBaseURL')); return }
    if (needsApiKey.value && !formData.apiKey.trim()) { message.warning(t('aiConfig.pleaseEnterAPIKey')); return }
    if (!formData.defaultModel && !formData.customModel) { message.warning(t('aiConfig.pleaseSelectDefaultModel')); return }
    saving.value = true
    try {
        const savedModels = [...new Set([
            ...formData.models,
            ...(formData.defaultModel ? [formData.defaultModel] : []),
        ])]
        const data = {
            type: formData.type, name: formData.name.trim(), baseURL: formData.baseURL.trim(),
            apiKey: formData.apiKey || undefined, models: savedModels,
            defaultModel: formData.defaultModel || undefined, customModel: formData.customModel || undefined,
            systemPrompt: formData.systemPrompt || undefined,
        }
        let saved: AIConfig
        if (editingConfig.value?.id) {
            saved = await databaseService.aiConfig.updateAIConfig(editingConfig.value.id, { ...data, isPreferred: editingConfig.value.isPreferred })
            message.success(t('aiConfig.configUpdateSuccess'))
        } else {
            saved = await databaseService.aiConfig.createAIConfig({
                ...data, configId: `config_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, enabled: true,
            })
            message.success(t('aiConfig.configAddSuccess'))
        }
        showEditorModal.value = false
        editingConfig.value = null
        await loadConfigs()
        if (saved.id) selectConfig(configs.value.find(config => config.id === saved.id) || saved)
    } catch (error) { message.error(t('aiConfig.saveFailed') + (error as Error).message) }
    finally { saving.value = false }
}

const testConfig = async (config: AIConfig) => {
    if (!config.id) return
    testingConfigs.value.add(config.id)
    try {
        const result = await window.electronAPI.ai.testConfig(serializeConfig(config))
        connectionResults[config.id] = result.success
            ? { success: true, message: t('aiConfig.workspace.connectionVerified') }
            : { success: false, error: result.error || t('common.unknownError') }
    }
    catch (error) { connectionResults[config.id] = { success: false, error: (error as Error).message } }
    finally { testingConfigs.value.delete(config.id) }
}

const intelligentTest = async (config: AIConfig) => {
    if (!config.id) return
    intelligentTestingConfigs.value.add(config.id)
    try {
        requestResults[config.id] = await window.electronAPI.ai.intelligentTest(serializeConfig({ ...config, defaultModel: requestTestModels[config.id] || config.defaultModel }))
    } catch (error) { requestResults[config.id] = { success: false, error: (error as Error).message } }
    finally { intelligentTestingConfigs.value.delete(config.id) }
}

const toggleConfig = async (config: AIConfig, enabled: boolean) => {
    if (!config.id) return
    if (!enabled && config.isPreferred) {
        const confirmed = await new Promise<boolean>(resolve => dialog.warning({
            title: t('aiConfig.workspace.disablePreferredTitle'), content: t('aiConfig.workspace.disablePreferredMessage'),
            positiveText: t('aiConfig.workspace.disableAnyway'), negativeText: t('common.cancel'),
            onPositiveClick: () => resolve(true), onNegativeClick: () => resolve(false), onClose: () => resolve(false),
        }))
        if (!confirmed) return
    }
    togglingConfigId.value = config.id
    try {
        await databaseService.aiConfig.updateAIConfig(config.id, { enabled, ...(enabled ? {} : { isPreferred: false }) })
        await loadConfigs()
    } catch (error) { message.error(t('aiConfig.updateFailed') + (error as Error).message) }
    finally { togglingConfigId.value = null }
}

const setPreferred = async (config: AIConfig) => {
    if (!config.id || !config.enabled) return
    try {
        if (config.isPreferred) await databaseService.aiConfig.clearPreferredAIConfig()
        else await databaseService.aiConfig.setPreferredAIConfig(config.id)
        await loadConfigs()
    } catch (error) { message.error(t('aiConfig.setFailed') + (error as Error).message) }
}

const deleteConfig = (config: AIConfig) => {
    if (!config.id) return
    dialog.error({
        title: t('common.confirm'), content: t('aiConfig.deleteConfirm', { name: config.name }),
        positiveText: t('common.delete'), negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            try {
                await databaseService.aiConfig.deleteAIConfig(config.id!)
                delete connectionResults[config.id!]
                delete requestResults[config.id!]
                selectedConfigId.value = null
                await loadConfigs()
                message.success(t('aiConfig.configDeleteSuccess'))
            } catch (error) { message.error(t('aiConfig.deleteFailed') + (error as Error).message) }
        },
    })
}

const getDefaultSystemPrompt = () => t('aiConfig.workspace.defaultSystemPrompt')
const editSystemPrompt = (config: AIConfig) => {
    editingSystemPromptConfig.value = config
    systemPromptContent.value = config.systemPrompt || getDefaultSystemPrompt()
    systemPromptSnapshot.value = systemPromptContent.value
    showSystemPromptModal.value = true
}
const resetSystemPromptToDefault = () => { systemPromptContent.value = getDefaultSystemPrompt() }
const requestCloseSystemPrompt = async () => {
    if (systemPromptDirty.value && !(await confirmDiscard(t('aiConfig.workspace.unsavedPromptMessage')))) return
    showSystemPromptModal.value = false
    editingSystemPromptConfig.value = null
}
const handleSystemPromptShowUpdate = (value: boolean) => { if (!value) requestCloseSystemPrompt() }
const saveSystemPrompt = async () => {
    if (!editingSystemPromptConfig.value?.id) return
    savingSystemPrompt.value = true
    try {
        await databaseService.aiConfig.updateAIConfig(editingSystemPromptConfig.value.id, { systemPrompt: systemPromptContent.value.trim() || undefined })
        showSystemPromptModal.value = false
        editingSystemPromptConfig.value = null
        await loadConfigs()
        message.success(t('aiConfig.systemPromptUpdateSuccess'))
    } catch (error) { message.error(t('aiConfig.saveFailed') + (error as Error).message) }
    finally { savingSystemPrompt.value = false }
}

const openApiKeyUrl = () => getApiKeyInfo.value.apiKeyUrl && openExternalUrl(getApiKeyInfo.value.apiKeyUrl)
const openDocumentationUrl = () => getApiKeyInfo.value.docUrl && openExternalUrl(getApiKeyInfo.value.docUrl)
const handleQuickOptimizationConfigsUpdated = () => message.success(t('aiConfig.quickOptimizationUpdated'))
const openAddConfigModal = () => openCreateConfig()

watch(libraryPaneSize, size => localStorage.setItem('ai_config_library_pane_size', size))
watch(selectedConfig, config => {
    if (config?.id && !requestTestModels[config.id]) requestTestModels[config.id] = config.defaultModel || config.customModel || config.models?.[0] || ''
})
watch(connectionFingerprint, fingerprint => {
    if (lastTestFingerprint.value && fingerprint !== lastTestFingerprint.value) {
        formTestResult.value = null
        lastTestFingerprint.value = ''
    }
})

onMounted(async () => { await waitForDatabase(); await loadConfigs() })
defineExpose({ openAddConfigModal })
</script>

<style scoped>
.ai-config-page { width: 100%; height: calc(100vh - 24px); min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-body); }
.ai-command-bar { flex: 0 0 60px; min-height: 60px; display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(300px, 1fr); align-items: center; gap: var(--section-gap); padding: 0 var(--page-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-primary); }
.page-identity, .modal-title-row, .workspace-identity { display: flex; align-items: center; min-width: 0; gap: 12px; }
.page-identity-icon, .modal-title-icon, .workspace-provider-icon, .provider-icon { display: grid; place-items: center; flex: 0 0 auto; color: var(--content-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); }
.page-identity { gap: 10px; }
.page-identity-icon { width: 32px; height: 32px; flex: 0 0 32px; color: var(--accent-primary); border: 0; border-radius: var(--radius-panel); }
.page-title { display: block; font-size: var(--font-size-lg); line-height: 1.25; }
.page-subtitle { display: block; max-width: 320px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); }
.modal-subtitle, .workspace-subtitle, .section-description, .editor-section-heading > .n-text, .provider-help .n-text { display: block; margin-top: 3px; font-size: var(--font-size-sm); }
.preference-summary { justify-self: center; display: flex; align-items: center; gap: 7px; min-width: 0; padding: 7px 10px; color: var(--content-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); font-size: var(--font-size-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.page-actions, .workspace-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
.ai-page-content { flex: 1; height: 0; min-height: 0; display: flex; overflow: hidden; }
.page-state { flex: 1; margin: var(--page-padding); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.config-workspace-split { flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.config-workspace-split :deep(.n-split-pane) { min-width: 0; min-height: 0; overflow: hidden; }
.config-workspace-split :deep(.n-split__resize-trigger-wrapper) { position: relative; z-index: 2; overflow: visible; background: transparent; }
.config-workspace-split :deep(.n-split__resize-trigger-wrapper)::before { content: ''; position: absolute; inset: 0 -4px; cursor: col-resize; }
.workspace-resize-line { width: 1px; height: 100%; background: var(--border-default); transition: background-color .12s ease; }
.config-workspace-split :deep(.n-split__resize-trigger-wrapper:hover) .workspace-resize-line { background: var(--border-strong); }
.config-library { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-primary); }
.library-search { padding: 12px; border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.library-filters { padding: 8px; }
.filter-item, .config-list-item, .editor-nav-item, .provider-card { appearance: none; color: var(--content-primary); font: inherit; cursor: pointer; }
.filter-item { width: 100%; min-height: 34px; display: flex; align-items: center; gap: 9px; padding: 5px 9px; border: 0; border-radius: var(--radius-control); background: transparent; text-align: left; }
.filter-item:hover, .config-list-item:hover, .editor-nav-item:hover, .provider-card:hover { background: var(--interactive-hover); }
.filter-item.active, .config-list-item.active, .editor-nav-item.active, .provider-card.active { background: var(--surface-tertiary); }
.filter-item.active { font-weight: var(--font-weight-medium); }
.filter-count { margin-left: auto; color: var(--content-secondary); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
.library-heading { padding: 7px 14px 5px; border-top: 1px solid var(--border-subtle); font-size: var(--font-size-xs); }
.config-results { flex: 1; min-height: 0; padding: 0 7px 10px; }
.config-list-item { width: 100%; min-height: 62px; display: flex; align-items: center; gap: 10px; padding: 8px 9px; margin-bottom: 2px; border: 0; border-radius: var(--radius-panel); background: transparent; text-align: left; }
.provider-icon { width: 34px; height: 34px; }
.config-list-copy { flex: 1; min-width: 0; }
.config-list-title-row { display: flex; align-items: center; gap: 6px; }
.config-list-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--font-weight-medium); }
.config-list-meta { display: flex; gap: 5px; margin-top: 4px; color: var(--content-secondary); font-size: var(--font-size-xs); overflow: hidden; white-space: nowrap; }
.config-list-meta span:last-child { overflow: hidden; text-overflow: ellipsis; }
.preferred-marker { align-self: center; width: 18px; height: 18px; flex: 0 0 18px; display: grid; place-items: center; }
.status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--content-muted); }
.status-dot.enabled { background: var(--accent-success); }
.library-empty { padding: 32px 8px; }
.config-workspace { width: 100%; height: 100%; max-height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-body); }
.workspace-header { flex: 0 0 auto; min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px var(--content-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-primary); }
.workspace-provider-icon { width: 40px; height: 40px; }
.workspace-title-copy { min-width: 0; }
.workspace-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.workspace-title { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xl); }
.workspace-scroll { flex: 1; height: 0; min-height: 0; overflow: hidden; }
.workspace-sections { max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--section-gap); padding: var(--page-padding); }
.detail-panel { padding: var(--content-padding); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.compact-heading { margin-bottom: 10px; }
.section-title { display: block; font-size: var(--font-size-lg); }
.detail-grid, .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }
.detail-field { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.detail-field-wide, .form-span-2 { grid-column: 1 / -1; }
.field-label { color: var(--content-secondary); font-size: var(--font-size-xs); }
.field-value { min-width: 0; overflow-wrap: anywhere; }
.code-value, .result-block pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; user-select: text; }
.model-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.request-test-bar { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: center; gap: 8px; margin-top: 14px; padding: var(--compact-padding); }
.inline-result { margin-top: 14px; }
.result-block + .result-block { margin-top: 12px; }
.result-block pre { max-height: 220px; margin: 5px 0 0; padding: 10px; overflow: auto; white-space: pre-wrap; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); font-size: var(--font-size-xs); }
.prompt-preview { max-height: 150px; overflow: hidden; white-space: pre-wrap; color: var(--content-secondary); font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.workspace-empty { height: 100%; display: grid; place-items: center; background: var(--surface-body); }
.modal-title-icon { width: 36px; height: 36px; }
.modal-title { display: block; font-size: var(--font-size-xl); }
.editor-shell { min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: var(--section-gap); }
.editor-navigation { display: flex; flex-direction: column; gap: 4px; padding-right: var(--section-gap); border-right: 1px solid var(--border-default); }
.editor-nav-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border: 0; border-radius: var(--radius-panel); background: transparent; text-align: left; }
.editor-nav-item:disabled { cursor: not-allowed; opacity: .5; }
.editor-nav-item small { display: block; margin-top: 3px; color: var(--content-secondary); font-size: var(--font-size-xs); font-weight: normal; }
.step-index { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border: 1px solid var(--border-default); border-radius: 50%; color: var(--content-secondary); font-size: var(--font-size-xs); }
.editor-nav-item.active .step-index { color: white; border-color: var(--accent-primary); background: var(--accent-primary); }
.editor-nav-item.complete:not(.active) .step-index { color: var(--accent-success); border-color: var(--accent-success); }
.editor-content { min-width: 0; min-height: 0; }
.editor-content-inner { max-width: 900px; margin: 0 auto; padding-right: 8px; }
.editor-section { display: flex; flex-direction: column; gap: var(--section-gap); }
.editor-section-heading .n-text:first-child { display: block; font-size: var(--font-size-lg); }
.provider-group { display: flex; flex-direction: column; gap: 8px; }
.provider-group-title { display: flex; align-items: center; gap: 7px; color: var(--content-secondary); font-size: var(--font-size-sm); }
.provider-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.provider-card { min-height: 74px; display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-primary); text-align: left; transition: border-color .15s ease, background-color .15s ease; }
.provider-card:hover { border-color: var(--border-strong); }
.provider-card-copy { flex: 1; min-width: 0; }
.provider-card-copy strong, .provider-card-copy small { display: block; }
.provider-card-copy small { margin-top: 3px; color: var(--content-secondary); font-size: var(--font-size-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-card-icon { width: 34px; height: 34px; display: grid; place-items: center; color: var(--content-secondary); border-radius: var(--radius-control); background: var(--surface-secondary); }
.form-panel, .connection-test-panel { padding: var(--content-padding); }
.model-list-heading { margin-bottom: 12px; }
.model-fetch-result { margin-bottom: 14px; }
.provider-help { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: var(--compact-padding); }
.provider-help > div:first-child { min-width: 0; }
.prompt-editor-shell { min-height: 0; display: flex; flex-direction: column; gap: var(--section-gap); }
.system-prompt-input { flex: 1; min-height: 0; }
.system-prompt-input :deep(.n-input-wrapper), .system-prompt-input :deep(.n-input__textarea-el) { height: 100%; }
.system-prompt-input :deep(.n-input__textarea-el) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.dirty-indicator { min-height: 20px; font-size: var(--font-size-xs); }

@media (max-width: 1240px) {
    .ai-command-bar { grid-template-columns: minmax(240px, 1fr) auto; }
    .preference-summary { display: none; }
    .workspace-actions .n-button:not(.n-button--circle) { padding-left: 9px; padding-right: 9px; }
    .workspace-title { max-width: 240px; }
}
@media (max-width: 1080px) {
    .action-label { display: none; }
    .workspace-header { align-items: flex-start; }
    .workspace-actions { flex-wrap: wrap; }
    .editor-shell { grid-template-columns: 190px minmax(0, 1fr); }
    .provider-grid { grid-template-columns: 1fr; }
}
</style>
