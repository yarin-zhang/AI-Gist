<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleCancel">
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex vertical>
            <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                {{ isEdit ? t('promptManagement.edit') : t('promptManagement.create') }}
            </NText>
            <NText depth="3">
                {{ getTabDescription() }}
            </NText>
            </NFlex>
        </template>
        <!-- 中间可操作区域 -->
        <template #content="{ contentHeight }">
            <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top">
                <NTabs v-model:value="activeTab" type="segment" :style="{ height: `${contentHeight}px` }">
                    <!-- 编辑 Tab -->
                    <NTabPane name="edit" :tab="t('promptManagement.edit')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3"
                            :max="0.8" :disabled="modalWidth <= 800">
                            <!-- 左侧：内容编辑区 -->
                            <template #1>
                                <NCard :title="t('promptManagement.content')" size="small" :style="{ height: '100%' }">
                                    <template #header-extra>
                                        <NTooltip placement="top">
                                            <template #trigger>
                                                <NButton 
                                                    size="small" 
                                                    :type="isJinjaEnabled ? 'primary' : 'default'"
                                                    @click="toggleJinjaMode"
                                                    :disabled="isStreaming || optimizing !== null"
                                                >
                                                    <template #icon>
                                                        <NIcon>
                                                            <Code />
                                                        </NIcon>
                                                    </template>
                                                    {{ isJinjaEnabled ? t('promptManagement.jinjaEnabled') : t('promptManagement.jinjaDisabled') }}
                                                </NButton>
                                            </template>
                                            <NFlex vertical size="small">
                                                <NText>{{ t('promptManagement.jinjaSupportTooltip') }}</NText>
                                                <NButton 
                                                    size="tiny" 
                                                    text 
                                                    type="primary"
                                                    @click="openJinjaWebsite"
                                                >
                                                    {{ t('promptManagement.jinjaSupportLearnMore') }}
                                                </NButton>
                                            </NFlex>
                                        </NTooltip>
                                    </template>
                                    <NScrollbar ref="contentScrollbarRef" :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem path="content" style="flex: 1;" :show-label="false">
                                                <NInput 
                                                    v-model:value="formData.content" 
                                                    type="textarea"
                                                    show-count
                                                    :placeholder="isJinjaEnabled ? t('promptManagement.jinjaTemplatePlaceholder') : t('promptManagement.contentPlaceholder')"
                                                    :style="{ 
                                                        fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        backgroundColor: isStreaming ? 'var(--success-color-suppl)' : undefined,
                                                        border: isStreaming ? '1px solid var(--success-color)' : undefined
                                                    }"
                                                    :autosize=" { minRows: 9 }" 
                                                    :readonly="isStreaming"
                                                />
                                            </NFormItem>
                                        </NFlex>
                                        <NAlert type="info" :show-icon="false" style="margin: 0;">
                                            <NFlex justify="space-between" align="center">
                                                <div>
                                                    <NFlex align="center" size="small">
                                                        <NText depth="3" style="font-size: 12px;">
                                                            {{ t('promptManagement.quickOptimization') }}
                                                        </NText>
                                                        <NButton 
                                                            size="tiny" 
                                                            text 
                                                            @click="openQuickOptimizationConfig"
                                                            style="padding: 2px; margin-left: 4px;"
                                                        >
                                                            <template #icon>
                                                                <NIcon size="12">
                                                                    <Settings />
                                                                </NIcon>
                                                            </template>
                                                        </NButton>
                                                    </NFlex>
                                                    <!-- 流式传输状态显示 -->
                                                    <div v-if="isStreaming" style="margin-top: 4px;">
                                                        <NText type="success" style="font-size: 11px;">
                                                            {{ t('promptManagement.generating') }} ({{ streamStats.charCount }} {{ t('promptManagement.characters') }})
                                                        </NText>
                                                    </div>
                                                </div>
                                                <NFlex size="small">
                                                    <!-- 停止按钮 -->
                                                    <NButton 
                                                        v-if="isStreaming"
                                                        size="small" 
                                                        type="error"
                                                        @click="stopOptimization"
                                                    >
                                                        {{ t('promptManagement.stopGeneration') }}
                                                    </NButton>
                                                    <!-- 优化按钮 -->
                                                    <template v-else>
                                                        <NButton 
                                                            v-for="config in quickOptimizationConfigs"
                                                            :key="config.id"
                                                            size="small" 
                                                            @click="optimizePrompt(config.id)"
                                                            :loading="optimizing === config.name"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            {{ config.name }}
                                                        </NButton>
                                                        <NButton 
                                                            size="small" 
                                                            @click="showManualAdjustment"
                                                            :disabled="!formData.content.trim() || optimizing !== null"
                                                        >
                                                            {{ t('promptManagement.manualAdjustment') }}
                                                        </NButton>
                                                    </template>
                                                </NFlex>
                                            </NFlex>
                                        </NAlert>
                                        
                                        <!-- AI模型选择器 -->
                                        <div style="margin-top: 8px;">
                                            <AIModelSelector
                                                ref="modelSelectorRef"
                                                v-model:modelKey="selectedModelKey"
                                                :placeholder="t('promptManagement.aiModelPlaceholder')"
                                                :disabled="isStreaming || optimizing !== null"
                                            />
                                        </div>
                                        
                                        <!-- 手动调整输入框 -->
                                        <div v-if="showManualInput" style="margin-top: 8px;">
                                            <NCard size="small" :title="t('promptManagement.manualAdjustmentTitle')">
                                                <NFlex vertical size="small">
                                                    <NInput
                                                        v-model:value="manualInstruction"
                                                        type="textarea"
                                                        :placeholder="t('promptManagement.manualAdjustmentPlaceholder')"
                                                        :rows="3"
                                                        :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }"
                                                        show-count
                                                        :maxlength="500"
                                                    />
                                                    <NFlex justify="space-between" align="center">
                                                        <NText depth="3" style="font-size: 12px;">
                                                            {{ t('promptManagement.manualAdjustmentTip') }}
                                                        </NText>
                                                        <NFlex size="small">
                                                            <NButton size="small" @click="hideManualAdjustment">
                                                                {{ t('promptManagement.cancelAdjustment') }}
                                                            </NButton>
                                                            <NButton 
                                                                size="small" 
                                                                type="primary"
                                                                @click="applyManualAdjustment"
                                                                :loading="optimizing === 'manual'"
                                                                :disabled="!manualInstruction.trim()"
                                                            >
                                                                {{ t('promptManagement.confirmAdjustment') }}
                                                            </NButton>
                                                        </NFlex>
                                                    </NFlex>
                                                </NFlex>
                                            </NCard>
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：变量配置区 -->
                            <template #2>
                                <NCard size="small" :style="{ height: '100%' }">
                                    <template #header>
                                        <NFlex justify="space-between" align="center">
                                            <NText strong>{{ t('promptManagement.detectedVariables') }}</NText>
                                            <NButton size="small" @click="addVariable">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                                {{ t('promptManagement.addVariable') }}
                                            </NButton>
                                        </NFlex>
                                    </template>
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;"
                                            v-if="formData.variables.length > 0">
                                            <NCard v-for="(variable, index) in formData.variables" :key="index" size="small">
                                                <template #header>
                                                    <NFlex justify="space-between" align="center">
                                                        <NText>{{ variable.name || t('promptManagement.variable') + (index + 1) }}</NText>
                                                        <NButton size="small" text type="error" @click="removeVariable(index)">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                        </NButton>
                                                    </NFlex>
                                                </template>

                                                <NFlex vertical size="small">
                                                    <NFlex>
                                                        <NFormItem :label="t('promptManagement.variableName')" style="flex: 1">
                                                            <NInput v-model:value="variable.name" :placeholder="t('promptManagement.variableNamePlaceholder')" size="small" />
                                                        </NFormItem>
                                                        <NFormItem :label="t('promptManagement.variableLabel')" style="flex: 1">
                                                            <NInput v-model:value="variable.label" :placeholder="t('promptManagement.variableLabelPlaceholder')" size="small" />
                                                        </NFormItem>
                                                    </NFlex>

                                                    <NFlex>
                                                        <NFormItem :label="t('promptManagement.variableType')" style="flex: 1">
                                                            <NSelect v-model:value="variable.type" :options="variableTypeOptions" size="small" />
                                                        </NFormItem>
                                                        <NFormItem :label="t('promptManagement.variableRequired')" style="width: 80px">
                                                            <NSwitch v-model:value="variable.required" size="small" />
                                                        </NFormItem>
                                                    </NFlex>

                                                    <NFormItem :label="t('promptManagement.variableDefault')">
                                                        <NInput v-if="variable.type === 'text'" v-model:value="variable.defaultValue" :placeholder="t('promptManagement.variableDefaultPlaceholder')" size="small" />
                                                        <NSelect v-else-if="variable.type === 'select'" v-model:value="variable.defaultValue" :options="getVariableDefaultOptions(variable.options)" :placeholder="t('promptManagement.selectDefaultOption')" size="small" clearable />
                                                    </NFormItem>

                                                    <NFormItem v-if="variable.type === 'select'" :label="t('promptManagement.variableOptions')">
                                                        <NDynamicInput v-model:value="variable.options" show-sort-button :placeholder="t('promptManagement.variableOptionsPlaceholder')" :min="1" />
                                                    </NFormItem>
                                                </NFlex>
                                            </NCard>
                                        </NFlex>
                                        <NEmpty v-else :description="t('promptManagement.variableTip')" size="small">
                                            <template #icon>
                                                <NIcon>
                                                    <Plus />
                                                </NIcon>
                                            </template>
                                        </NEmpty>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 补充信息 Tab -->
                    <NTabPane name="info" :tab="t('promptManagement.info')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3"
                            :max="0.8" :disabled="modalWidth <= 800">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard :title="t('promptManagement.basicInfo')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem :label="t('promptManagement.title')" path="title">
                                                <NInput v-model:value="formData.title" :placeholder="t('promptManagement.titlePlaceholder')" />
                                            </NFormItem>

                                            <NFormItem :label="t('promptManagement.description')" path="description">
                                                <NInput v-model:value="formData.description" type="textarea"
                                                    :placeholder="t('promptManagement.descriptionPlaceholder')" :rows="8" />
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：分类与标签 -->
                            <template #2>
                                <NCard :title="t('promptManagement.categoryAndTags')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <NFormItem :label="t('promptManagement.category')">
                                                <NSelect v-model:value="formData.categoryId" :options="categoryOptions"
                                                    :placeholder="t('promptManagement.categoryPlaceholder')" clearable />
                                            </NFormItem>
                                            <NFormItem :label="t('promptManagement.tags')" path="tags">
                                                <NDynamicTags v-model:value="formData.tags" :placeholder="t('promptManagement.tagsPlaceholder')" :max="5" />
                                            </NFormItem>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 历史记录 Tab - 仅在编辑模式下显示 -->
                    <NTabPane v-if="isEdit" name="history" :tab="t('promptManagement.history')">
                        <NCard :title="t('promptManagement.versionHistory')" size="small" :style="{ height: `${contentHeight - 50}px` }">
                            <NScrollbar :style="{ height: `${contentHeight - 100}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;" v-if="historyList.length > 0">
                                    <NCard v-for="(history, index) in historyList" :key="history.id" size="small">
                                        <template #header>
                                            <NFlex justify="space-between" align="center">
                                                <NFlex align="center" size="small">
                                                    <NText strong>{{ t('promptManagement.version') }} {{ history.version }}</NText>
                                                    <NTag size="small" type="info">
                                                        {{ formatDate(history.createdAt) }}
                                                    </NTag>
                                                </NFlex>
                                                <NFlex size="small">
                                                    <NButton size="small" @click="openPreviewHistory(history)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Eye />
                                                            </NIcon>
                                                        </template>
                                                        {{ t('promptManagement.preview') }}
                                                    </NButton>
                                                    <NButton size="small" type="primary" @click="rollbackToHistory(history)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <ArrowBackUp />
                                                            </NIcon>
                                                        </template>
                                                        {{ t('promptManagement.rollback') }}
                                                    </NButton>
                                                </NFlex>
                                            </NFlex>
                                        </template>
                                        <NFlex vertical size="small">
                                            <NText depth="3">{{ history.title }}</NText>
                                            <NText depth="3" v-if="history.changeDescription">
                                                {{ t('promptManagement.changeDescription') }}: {{ history.changeDescription }}
                                            </NText>
                                            <NText depth="3" style="font-size: 12px;">
                                                {{ t('promptManagement.contentPreview') }}: {{ getContentPreview(history.content) }}
                                            </NText>
                                        </NFlex>
                                    </NCard>
                                </NFlex>
                                <NEmpty v-else :description="t('promptManagement.noHistory')" size="small">
                                    <template #icon>
                                        <NIcon>
                                            <History />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NScrollbar>
                        </NCard>
                    </NTabPane>
                </NTabs>
            </NForm>
        </template>

        <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <!-- 显示当前活动的tab信息 -->
                    <NText depth="3" v-if="activeTab === 'history' && isEdit">
                        {{ t('promptManagement.historyDescription') }}
                    </NText>
                </div>
                <div>
                    <!-- 右侧区域 -->
                    <NFlex size="small">
                        <NButton @click="handleCancel">{{ t('common.cancel') }}</NButton>
                        <NButton type="primary" @click="handleSave" :loading="saving"
                            :disabled="!formData.content.trim()">
                            {{ isEdit ? t('promptManagement.update') : t('promptManagement.create') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 历史版本预览模态框 -->
    <CommonModal :show="showPreviewModal" @update:show="closePreviewModal" @close="closePreviewModal">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ t('promptManagement.historyVersionPreview', { version: previewHistory?.version }) }}
            </NText>
            <NText depth="3">
                {{ formatDate(previewHistory?.createdAt || new Date()) }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <div v-if="previewHistory" :style="{ height: `${contentHeight}px`, overflow: 'hidden' }">
                <NTabs type="segment" :style="{ height: '100%' }">
                    <!-- 内容与变量 Tab -->
                    <NTabPane name="content" :tab="t('promptManagement.contentAndVariables')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：提示词内容 -->
                            <template #1>
                                <NCard :title="t('promptManagement.promptContent')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NInput
                                                :value="previewHistory.content"
                                                type="textarea"
                                                readonly
                                                :style="{ 
                                                    height: `${contentHeight - 180}px`, 
                                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' 
                                                }"
                                                :autosize="false"
                                            />
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：变量配置 -->
                            <template #2>
                                <NCard :title="t('promptManagement.variableConfig')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <div style="padding-right: 12px;">
                                            <NFlex vertical size="medium" v-if="getPreviewVariables(previewHistory.variables).length > 0">
                                                <NCard 
                                                    v-for="(variable, index) in getPreviewVariables(previewHistory.variables)" 
                                                    :key="index" 
                                                    size="small"
                                                >
                                                    <template #header>
                                                        <NText strong>{{ variable.name }}</NText>
                                                    </template>
                                                    <NFlex vertical size="small">
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.variableLabel') }}</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.label }}</NText>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.variableType') }}</NText>
                                                            </div>
                                                            <NTag size="small" :type="variable.type === 'text' ? 'default' : 'info'">
                                                                {{ variable.type === 'text' ? t('promptManagement.text') : t('promptManagement.select') }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex>
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.variableRequired') }}</NText>
                                                            </div>
                                                            <NTag size="small" :type="variable.required ? 'error' : 'success'">
                                                                {{ variable.required ? t('common.yes') : t('common.no') }}
                                                            </NTag>
                                                        </NFlex>
                                                        <NFlex v-if="variable.defaultValue">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.variableDefault') }}</NText>
                                                            </div>
                                                            <NText style="font-size: 12px;">{{ variable.defaultValue }}</NText>
                                                        </NFlex>
                                                        <NFlex v-if="variable.placeholder">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.placeholder') }}</NText>
                                                            </div>
                                                            <NText depth="3" style="font-size: 12px;">{{ variable.placeholder }}</NText>
                                                        </NFlex>
                                                        <NFlex v-if="variable.type === 'select' && variable.options && variable.options.length > 0">
                                                            <div style="width: 60px;">
                                                                <NText depth="3" style="font-size: 12px;">{{ t('promptManagement.variableOptions') }}</NText>
                                                            </div>
                                                            <NFlex size="small" wrap>
                                                                <NTag v-for="option in variable.options" :key="option" size="small">
                                                                    {{ option }}
                                                                </NTag>
                                                            </NFlex>
                                                        </NFlex>
                                                    </NFlex>
                                                </NCard>
                                            </NFlex>
                                            <NEmpty v-else :description="t('promptManagement.noVariablesInVersion')" size="small">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                            </NEmpty>
                                        </div>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>

                    <!-- 补充信息 Tab -->
                    <NTabPane name="info" :tab="t('promptManagement.additionalInfo')">
                        <NSplit direction="horizontal" :style="{ height: `${contentHeight - 50}px` }" :default-size="0.6" :min="0.3" :max="0.8">
                            <!-- 左侧：基本信息 -->
                            <template #1>
                                <NCard :title="t('promptManagement.basicInfo')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div>
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">{{ t('promptManagement.title') }}</NText>
                                                <NInput :value="previewHistory.title" readonly />
                                            </div>

                                            <div v-if="previewHistory.description">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">{{ t('promptManagement.description') }}</NText>
                                                <NInput 
                                                    :value="previewHistory.description" 
                                                    type="textarea" 
                                                    readonly 
                                                    :rows="8" 
                                                />
                                            </div>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>

                            <!-- 右侧：分类与标签 -->
                            <template #2>
                                <NCard :title="t('promptManagement.categoryAndTags')" size="small" :style="{ height: '100%' }">
                                    <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                        <NFlex vertical size="medium" style="padding-right: 12px;">
                                            <div v-if="previewHistory.categoryId">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">{{ t('promptManagement.category') }}</NText>
                                                <NInput :value="getCategoryName(previewHistory.categoryId)" readonly />
                                            </div>

                                            <div v-if="previewHistory.tags">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 8px; display: block;">{{ t('promptManagement.tags') }}</NText>
                                                <NFlex size="small" wrap>
                                                    <NTag 
                                                        v-for="tag in (typeof previewHistory.tags === 'string' ? previewHistory.tags.split(',').map(t => t.trim()).filter(t => t) : previewHistory.tags)"
                                                        :key="tag"
                                                        size="small"
                                                    >
                                                        {{ tag }}
                                                    </NTag>
                                                </NFlex>
                                            </div>

                                            <div v-if="previewHistory.changeDescription">
                                                <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">{{ t('promptManagement.changeDescription') }}</NText>
                                                <NInput :value="previewHistory.changeDescription" readonly />
                                            </div>
                                        </NFlex>
                                    </NScrollbar>
                                </NCard>
                            </template>
                        </NSplit>
                    </NTabPane>
                </NTabs>
            </div>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <NText depth="3">
                        {{ t('promptManagement.historyPreviewDesc') }}
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="closePreviewModal">{{ t('common.close') }}</NButton>
                        <NButton type="primary" @click="rollbackToHistory(previewHistory!); closePreviewModal();">
                            {{ t('promptManagement.rollbackToVersion') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, reactive } from "vue";
import { useI18n } from 'vue-i18n'
import {
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NAlert,
    NEmpty,
    NSwitch,
    NDynamicTags,
    NTag,
    NScrollbar,
    NDynamicInput,
    NSplit,
    NTabs,
    NTabPane,
    NTooltip,
    useMessage,
} from "naive-ui";
import { Plus, Trash, Eye, ArrowBackUp, History, Settings, Code } from "@vicons/tabler";
import { api } from "@/lib/api";
import { useWindowSize } from "@/composables/useWindowSize";
import CommonModal from "@/components/common/CommonModal.vue";
import AIModelSelector from "@/components/common/AIModelSelector.vue";
import type { PromptHistory } from "@/lib/db";
import { jinjaService } from "@/lib/utils/jinja.service";

interface Variable {
    name: string;
    label: string;
    type: string;
    options?: string[];
    defaultValue?: string;
    required: boolean;
    placeholder?: string;
}

interface Props {
    show: boolean;
    prompt?: any;
    categories: any[];
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "saved"): void;
    (e: "open-quick-optimization-config"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { t } = useI18n()
const message = useMessage();
const formRef = ref();
const contentScrollbarRef = ref(); // 内容区域滚动条引用
const saving = ref(false);
const activeTab = ref("edit");
const historyList = ref<PromptHistory[]>([]);
const loadingHistory = ref(false);
const showPreviewModal = ref(false);
const previewHistory = ref<PromptHistory | null>(null);

// 优化相关状态
const optimizing = ref<string | null>(null);
const modelSelectorRef = ref();
const selectedModelKey = ref("");
const quickOptimizationConfigs = ref<any[]>([]);

// 手动调整状态
const showManualInput = ref(false);
const manualInstruction = ref("");

// Jinja 模板相关状态
const isJinjaEnabled = ref(false);

// 流式传输状态
const streamingContent = ref("");
const isStreaming = ref(false);
const streamStats = reactive({
    charCount: 0,
    isStreaming: false,
    lastCharCount: 0,
    noContentUpdateCount: 0,
    lastUpdateTime: 0,
    isGenerationActive: false,
    contentGrowthRate: 0
});

// 生成控制状态
const generationControl = reactive({
    shouldStop: false,
    abortController: null as AbortController | null
});

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize();

// 防抖相关
const debounceTimer = ref<number | null>(null);
const DEBOUNCE_DELAY = 500; // 500ms 防抖延迟

// 表单数据
const formData = ref<{
    title: string;
    description: string;
    content: string;
    categoryId: number | null;
    tags: string[];
    variables: Variable[];
    isJinjaTemplate?: boolean;
}>({
    title: "",
    description: "",
    content: "",
    categoryId: null,
    tags: [],
    variables: [],
    isJinjaTemplate: false,
});

// 计算属性
const isEdit = computed(() => !!props.prompt?.id);

const categoryOptions = computed(() => [
    { label: t('promptManagement.noCategory'), value: null },
    ...props.categories.map((cat) => ({
        label: cat.name,
        value: cat.id,
    })),
]);

const displayTitle = computed(() => {
    if (formData.value.title) {
        return formData.value.title;
    }
    // 如果没有标题，自动生成一个基于内容的简短标题
    if (formData.value.content) {
        const firstLine = formData.value.content.split("\n")[0].trim();
        return firstLine.length > 30
            ? firstLine.substring(0, 30) + "..."
            : firstLine;
    }
    return t('promptManagement.untitledPrompt');
});

const variableTypeOptions = [
    { label: t('promptManagement.text'), value: 'text' },
    { label: t('promptManagement.select'), value: 'select' },
];

// 表单验证规则
const rules = {
    content: {
        required: true,
        message: t('promptManagement.contentRequired'),
        trigger: 'blur, focus',
    },
    tags: {
        trigger: ['change'],
        validator(rule: unknown, value: string[]) {
            if (value.length > 5) {
                return new Error(t('promptManagement.maxTagsError'));
            }
            return true;
        },
    },
};

// 获取Tab描述文本
const getTabDescription = () => {
    switch (activeTab.value) {
        case 'edit':
            return t('promptManagement.tabEditDesc');
        case 'info':
            return t('promptManagement.tabInfoDesc');
        case 'history':
            return isEdit.value ? t('promptManagement.tabHistoryDesc') : t('promptManagement.tabEditDesc');
        default:
            return t('promptManagement.tabEditDesc');
    }
};

// 加载快速优化配置
const loadQuickOptimizationConfigs = async () => {
    try {
        quickOptimizationConfigs.value = await api.quickOptimizationConfigs.getEnabled.query();
    } catch (error) {
        console.error("加载快速优化配置失败:", error);
        // 如果加载失败，使用默认配置
        quickOptimizationConfigs.value = [];
    }
};

// 刷新快速优化配置（供外部调用）
const refreshQuickOptimizationConfigs = async () => {
    await loadQuickOptimizationConfigs();
    // 静默刷新，不显示消息
};

// 打开快速优化配置模态窗
const openQuickOptimizationConfig = () => {
    // 通过事件通知父组件打开快速优化配置模态窗
    emit('open-quick-optimization-config');
};

// 重置表单方法
const resetForm = () => {
    
    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }

    // 重置表单数据到初始状态
    formData.value = {
        title: "",
        description: "",
        content: "",
        categoryId: null,
        tags: [],
        variables: [],
        isJinjaTemplate: false,
    };
    activeTab.value = "edit";
    historyList.value = [];
    
    // 重置 Jinja 模式状态
    isJinjaEnabled.value = false;
    
    // 重置优化状态
    optimizing.value = null;
    isStreaming.value = false;
    streamingContent.value = "";
    generationControl.shouldStop = false;
    
    // 重置手动调整状态
    showManualInput.value = false;
    manualInstruction.value = "";
    
    // 重置流式统计
    Object.assign(streamStats, {
        charCount: 0,
        isStreaming: false,
        lastCharCount: 0,
        noContentUpdateCount: 0,
        lastUpdateTime: 0,
        isGenerationActive: false,
        contentGrowthRate: 0
    });

    // 清理表单验证状态
    nextTick(() => {
        formRef.value?.restoreValidation();
    });
};

// 加载历史记录
const loadHistory = async () => {
    if (!isEdit.value || !props.prompt?.id) {
        historyList.value = [];
        return;
    }

    try {
        loadingHistory.value = true;
        
        // 先检查表是否存在
        const tableExists = await api.promptHistories.checkExists.query();
        if (!tableExists) {
            console.warn("PromptHistories 表不存在，可能是数据库版本问题");
            historyList.value = [];
            return;
        }
        
        historyList.value = await api.promptHistories.getByPromptId.query(props.prompt.id);
    } catch (error: any) {
        console.error("加载历史记录失败:", error);
        historyList.value = [];
        // 如果是数据库表不存在的错误，静默失败
        if (error.name === 'NotFoundError' || error.message.includes('object stores was not found')) {
            console.warn("PromptHistories 表不存在，跳过历史记录创建");
        } else {
            // 其他错误也不影响主流程，只是记录失败
            console.warn("创建历史记录失败，但不影响主流程");
        }
    } finally {
        loadingHistory.value = false;
    }
};

// 创建历史记录
const createHistoryRecord = async (currentPrompt: any) => {
    try {
        const latestVersion = await api.promptHistories.getLatestVersion.query(currentPrompt.id);
        
        const historyData = {
            promptId: currentPrompt.id,
            version: latestVersion + 1,
            title: currentPrompt.title,
            content: currentPrompt.content,
            description: currentPrompt.description,
            categoryId: currentPrompt.categoryId,
            tags: currentPrompt.tags,
            variables: JSON.stringify(currentPrompt.variables || []),
            changeDescription: t('promptManagement.editUpdate'),
            uuid: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date()
        };

        await api.promptHistories.create.mutate(historyData);
    } catch (error: any) {
        console.error("创建历史记录失败:", error);
        // 如果是数据库表不存在的错误，静默失败
        if (error.name === 'NotFoundError' || error.message.includes('object stores was not found')) {
            console.warn("PromptHistories 表不存在，跳过历史记录创建");
        } else {
            // 其他错误也不影响主流程，只是记录失败
            console.warn("创建历史记录失败，但不影响主流程");
        }
    }
};

// 停止优化生成
const stopOptimization = async () => {
    console.log(t('promptManagement.stopOptimizationLog'));
    
    try {
        generationControl.shouldStop = true;
        
        // 调用停止API
        if ((window as any).electronAPI?.ai?.stopGeneration) {
            await (window as any).electronAPI.ai.stopGeneration();
        }
        
        // 重置状态
        isStreaming.value = false;
        optimizing.value = null;
        generationControl.shouldStop = false;
        
        message.info(t('promptManagement.optimizationStopped'));
    } catch (error) {
        console.error('停止优化失败:', error);
        message.error(t('promptManagement.stopOptimizationFailed'));
    }
};

// 启动流式生成
const startStreamingGeneration = async (request: any, serializedConfig: any) => {
    let result;
    
    // 检查是否支持流式传输
    if ((window as any).electronAPI?.ai?.generatePromptStream) {
        console.log(t('promptManagement.streamModeLog'));
        
        // 使用流式传输
        result = await (window as any).electronAPI.ai.generatePromptStream(
            request,
            serializedConfig,
            (charCount: number, partialContent?: string) => {
                // 检查是否应该停止
                if (generationControl.shouldStop) {
                    console.log('检测到停止信号，中断流式优化');
                    return false; // 返回 false 表示停止流式传输
                }
                
                const now = Date.now();
                console.log('优化流式传输回调:', {
                    charCount,
                    hasContent: !!partialContent,
                    contentLength: partialContent?.length || 0,
                    timeSinceLastUpdate: now - streamStats.lastUpdateTime
                });

                // 更新时间统计
                const prevCharCount = streamStats.charCount;
                const prevUpdateTime = streamStats.lastUpdateTime;
                streamStats.charCount = charCount;
                streamStats.lastUpdateTime = now;
                
                // 计算内容增长速率
                if (prevUpdateTime > 0 && charCount > prevCharCount) {
                    const timeDiff = (now - prevUpdateTime) / 1000;
                    const charDiff = charCount - prevCharCount;
                    streamStats.contentGrowthRate = timeDiff > 0 ? charDiff / timeDiff : 0;
                }

                // 检测是否有真实内容
                const hasRealContent = typeof partialContent === 'string' && partialContent.length > 0;
                
                // 判断生成是否活跃
                streamStats.isGenerationActive = hasRealContent || 
                    (charCount > prevCharCount && (now - prevUpdateTime) < 2000);

                if (hasRealContent) {
                    // 有真实内容时直接更新输入框
                    formData.value.content = partialContent;
                    streamingContent.value = partialContent;
                    streamStats.noContentUpdateCount = 0;
                    console.log('✅ 优化内容已更新，当前长度:', partialContent.length);
                } else {
                    // 没有内容时的处理
                    streamStats.noContentUpdateCount++;
                    
                    if (charCount > prevCharCount) {
                        // 字符数在增长，说明正在生成
                        const placeholderText = `${t('promptManagement.optimizing')} (${t('promptManagement.generatedChars', { count: charCount })})`;
                        if (streamStats.noContentUpdateCount > 3 && !streamingContent.value) {
                            streamingContent.value = placeholderText;
                            console.log('📝 显示优化占位符:', placeholderText);
                        }
                    }
                }

                return true; // 继续生成
            }
        );
        
        console.log('流式传输完成，最终结果:', {
            success: !!result,
            contentLength: result?.generatedPrompt?.length || 0
        });

        // 如果流式传输过程中没有获得内容，但最终结果有内容，则立即显示
        if (result && result.generatedPrompt &&
            (!formData.value.content || formData.value.content.startsWith('正在优化中...'))) {
            console.log('🔧 流式传输未提供内容，使用最终结果');
            formData.value.content = result.generatedPrompt;
            streamingContent.value = result.generatedPrompt;
        }
    } else {
        console.log(t('promptManagement.normalModeLog'));
        // 使用普通生成
        result = await (window as any).electronAPI.ai.generatePrompt(request, serializedConfig);
        
        // 模拟流式更新
        if (result?.generatedPrompt) {
            const content = result.generatedPrompt;
            const totalChars = content.length;
            const steps = Math.min(30, totalChars);
            const stepSize = Math.ceil(totalChars / steps);
            
            for (let i = 0; i < steps; i++) {
                if (generationControl.shouldStop) break;
                
                const currentCharCount = Math.min((i + 1) * stepSize, totalChars);
                const partialContent = content.substring(0, currentCharCount);
                
                streamStats.charCount = currentCharCount;
                formData.value.content = partialContent;
                streamingContent.value = partialContent;
                
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // 确保显示完整内容
            formData.value.content = content;
            streamingContent.value = content;
        }
    }
    
    return result;
};

// 优化提示词功能（支持流式传输）
const optimizePrompt = async (configId: number) => {
    if (!formData.value.content.trim()) {
        message.warning("请先输入提示词内容");
        return;
    }

    const selectedConfig = modelSelectorRef.value?.selectedConfig;
    const selectedModel = modelSelectorRef.value?.selectedModel;

    if (!selectedConfig) {
        message.warning(t('promptManagement.noAIConfigAvailable'));
        return;
    }

    if (!selectedModel) {
        message.error(t('promptManagement.selectModel'));
        return;
    }

    // 查找对应的优化配置
    const optimizationConfig = quickOptimizationConfigs.value.find(c => c.id === configId);
    if (!optimizationConfig) {
        message.error(t('promptManagement.optimizationConfigNotFound'));
        return;
    }

    // 重置状态
    optimizing.value = optimizationConfig.name;
    isStreaming.value = true;
    generationControl.shouldStop = false;
    streamingContent.value = "";
    
    // 重置流式统计
    Object.assign(streamStats, {
        charCount: 0,
        isStreaming: true,
        lastCharCount: 0,
        noContentUpdateCount: 0,
        lastUpdateTime: Date.now(),
        isGenerationActive: true,
        contentGrowthRate: 0
    });

    // 保存原始内容，以便出错时恢复
    const originalContent = formData.value.content;

    try {
        console.log("开始流式优化提示词:", optimizationConfig.name, formData.value.content);
        
        // 使用配置的提示词模板
        const optimizationPrompt = optimizationConfig.prompt.replace('{{content}}', formData.value.content);
        
        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map((m: any) => String(m)) : [],
            defaultModel: selectedConfig.defaultModel ? String(selectedConfig.defaultModel) : '',
            customModel: selectedConfig.customModel ? String(selectedConfig.customModel) : '',
            enabled: Boolean(selectedConfig.enabled),
            systemPrompt: selectedConfig.systemPrompt ? String(selectedConfig.systemPrompt) : '',
            createdAt: selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: selectedConfig.updatedAt ? selectedConfig.updatedAt.toISOString() : new Date().toISOString()
        };

        // 构建请求参数
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(optimizationPrompt),
            customPrompt: String(optimizationPrompt),
            model: String(selectedModel)
        };

        console.log("流式优化请求参数:", request);
        console.log("配置参数:", serializedConfig);

        // 创建 AbortController 用于取消请求
        generationControl.abortController = new AbortController();

        // 启动流式传输监听
        await startStreamingGeneration(request, serializedConfig);
        
        // 如果是提取变量类型，立即重新提取变量
        if (optimizationConfig.name.includes('extractVariable') || optimizationConfig.name.includes('variable')) {
            nextTick(() => {
                extractVariables(formData.value.content);
            });
        }
        
        message.success(t('promptManagement.optimizationComplete'));

    } catch (error: any) {
        console.error("优化失败:", error);
        message.error(t('promptManagement.optimizationFailed') + ": " + (error.message || t('common.unknownError')));
        
        // 出错时恢复原始内容
        formData.value.content = originalContent;
    } finally {
        // 重置所有状态
        optimizing.value = null;
        isStreaming.value = false;
        generationControl.shouldStop = false;
        streamingContent.value = "";
        streamStats.isStreaming = false;
        streamStats.isGenerationActive = false;
        generationControl.abortController = null;
    }
};

// 显示手动调整输入框
const showManualAdjustment = () => {
    showManualInput.value = true;
    manualInstruction.value = "";
    
    // 使用 nextTick 确保 DOM 更新后再滚动
    nextTick(() => {
        // 滚动到底部以显示手动调整输入框
        if (contentScrollbarRef.value) {
            contentScrollbarRef.value.scrollTo({ top: 999999, behavior: 'smooth' });
        }
    });
};

// 隐藏手动调整输入框
const hideManualAdjustment = () => {
    showManualInput.value = false;
    manualInstruction.value = "";
};

// 应用手动调整
const applyManualAdjustment = async () => {
    if (!manualInstruction.value.trim()) {
        message.warning(t('promptManagement.enterAdjustmentInstruction'));
        return;
    }
    
    if (!formData.value.content.trim()) {
        message.warning(t('promptManagement.enterPromptContentFirst'));
        return;
    }

    const selectedConfig = modelSelectorRef.value?.selectedConfig;
    const selectedModel = modelSelectorRef.value?.selectedModel;

    if (!selectedConfig) {
        message.warning(t('promptManagement.noAIConfigAvailable'));
        return;
    }

    if (!selectedModel) {
        message.error(t('promptManagement.selectModel'));
        return;
    }

    // 重置状态
    optimizing.value = 'manual';
    isStreaming.value = true;
    generationControl.shouldStop = false;
    streamingContent.value = "";
    
    // 立即隐藏手动调整输入框并向上滚动
    hideManualAdjustment();
    nextTick(() => {
        if (contentScrollbarRef.value) {
            contentScrollbarRef.value.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    // 重置流式传输统计
    streamStats.charCount = 0;
    streamStats.isStreaming = true;
    streamStats.lastCharCount = 0;
    streamStats.noContentUpdateCount = 0;
    streamStats.lastUpdateTime = Date.now();
    streamStats.isGenerationActive = true;
    streamStats.contentGrowthRate = 0;

    try {
        console.log("开始手动调整提示词:", manualInstruction.value, formData.value.content);
        
        // 构建手动调整指令，包含原有提示词
        const adjustmentPrompt = `${t('promptManagement.adjustPromptInstruction')}

${t('promptManagement.originalPrompt')}
${formData.value.content}

${t('promptManagement.adjustmentInstruction')}
${manualInstruction.value.trim()}

${t('promptManagement.outputImprovedPrompt')}`;
        
        // 序列化配置以确保可以通过 IPC 传递
        const serializedConfig = {
            configId: selectedConfig.configId || '',
            name: selectedConfig.name || '',
            type: selectedConfig.type || 'openai',
            baseURL: selectedConfig.baseURL || '',
            apiKey: selectedConfig.apiKey || '',
            secretKey: selectedConfig.secretKey || '',
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map((m: any) => String(m)) : [],
            defaultModel: selectedConfig.defaultModel ? String(selectedConfig.defaultModel) : '',
            customModel: selectedConfig.customModel ? String(selectedConfig.customModel) : '',
            enabled: Boolean(selectedConfig.enabled),
            systemPrompt: selectedConfig.systemPrompt ? String(selectedConfig.systemPrompt) : '',
            createdAt: selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: selectedConfig.updatedAt ? selectedConfig.updatedAt.toISOString() : new Date().toISOString()
        };

        // 构建请求参数
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(adjustmentPrompt),
            customPrompt: String(adjustmentPrompt),
            model: String(selectedModel)
        };

        console.log("手动调整请求参数:", request);
        console.log("配置参数:", serializedConfig);

        // 创建 AbortController 用于取消请求
        generationControl.abortController = new AbortController();

        // 启动流式传输监听
        await startStreamingGeneration(request, serializedConfig);
        
        message.success(t('promptManagement.adjustmentComplete'));

    } catch (error: any) {
        console.error("手动调整失败:", error);
        if (error.name === 'AbortError') {
            message.info(t('promptManagement.manualAdjustmentCancelled'));
        } else {
            message.error(t('promptManagement.manualAdjustmentFailed') + ": " + (error.message || t('common.unknownError')));
        }
    } finally {
        optimizing.value = null;
        isStreaming.value = false;
        streamStats.isStreaming = false;
        streamStats.isGenerationActive = false;
        generationControl.abortController = null;
    }
};

// 格式化日期
const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};
const getContentPreview = (content: string) => {
    return content.length > 100 ? content.substring(0, 100) + "..." : content;
};

// 解析预览变量
const getPreviewVariables = (variables: string | any[] | undefined) => {
    try {
        if (typeof variables === 'string') {
            return JSON.parse(variables) || [];
        }
        return Array.isArray(variables) ? variables : [];
    } catch (error) {
        console.error("解析变量配置失败:", error);
        return [];
    }
};

// 预览历史版本
const openPreviewHistory = (history: PromptHistory) => {
    previewHistory.value = history;
    showPreviewModal.value = true;
};

// 关闭预览模态框
const closePreviewModal = () => {
    showPreviewModal.value = false;
    previewHistory.value = null;
};

// 回滚到历史版本
const rollbackToHistory = (history: PromptHistory) => {
    try {
        formData.value = {
            title: history.title,
            description: history.description || "",
            content: history.content,
            categoryId: history.categoryId ? history.categoryId : null,
            tags: history.tags
                ? typeof history.tags === "string"
                    ? history.tags.split(",").map((t) => t.trim()).filter((t) => t)
                    : history.tags
                : [],
            variables: history.variables
                ? JSON.parse(history.variables)
                : [],
        };
        
        // 切换到编辑Tab
        activeTab.value = "edit";
        
        message.success(t('promptManagement.rolledBackToVersion', { version: history.version }));
    } catch (error) {
        console.error("回滚失败:", error);
        message.error(t('promptManagement.rollbackFailed'));
    }
};

// 获取分类名称
const getCategoryName = (categoryId: any) => {
    if (!categoryId) return t('promptManagement.noCategory');
    const category = props.categories.find((cat) => cat.id === categoryId);
    return category?.name || t('promptManagement.unknownCategory');
};

// 提取变量的方法 - 优化版本：去重并只保留实际存在的变量
const extractVariables = (content: string) => {
    let currentVariableNames = new Set<string>();

    if (isJinjaEnabled.value) {
        // Jinja 模式：使用 Jinja 服务提取变量
        currentVariableNames = new Set(jinjaService.extractVariables(content));
    } else {
        // 变量模式：使用原有的正则表达式提取
        const variableRegex = /\{\{([^}]+)\}\}/g;
        const matches = content.match(variableRegex);

        if (matches) {
            matches.forEach((match) => {
                const variableName = match.replace(/[{}]/g, "").trim();
                if (variableName) {
                    currentVariableNames.add(variableName);
                }
            });
        }
    }

    // 保留现有变量的配置信息
    const existingVariableConfigs = new Map();
    formData.value.variables.forEach((variable) => {
        if (variable.name) {
            existingVariableConfigs.set(variable.name, variable);
        }
    });

    // 重新构建变量列表：只包含当前内容中实际存在的变量
    formData.value.variables = Array.from(currentVariableNames).map(
        (variableName) => {
            // 如果已有配置，保留原配置；否则创建新配置
            return (
                existingVariableConfigs.get(variableName) || {
                    name: variableName,
                    label: variableName,
                    type: "text",
                    options: [],
                    defaultValue: "",
                    required: true,
                    placeholder: "",
                }
            );
        }
    );
};

// 防抖的变量提取方法
const debouncedExtractVariables = (content: string) => {
    // 清除之前的定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
    }

    // 设置新的定时器
    debounceTimer.value = setTimeout(() => {
        extractVariables(content);
        debounceTimer.value = null;
    }, DEBOUNCE_DELAY) as unknown as number;
};

// 自动生成标题的函数
const generateAutoTitle = () => {
    if (!formData.value.content) return "";

    const firstLine = formData.value.content.split("\n")[0].trim();
    if (firstLine.length > 30) {
        return firstLine.substring(0, 30) + "...";
    }
    return firstLine || `${t('promptManagement.prompt')} ${new Date().toLocaleString()}`;
};

// 监听 prompt 变化，初始化表单
watch(
    () => props.prompt,
    (newPrompt) => {

        
        if (newPrompt) {
            // 有 prompt 数据，初始化为编辑模式
            formData.value = {
                title: newPrompt.title || "",
                description: newPrompt.description || "",
                content: newPrompt.content || "",
                categoryId: newPrompt.categoryId || null,
                tags: newPrompt.tags
                    ? typeof newPrompt.tags === "string"
                        ? newPrompt.tags
                            .split(",")
                            .map((t: string) => t.trim())
                            .filter((t: string) => t)
                        : Array.isArray(newPrompt.tags) 
                            ? newPrompt.tags 
                            : []
                    : [],
                variables:
                    newPrompt.variables?.map((v: any) => ({
                        name: v.name || "",
                        label: v.label || "",
                        type: v.type || "text",
                        options: Array.isArray(v.options)
                            ? v.options
                            : typeof v.options === "string"
                                ? v.options
                                    .split(",")
                                    .map((opt: string) => opt.trim())
                                    .filter((opt: string) => opt)
                                : [],
                        defaultValue: v.defaultValue || "",
                        required: v.required !== false,
                        placeholder: v.placeholder || "",
                    })) || [],
                isJinjaTemplate: newPrompt.isJinjaTemplate || false,
            };

            // 设置 Jinja 模式状态
            isJinjaEnabled.value = newPrompt.isJinjaTemplate || false;

            // 如果有内容但没有变量配置，立即提取变量
            if (
                newPrompt.content &&
                (!newPrompt.variables || newPrompt.variables.length === 0)
            ) {
                nextTick(() => {
                    extractVariables(newPrompt.content);
                });
            }
            
            // 加载历史记录
            loadHistory();
        } else {
            // 没有 prompt 数据，重置为新建模式
            resetForm();
            // 在新建模式下，确保当前tab不是历史记录
            if (activeTab.value === 'history') {
                activeTab.value = 'edit';
            }
        }
    },
    { immediate: true }
);

// 监听弹窗显示状态，加载快速优化配置
watch(
    () => props.show,
    (newShow) => {
        if (newShow) {
            loadQuickOptimizationConfigs();
        }
    }
);

// 监听弹窗显示状态
watch(
    () => props.show,
    (newShow, oldShow) => {
        if (newShow && !oldShow) {
            // 弹窗从隐藏变为显示时
            activeTab.value = "edit";
            

            
            // 使用 nextTick 确保 props.prompt 已经正确传递
            nextTick(() => {
                // 只有在确实没有 prompt 且不是编辑模式时才重置表单
                if (!props.prompt && !isEdit.value) {
                    resetForm();
                }
            });
        }
        if (oldShow && !newShow) {
            // 弹窗从显示变为隐藏时，清理定时器
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            
            // 重置优化状态
            optimizing.value = null;
            isStreaming.value = false;
            streamingContent.value = "";
            generationControl.shouldStop = false;
            
            // 重置手动调整状态
            showManualInput.value = false;
            manualInstruction.value = "";

            // 延迟重置表单，确保弹窗完全关闭后再重置
            // 注意：只有在新建模式下才重置表单，编辑模式下保留数据
            setTimeout(() => {
                if (!props.show && !isEdit.value) {
                    resetForm();
                }
            }, 200);
        }
    }
);

// 监听内容变化，自动提取变量（使用防抖）
watch(
    () => formData.value.content,
    (newContent) => {
        if (newContent) {
            debouncedExtractVariables(newContent);
        } else {
            // 如果内容为空，立即清空变量列表
            if (debounceTimer.value) {
                clearTimeout(debounceTimer.value);
                debounceTimer.value = null;
            }
            formData.value.variables = [];
        }
    }
);

// 监听变量类型变化，清理不匹配的默认值
watch(
    () => formData.value.variables,
    (newVariables) => {
        newVariables.forEach((variable) => {
            // 当变量类型为选项时，检查默认值是否在选项中
            if (variable.type === "select" && variable.defaultValue) {
                if (!variable.options || !variable.options.includes(variable.defaultValue)) {
                    variable.defaultValue = "";
                }
            }
            // 当变量类型为文本且选项不为空时，清空选项
            if (
                variable.type === "text" &&
                variable.options &&
                variable.options.length > 0
            ) {
                variable.options = [];
            }
            // 当变量类型切换到选项但没有选项时，提供默认选项
            if (
                variable.type === "select" &&
                (!Array.isArray(variable.options) || variable.options.length === 0)
            ) {
                variable.options = ["选项1", "选项2"];
            }
        });
    },
    { deep: true }
);



// 生成唯一变量名的辅助方法
const generateUniqueVariableName = () => {
    const existingNames = new Set(formData.value.variables.map((v) => v.name));
    let counter = 1;
    let variableName = `变量${counter}`;

    while (existingNames.has(variableName)) {
        counter++;
        variableName = `变量${counter}`;
    }

    return variableName;
};

// 获取变量默认值选项
const getVariableDefaultOptions = (options: any) => {
    if (!Array.isArray(options) || options.length === 0) return [];
    return options
        .filter((opt: any) => opt && opt.trim())
        .map((option: any) => ({
            label: option,
            value: option,
        }));
};

// 方法
const addVariable = () => {
    const variableName = generateUniqueVariableName();

    // 添加变量配置
    formData.value.variables.push({
        name: variableName,
        label: variableName,
        type: "text",
        options: [],
        defaultValue: "",
        required: true,
        placeholder: "",
    });

    // 在左侧内容中自动添加对应的占位符
    const placeholder = `{{${variableName}}}`;

    // 如果内容为空，直接添加占位符
    if (!formData.value.content.trim()) {
        formData.value.content = placeholder;
    } else {
        // 如果内容不为空，在末尾添加占位符（换行后添加）
        const content = formData.value.content.trim();
        formData.value.content = content + "\n" + placeholder;
    }
};

const removeVariable = (index: number) => {
    formData.value.variables.splice(index, 1);
};

const handleCancel = () => {
    // 取消时清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }
    
    // 重置优化和流式传输状态
    optimizing.value = null;
    isStreaming.value = false;
    streamingContent.value = "";
    generationControl.shouldStop = true; // 如果正在生成，停止生成
    
    // 重置手动调整状态
    showManualInput.value = false;
    manualInstruction.value = "";

    emit("update:show", false);
};

const handleSave = async () => {
    try {
        await formRef.value?.validate();
        saving.value = true;

        // 自动生成标题（如果没有填写）
        let finalTitle = formData.value.title;
        if (!finalTitle) {
            finalTitle = generateAutoTitle();
        }

        // 检查标题是否重复，如果重复则自动添加时间戳
        try {
            const response = await api.prompts.getAll.query({ search: finalTitle });
            const existingPrompts = Array.isArray(response)
                ? response
                : response?.data || [];

            let duplicatePrompt = existingPrompts.find(
                (p) =>
                    p.title === finalTitle && (!isEdit.value || p.id !== props.prompt?.id)
            );

            // 如果标题重复，自动添加时间戳
            if (duplicatePrompt) {
                const timestamp = new Date()
                    .toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    })
                    .replace(/[/:]/g, "-")
                    .replace(/,?\s+/g, "_");

                finalTitle = `${finalTitle}_${timestamp}`;

                // 再次检查新标题是否重复（极低概率）
                const newCheck = existingPrompts.find(
                    (p) =>
                        p.title === finalTitle &&
                        (!isEdit.value || p.id !== props.prompt?.id)
                );

                // 如果还是重复，添加随机后缀
                if (newCheck) {
                    const randomSuffix = Math.random().toString(36).substring(2, 8);
                    finalTitle = `${finalTitle}_${randomSuffix}`;
                }
            }
        } catch (error) {
            console.error("检查标题重复时出错:", error);
            // 继续执行，不因为标题检查失败而中断保存流程
        }

        const data = {
            title: finalTitle,
            description: formData.value.description || undefined,
            content: formData.value.content,
            categoryId: formData.value.categoryId || undefined,
            tags: formData.value.tags.length > 0 ? formData.value.tags : [],
            isFavorite: false,
            useCount: 0,
            isActive: true,
            isJinjaTemplate: isJinjaEnabled.value,
            variables: formData.value.variables
                .filter((v) => v.name && v.label)
                .map((v) => ({
                    name: v.name,
                    label: v.label,
                    type: v.type,
                    options:
                        v.type === "select" &&
                            Array.isArray(v.options) &&
                            v.options.length > 0
                            ? v.options.filter((opt) => opt.trim())
                            : undefined,
                    defaultValue: v.defaultValue || undefined,
                    required: v.required,
                    placeholder: v.placeholder || undefined,
                })) as any,
        };



        if (isEdit.value) {
            // 编辑模式：先创建历史记录，再更新
            await createHistoryRecord(props.prompt);
            
            await api.prompts.update.mutate({
                id: props.prompt.id,
                data,
            });
            message.success(t('promptManagement.updateSuccess'));
            
            // 重新加载历史记录
            loadHistory();
        } else {
            // 新建模式：需要添加 uuid 字段
            const createData = {
                ...data,
                uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            await api.prompts.create.mutate(createData);
            message.success(t('promptManagement.createSuccess'));
        }

        // 立即发送 saved 事件，通知父组件刷新数据
        emit("saved");

        // 短暂延迟后关闭弹窗，确保数据已经刷新
        setTimeout(() => {
            emit("update:show", false);
            // 额外的安全措施：如果是新建模式，确保表单被重置
            if (!isEdit.value) {
                nextTick(() => {
                    resetForm();
                });
            }
        }, 100);
    } catch (error) {
        message.error(isEdit.value ? t('promptManagement.updateFailed') : t('promptManagement.createFailed'));
        console.error(error);
    } finally {
        saving.value = false;
    }
};

// 组件卸载时的清理
onBeforeUnmount(() => {
    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
        debounceTimer.value = null;
    }
});

// Jinja 相关方法
const toggleJinjaMode = () => {
    if (isJinjaEnabled.value) {
        // 从 Jinja 模式切换到变量模式
        isJinjaEnabled.value = false;
        message.info(t('promptManagement.jinjaDisabled'));
    } else {
        // 从变量模式切换到 Jinja 模式
        if (formData.value.content.trim()) {
            // 如果有现有内容，提示用户确认
            if (confirm(t('promptManagement.jinjaClearContentMessage'))) {
                isJinjaEnabled.value = true;
                formData.value.content = '';
                formData.value.variables = [];
                message.success(t('promptManagement.jinjaEnabled'));
            }
        } else {
            // 没有内容，直接切换
            isJinjaEnabled.value = true;
            message.success(t('promptManagement.jinjaEnabled'));
        }
    }
};

const openJinjaWebsite = () => {
    // 打开 Jinja 官网
    if ((window as any).electronAPI?.shell?.openExternal) {
        (window as any).electronAPI.shell.openExternal('https://jinja.palletsprojects.com/en/stable/');
    } else {
        // 降级到浏览器打开
        window.open('https://jinja.palletsprojects.com/en/stable/', '_blank');
    }
};

// 暴露方法给父组件
defineExpose({
    refreshQuickOptimizationConfigs
});
</script>

<style scoped></style>
