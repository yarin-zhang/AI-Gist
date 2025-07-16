<template>
    <CommonModal v-if="prompt" ref="modalRef" :show="show" @update:show="$emit('update:show', $event)"
        @close="handleClose">
        <!-- 顶部固定区域 -->
        <template #header>
            <div :style="{
                maxWidth: 'calc(100% - 240px)', /* 匹配 CommonModal 的右边距 */
                overflow: 'hidden'
            }">
                <NFlex vertical size="small">
                    <NText :style="{
                        fontSize: '20px',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }">{{
                        prompt?.title
                    }}</NText>
                    <NText depth="3" v-if="prompt.description" class="header-description">{{
                        prompt.description || t('promptManagement.detailModal.noDescription')
                    }}</NText>
                </NFlex>
            </div>
        </template>

        <!-- Header 额外区域 - 操作按钮 -->
        <template #header-extra>
            <NFlex size="small">
                <NButton @click="toggleShortcutTrigger" :type="prompt.isShortcutTrigger ? 'success' : 'default'">
                    <template #icon>
                        <NIcon>
                            <Keyboard />
                        </NIcon>
                    </template>
                    {{ prompt.isShortcutTrigger ? t('promptManagement.cancelShortcutTrigger') :
                        t('promptManagement.setAsShortcutTrigger') }}
                </NButton>
                <NButton @click="toggleFavorite" :type="prompt.isFavorite ? 'error' : 'default'">
                    <template #icon>
                        <NIcon>
                            <Heart />
                        </NIcon>
                    </template>
                    {{ prompt.isFavorite ? t('promptManagement.detailModal.cancelFavorite') :
                        t('promptManagement.detailModal.favorite') }}
                </NButton>
                <NButton type="primary" @click="handleEdit">
                    <template #icon>
                        <NIcon>
                            <Edit />
                        </NIcon>
                    </template>
                    {{ t('promptManagement.detailModal.edit') }}
                </NButton>
            </NFlex>
        </template> <!-- 中间可操作区域 -->
        <template #content="{ contentHeight }">
            <!-- Tabs 切换 -->
            <NTabs v-model:value="activeTab" type="segment" :style="{ height: `${contentHeight}px` }">
                <!-- 详情 Tab -->
                <NTabPane name="detail" :tab="t('promptManagement.detailModal.detail')">
                    <NSplit direction="horizontal" :min="0.3" :max="0.8" :default-size="0.6"
                        :style="{ height: `${contentHeight - 50}px` }">
                        <!-- 左侧：提示词内容 -->
                        <template #1>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NFlex align="center" size="small">
                                            <NText strong>{{ t('promptManagement.detailModal.promptContent') }}</NText>
                                            <NTag v-if="props.prompt?.isJinjaTemplate" size="small" type="info"
                                                style="margin-left: 8px;">
                                                <template #icon>
                                                    <NIcon>
                                                        <Code />
                                                    </NIcon>
                                                </template>
                                                Jinja
                                            </NTag>
                                        </NFlex>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }" ref="contentScrollbarRef">
                                    <NFlex vertical size="medium" style="padding-right: 12px">
                                        <NInput :value="filledContent" type="textarea" readonly
                                            :autosize="{ minRows: 9 }" :style="{
                                                fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                            }"
                                            :placeholder="!filledContent ? t('promptManagement.detailModal.contentEmpty') : ''" />

                                        <!-- 如果有未填写的变量，显示提示 -->
                                        <NFlex v-if="hasUnfilledVariables" align="center">
                                            <NIcon color="#fa8c16">
                                                <Wand />
                                            </NIcon>
                                            <NText>{{ t('promptManagement.detailModal.unfilledVariablesTip') }}</NText>
                                        </NFlex>



                                        <!-- 调试区域 -->
                                        <NAlert v-if="canDebug" type="info" :show-icon="false"
                                            style="margin-top: 16px;">
                                            <template #header>
                                                <NFlex align="center" size="small">
                                                    <NIcon>
                                                        <Bug />
                                                    </NIcon>
                                                    <NText strong>{{ t('promptManagement.detailModal.debugPrompt') }}
                                                    </NText>
                                                </NFlex>
                                            </template>

                                            <!-- AI配置和模型选择 -->
                                            <NFlex vertical size="medium" style="margin-top: 12px;">
                                                <NFlex size="medium" align="end">
                                                    <AIModelSelector ref="modelSelectorRef"
                                                        v-model:modelKey="selectedModelKey"
                                                        :placeholder="t('promptManagement.detailModal.selectAIModel')"
                                                        :disabled="debugging" />
                                                </NFlex>

                                                <!-- 调试按钮和进度显示 -->
                                                <NFlex justify="center" vertical size="small">
                                                    <!-- 调试按钮 -->
                                                    <NFlex size="small" justify="center">
                                                        <NButton type="primary" :loading="debugging"
                                                            :disabled="!canDebug || debugging || !selectedModelKey"
                                                            @click="debugPrompt" size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Robot />
                                                                </NIcon>
                                                            </template>
                                                            {{ debugging ? t('promptManagement.detailModal.debugging') :
                                                            t('promptManagement.detailModal.seeEffect') }}
                                                        </NButton>

                                                        <!-- 中断按钮 -->
                                                        <NButton v-if="debugging" type="error" secondary
                                                            @click="stopDebug" size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <X />
                                                                </NIcon>
                                                            </template>
                                                            {{ t('promptManagement.detailModal.stop') }}
                                                        </NButton>
                                                    </NFlex>

                                                    <!-- 流式传输进度显示 -->
                                                    <div v-if="debugging && debugStreaming" style="margin-top: 8px;">
                                                        <NFlex align="center" size="small">
                                                            <NIcon v-if="debugStreamStats.isGenerationActive"
                                                                color="#18a058">
                                                                <Loader />
                                                            </NIcon>
                                                            <NIcon v-else color="#d03050">
                                                                <Clock />
                                                            </NIcon>
                                                            <NText depth="3" style="font-size: 12px;">
                                                                {{ t('promptManagement.detailModal.generatedChars', {
                                                                count: debugStreamStats.charCount
                                                                }) }}
                                                                <span v-if="debugStreamStats.contentGrowthRate > 0">
                                                                    {{ t('promptManagement.detailModal.charsPerSecond',
                                                                    { rate:
                                                                    debugStreamStats.contentGrowthRate.toFixed(1) }) }}
                                                                </span>
                                                            </NText>
                                                        </NFlex>
                                                    </div>
                                                </NFlex>
                                            </NFlex>
                                        </NAlert>

                                        <!-- 调试结果显示 -->
                                        <div v-if="debugResult || debugError">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.debugResultLabel') }}</NText>

                                            <!-- 成功结果 -->
                                            <NAlert v-if="debugResult" type="success" :show-icon="false">
                                                <template #header>
                                                    <NFlex align="center" size="small">
                                                        <NIcon>
                                                            <CircleCheck />
                                                        </NIcon>
                                                        <NText>{{ t('promptManagement.detailModal.aiResponse') }}
                                                        </NText>
                                                        <NTag v-if="debugStreaming" size="small" type="info"
                                                            style="margin-left: 8px;">
                                                            {{ t('promptManagement.detailModal.streaming') }}
                                                        </NTag>
                                                    </NFlex>
                                                </template>
                                                <NInput v-model:value="debugResult" type="textarea" readonly :rows="8"
                                                    :style="{
                                                        fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        backgroundColor: 'var(--success-color-suppl)',
                                                        marginTop: '8px'
                                                    }" />
                                            </NAlert>

                                            <!-- 调试结果操作按钮 -->
                                            <NFlex v-if="debugResult" justify="space-between" style="margin-top: 8px;">
                                                <NButton size="small" @click="copyToClipboard(debugResult)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Copy />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('promptManagement.detailModal.copyResult') }}
                                                </NButton>
                                                <NButton v-if="debugging" size="small" type="error" secondary
                                                    @click="stopDebug">
                                                    <template #icon>
                                                        <NIcon>
                                                            <X />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('promptManagement.detailModal.stop') }}
                                                </NButton>
                                            </NFlex>

                                            <!-- 错误结果 -->
                                            <NAlert v-if="debugError" type="error" :show-icon="false">
                                                <template #header>
                                                    <NFlex align="center" size="small">
                                                        <NIcon>
                                                            <AlertTriangle />
                                                        </NIcon>
                                                        <NText>{{ t('promptManagement.detailModal.debugFailed') }}
                                                        </NText>
                                                    </NFlex>
                                                </template>
                                                <NText>{{ debugError }}</NText>
                                            </NAlert>
                                        </div>
                                    </NFlex>
                                </NScrollbar>
                            </NCard>
                        </template>

                        <!-- 右侧：变量输入区 -->
                        <template #2>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>{{ t('promptManagement.detailModal.variableSettings') }}</NText>
                                        <NButton v-if="hasVariables" size="small" @click="clearVariables">{{
                                            t('promptManagement.detailModal.clear') }}</NButton>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 140}px` }">
                                    <NFlex vertical size="medium" style="padding-right: 12px" v-if="hasVariables">
                                        <!-- Jinja 模板模式：显示动态提取的变量 -->
                                        <template v-if="prompt.isJinjaTemplate">
                                            <NFormItem v-for="variableName in getJinjaTemplateVariables()"
                                                :key="variableName" :label="variableName" :required="true">
                                                <NInput v-model:value="variableValues[variableName]" type="textarea"
                                                    :placeholder="`请输入 ${variableName} 的值`" :rows="1"
                                                    :autosize="{ minRows: 1, maxRows: 5 }" />
                                            </NFormItem>
                                        </template>
                                        <!-- 变量模式：显示配置的变量 -->
                                        <template v-else>
                                            <NFormItem v-for="variable in prompt.variables" :key="variable.name"
                                                :label="variable.name" :required="variable.required">
                                                <NInput v-model:value="variableValues[variable.name]" type="textarea"
                                                    :placeholder="`请输入 ${variable.name} 的值`" :rows="1"
                                                    :autosize="{ minRows: 1, maxRows: 5 }" />
                                            </NFormItem>
                                        </template>
                                    </NFlex>
                                    <NEmpty v-else
                                        :description="t('promptManagement.detailModal.noConfigurableVariables')">
                                        <template #icon>
                                            <NIcon>
                                                <Wand />
                                            </NIcon>
                                        </template>
                                    </NEmpty>
                                </NScrollbar>
                            </NCard>
                        </template>
                    </NSplit>
                </NTabPane>

                <!-- 历史记录 Tab -->
                <NTabPane name="history"
                    :tab="t('promptManagement.detailModal.variableHistory', { count: useHistory.length })"
                    :disabled="useHistory.length === 0">
                    <NSplit v-if="useHistory.length > 0" direction="horizontal" :min="0.3" :max="0.8"
                        :default-size="0.6" :style="{ height: `${contentHeight - 50}px` }">
                        <!-- 左侧：使用记录预览 -->
                        <template #1>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>{{ t('promptManagement.detailModal.usageRecords') }}</NText>
                                        <NFlex align="center" size="small">
                                            <NTag size="small" type="info">{{ useHistory.length }} {{
                                                t('promptManagement.detailModal.records') }}</NTag>
                                            <NText depth="3">{{ t('promptManagement.detailModal.usageRecords') }}
                                            </NText>
                                        </NFlex>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }" v-if="selectedHistory">
                                    <NFlex vertical size="medium" style="padding-right: 12px;">
                                        <NFlex align="center" size="small">
                                            <NTag type="info" size="small">{{
                                                t('promptManagement.detailModal.usageRecord') }}</NTag>
                                            <NText depth="3">{{ selectedHistory.date }}</NText>
                                        </NFlex>

                                        <!-- 变量信息 -->
                                        <div
                                            v-if="selectedHistory.variables && Object.keys(selectedHistory.variables).length > 0">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.includedVariables') }}</NText>
                                            <NFlex vertical size="small">
                                                <NFlex v-for="(value, key) in selectedHistory.variables" :key="key"
                                                    align="center" size="small">
                                                    <NTag size="small" type="primary" :bordered="false">{{ key }}</NTag>
                                                    <NInput :value="value" readonly size="small" />
                                                </NFlex>
                                            </NFlex>
                                        </div>

                                        <!-- 完整内容 -->
                                        <div>
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.completeContent') }}</NText>
                                            <NInput :value="selectedHistory.content" type="textarea" readonly :rows="8"
                                                :style="{
                                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                }" />
                                        </div>

                                        <!-- 操作按钮 -->
                                        <NFlex justify="space-between">
                                            <NPopconfirm @positive-click="deleteHistoryRecord">
                                                <template #trigger>
                                                    <NButton type="error" secondary size="small">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Trash />
                                                            </NIcon>
                                                        </template>
                                                        {{ t('promptManagement.detailModal.delete') }}
                                                    </NButton>
                                                </template>
                                                {{ t('promptManagement.detailModal.confirmDeleteHistory') }}
                                            </NPopconfirm>
                                            <NButton type="primary" size="small"
                                                @click="copyToClipboard(selectedHistory.content)">
                                                <template #icon>
                                                    <NIcon>
                                                        <Copy />
                                                    </NIcon>
                                                </template>
                                                {{ t('promptManagement.detailModal.copyRecord') }}
                                            </NButton>
                                        </NFlex>
                                    </NFlex>
                                </NScrollbar>
                                <NEmpty v-else :description="t('promptManagement.detailModal.selectUsageRecord')">
                                    <template #icon>
                                        <NIcon>
                                            <History />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NCard>
                        </template>

                        <!-- 右侧：使用记录列表 -->
                        <template #2>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>{{ t('promptManagement.detailModal.recordList') }}</NText>
                                        <NFlex size="small">
                                            <!-- 分页控件 -->
                                            <NPagination v-model:page="currentPage" :page-count="totalPages"
                                                :page-size="pageSize" size="small" show-quick-jumper show-size-picker
                                                :page-sizes="[1, 3, 5, 10]" :page-slot="5"
                                                @update:page-size="handlePageSizeChange" />
                                        </NFlex>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                    <NFlex vertical size="small" style="padding: 12px;">
                                        <NCard v-for="(record, index) in paginatedHistory"
                                            :key="(currentPage - 1) * pageSize + index" size="small" hoverable :style="{
                                                cursor: 'pointer',
                                                borderColor: selectedHistoryIndex === (currentPage - 1) * pageSize + index
                                                    ? 'var(--info-color)'
                                                    : undefined
                                            }" @click="selectHistoryRecord((currentPage - 1) * pageSize + index)">
                                            <template #header>
                                                <NFlex justify="space-between" align="center">
                                                    <NText depth="3" style="font-size: 12px;">{{ record.date }}</NText>
                                                </NFlex>
                                            </template>

                                            <NFlex vertical size="small">
                                                <NText class="history-content-preview" style="font-size: 12px;">
                                                    {{ record.content.substring(0, 60) }}{{ record.content.length > 60 ?
                                                    "..." : "" }}
                                                </NText>

                                                <NFlex
                                                    v-if="record.variables && Object.keys(record.variables).length > 0"
                                                    size="small">
                                                    <NText depth="3" style="font-size: 11px;">{{
                                                        t('promptManagement.detailModal.variables') }}：
                                                    </NText>
                                                    <NTag v-for="key in Object.keys(record.variables).slice(0, 2)"
                                                        :key="key" size="tiny" type="primary" :bordered="false">
                                                        {{ key }}
                                                    </NTag>
                                                    <NText v-if="Object.keys(record.variables).length > 2" depth="3"
                                                        style="font-size: 11px;">
                                                        +{{ Object.keys(record.variables).length - 2 }}
                                                    </NText>
                                                </NFlex>
                                            </NFlex>

                                            <template #action>
                                                <NFlex justify="end">
                                                    <NButton size="tiny" text type="primary"
                                                        @click.stop="loadHistoryRecord(record)">
                                                        {{ t('promptManagement.detailModal.reload') }}
                                                    </NButton>
                                                </NFlex>
                                            </template>
                                        </NCard>
                                    </NFlex>
                                </NScrollbar>
                            </NCard>
                        </template>
                    </NSplit>
                </NTabPane>

                <!-- 调试历史记录 Tab -->
                <NTabPane name="debug"
                    :tab="t('promptManagement.detailModal.debugHistory', { count: debugHistory.length })">
                    <NSplit v-if="debugHistory.length > 0" direction="horizontal" :min="0.3" :max="0.8"
                        :default-size="0.6" :style="{ height: `${contentHeight - 50}px` }">
                        <!-- 左侧：调试记录预览 -->
                        <template #1>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NFlex align="center" size="small">
                                            <NText strong>{{ t('promptManagement.detailModal.debugRecords') }}</NText>
                                            <NTag size="small" type="success">{{ debugHistory.length }} {{
                                                t('promptManagement.detailModal.records') }}</NTag>
                                        </NFlex>
                                        <NFlex align="center" size="small">
                                            <!-- 手动记录按钮 -->
                                            <NButton size="small" type="primary" @click="showManualRecordModal = true">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                                {{ t('promptManagement.detailModal.manualRecord') }}
                                            </NButton>
                                        </NFlex>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }" v-if="selectedDebugHistory">
                                    <NFlex vertical size="medium" style="padding-right: 12px;">
                                        <NFlex align="center" size="small">
                                            <NTag
                                                :type="selectedDebugHistory.debugStatus === 'success' ? 'success' : 'error'"
                                                size="small">
                                                <template #icon>
                                                    <NIcon>
                                                        <Robot />
                                                    </NIcon>
                                                </template>
                                                {{ selectedDebugHistory.model === 'manual' ?
                                                    t('promptManagement.detailModal.manualRecordType')
                                                : t('promptManagement.detailModal.debugRecordType') }}
                                            </NTag>
                                            <NText depth="3">{{ formatDate(selectedDebugHistory.createdAt) }}</NText>
                                        </NFlex>

                                        <!-- 调试配置信息 -->
                                        <div v-if="selectedDebugHistory.model !== 'manual'">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.debugConfig') }}</NText>
                                            <NFlex size="small">
                                                <NTag size="small" type="primary" :bordered="false">{{
                                                    selectedDebugHistory.model }}</NTag>
                                            </NFlex>
                                        </div>

                                        <!-- 手动记录备注信息 -->
                                        <div
                                            v-if="selectedDebugHistory.model === 'manual' && selectedDebugHistory.customPrompt">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.notesLabel') }}</NText>
                                            <NInput :value="selectedDebugHistory.customPrompt" readonly :rows="2" />
                                        </div>

                                        <!-- 原始提示词 -->
                                        <div>
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.originalPrompt') }}</NText>
                                            <NInput :value="selectedDebugHistory.generatedPrompt" type="textarea"
                                                readonly :rows="4" :style="{
                                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                }" />
                                        </div>

                                        <!-- AI响应结果 -->
                                        <div v-if="selectedDebugHistory.debugResult">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.aiResponseResult') }}</NText>
                                            <NInput :value="selectedDebugHistory.debugResult" type="textarea" readonly
                                                :rows="6" :style="{
                                                    fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                }" />
                                        </div>

                                        <!-- 错误信息 -->
                                        <div
                                            v-if="selectedDebugHistory.debugStatus === 'error' && selectedDebugHistory.debugErrorMessage">
                                            <NText strong style="margin-bottom: 8px; display: block;">{{
                                                t('promptManagement.detailModal.errorInfo') }}</NText>
                                            <NAlert type="error">
                                                {{ selectedDebugHistory.debugErrorMessage }}
                                            </NAlert>
                                        </div>

                                        <!-- 操作按钮 -->
                                        <NFlex justify="space-between">
                                            <NPopconfirm @positive-click="deleteDebugRecord">
                                                <template #trigger>
                                                    <NButton type="error" secondary size="small">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Trash />
                                                            </NIcon>
                                                        </template>
                                                        {{ t('promptManagement.detailModal.delete') }}
                                                    </NButton>
                                                </template>
                                                {{ t('promptManagement.detailModal.confirmDeleteDebugRecord') }}
                                            </NPopconfirm>
                                            <NFlex size="small">
                                                <NButton v-if="selectedDebugHistory.debugResult" size="small"
                                                    @click="copyToClipboard(selectedDebugHistory.debugResult)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Copy />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('promptManagement.detailModal.copyAIResponse') }}
                                                </NButton>
                                                <NButton size="small"
                                                    @click="copyToClipboard(selectedDebugHistory.generatedPrompt)">
                                                    <template #icon>
                                                        <NIcon>
                                                            <Copy />
                                                        </NIcon>
                                                    </template>
                                                    {{ t('promptManagement.detailModal.copyPrompt') }}
                                                </NButton>
                                            </NFlex>
                                        </NFlex>
                                    </NFlex>
                                </NScrollbar>
                                <NEmpty v-else :description="t('promptManagement.detailModal.selectDebugRecord')">
                                    <template #icon>
                                        <NIcon>
                                            <Robot />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NCard>
                        </template>

                        <!-- 右侧：调试记录列表 -->
                        <template #2>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>{{ t('promptManagement.detailModal.recordList') }}</NText>
                                        <NFlex size="small">
                                            <!-- 分页控件 -->
                                            <NPagination v-model:page="debugCurrentPage" :page-count="debugTotalPages"
                                                :page-size="debugPageSize" size="small" show-quick-jumper
                                                show-size-picker :page-sizes="[1, 3, 5, 10]" :page-slot="5"
                                                @update:page-size="(newSize) => { debugPageSize = newSize; debugCurrentPage = 1; selectedDebugIndex = -1; }" />
                                        </NFlex>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }">
                                    <NFlex vertical size="small" style="padding: 12px;">
                                        <NCard v-for="(record, index) in paginatedDebugHistory"
                                            :key="(debugCurrentPage - 1) * debugPageSize + index" size="small" hoverable
                                            :style="{
                                                cursor: 'pointer',
                                                borderColor: selectedDebugIndex === (debugCurrentPage - 1) * debugPageSize + index
                                                    ? 'var(--success-color)'
                                                    : undefined
                                            }"
                                            @click="selectDebugRecord((debugCurrentPage - 1) * debugPageSize + index)">
                                            <template #header>
                                                <NFlex justify="space-between" align="center">
                                                    <NText depth="3" style="font-size: 12px;">{{
                                                        formatDate(record.createdAt) }}</NText>
                                                    <NFlex size="small">
                                                        <NTag
                                                            :type="record.debugStatus === 'success' ? 'success' : 'error'"
                                                            size="tiny">
                                                            {{ record.debugStatus === 'success' ?
                                                                t('promptManagement.detailModal.success') :
                                                            t('promptManagement.detailModal.failed') }}
                                                        </NTag>
                                                        <!-- 手动记录标识 -->
                                                        <NTag v-if="record.model === 'manual'" type="warning"
                                                            size="tiny">
                                                            {{ t('promptManagement.detailModal.manual') }}
                                                        </NTag>
                                                    </NFlex>
                                                </NFlex>
                                            </template>

                                            <NFlex vertical size="small">
                                                <NText style="font-size: 12px;">{{ record.topic }}</NText>
                                                <NFlex size="small">
                                                    <NTag v-if="record.model !== 'manual'" size="tiny" type="primary"
                                                        :bordered="false">
                                                        {{ record.model }}
                                                    </NTag>
                                                    <NTag v-else size="tiny" type="warning" :bordered="false">
                                                        {{ t('promptManagement.detailModal.manualRecordLabel') }}
                                                    </NTag>
                                                </NFlex>
                                            </NFlex>
                                        </NCard>
                                    </NFlex>
                                </NScrollbar>
                            </NCard>
                        </template>
                    </NSplit>

                    <!-- 当没有调试记录时显示的内容 -->
                    <div v-else :style="{ height: `${contentHeight - 50}px` }">
                        <NCard size="small" :style="{ height: '100%' }">
                            <template #header>
                                <NFlex justify="space-between" align="center">
                                    <NText strong>{{ t('promptManagement.detailModal.debugHistoryTitle') }}</NText>
                                    <NButton size="small" type="primary" @click="showManualRecordModal = true">
                                        <template #icon>
                                            <NIcon>
                                                <Plus />
                                            </NIcon>
                                        </template>
                                        手动记录
                                    </NButton>
                                </NFlex>
                            </template>
                            <NEmpty :description="t('promptManagement.detailModal.noDebugRecords')">
                                <template #icon>
                                    <NIcon>
                                        <Robot />
                                    </NIcon>
                                </template>
                                <template #extra>
                                    <NFlex vertical size="medium" align="center">
                                        <NText depth="3" style="font-size: 12px;">
                                            {{ t('promptManagement.detailModal.debugRecordHelp') }}
                                        </NText>
                                        <NFlex size="small">
                                            <NButton size="small" type="primary" @click="showManualRecordModal = true">
                                                <template #icon>
                                                    <NIcon>
                                                        <Plus />
                                                    </NIcon>
                                                </template>
                                                {{ t('promptManagement.detailModal.manualRecord') }}
                                            </NButton>
                                            <NButton size="small" @click="activeTab = 'detail'">
                                                <template #icon>
                                                    <NIcon>
                                                        <Bug />
                                                    </NIcon>
                                                </template>
                                                去调试
                                            </NButton>
                                        </NFlex>
                                    </NFlex>
                                </template>
                            </NEmpty>
                        </NCard>
                    </div>
                </NTabPane>

            </NTabs>
        </template> <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <!-- 左侧区域 - 时间和标签信息 -->
                    <NFlex size="small" align="center" wrap>
                        <NText depth="3" style="margin-right: 8px">{{
                            formatDate(prompt.updatedAt)
                        }}</NText>
                        <NTag v-if="hasVariables" size="small" type="info">
                            {{ getVariableCount() }} 个变量
                        </NTag>
                        <NTag v-if="prompt.category" size="small" :color="getCategoryTagColor(prompt.category)">
                            <template #icon>
                                <NIcon>
                                    <Box />
                                </NIcon>
                            </template>
                            {{ prompt.category.name }}
                        </NTag>
                        <template v-if="prompt.tags">
                            <NTag v-for="tag in getTagsArray(prompt.tags)" :key="tag" size="small" :bordered="false"
                                :color="getTagColor(tag)">
                                <template #icon>
                                    <NIcon>
                                        <Tag />
                                    </NIcon>
                                </template>
                                {{ tag }}
                            </NTag>
                        </template>
                    </NFlex>
                </div>

                <div>
                    <!-- 右侧区域 - 主要操作按钮 -->
                    <NFlex size="small">
                        <NButton type="primary" @click="usePrompt">
                            <template #icon>
                                <NIcon>
                                    <Check />
                                </NIcon>
                            </template>
                            复制内容
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 手动记录调试历史模态框 -->
    <CommonModal :show="showManualRecordModal" @update:show="showManualRecordModal = false"
        @close="showManualRecordModal = false">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ t('promptManagement.detailModal.manualRecordTitle') }}
            </NText>
            <NText depth="3">
                {{ t('promptManagement.detailModal.manualRecordDesc') }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <NFlex vertical size="medium" :style="{ height: `${contentHeight}px` }">
                <NForm ref="manualRecordFormRef" :model="manualRecordData" :rules="manualRecordRules"
                    label-placement="top">
                    <NFormItem :label="t('promptManagement.detailModal.recordTitle')" path="title">
                        <NInput v-model:value="manualRecordData.title"
                            :placeholder="t('promptManagement.detailModal.recordTitlePlaceholder')" :maxlength="100"
                            show-count />
                    </NFormItem>

                    <NFormItem :label="t('promptManagement.detailModal.debugResultField')" path="result">
                        <NInput v-model:value="manualRecordData.result" type="textarea"
                            :placeholder="t('promptManagement.detailModal.debugResultPlaceholder')" :rows="8"
                            :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }" show-count
                            :maxlength="2000" />
                    </NFormItem>

                    <NFormItem :label="t('promptManagement.detailModal.notesField')" path="notes">
                        <NInput v-model:value="manualRecordData.notes" type="textarea"
                            :placeholder="t('promptManagement.detailModal.notesPlaceholder')" :rows="3" show-count
                            :maxlength="500" />
                    </NFormItem>

                    <NFormItem :label="t('promptManagement.detailModal.debugStatus')" path="status">
                        <NSelect v-model:value="manualRecordData.status" :options="[
                            { label: t('promptManagement.detailModal.success'), value: 'success' },
                            { label: t('promptManagement.detailModal.failed'), value: 'error' }
                        ]" :placeholder="t('promptManagement.detailModal.selectDebugStatus')" />
                    </NFormItem>
                </NForm>
            </NFlex>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <NText depth="3">
                        {{ t('promptManagement.detailModal.manualRecordTip') }}
                    </NText>
                </div>
                <div>
                    <NFlex size="small">
                        <NButton @click="showManualRecordModal = false">{{ t('promptManagement.detailModal.cancel') }}
                        </NButton>
                        <NButton type="primary" @click="saveManualRecord" :loading="savingManualRecord"
                            :disabled="!manualRecordData.title.trim() || !manualRecordData.result.trim()">
                            {{ t('promptManagement.detailModal.saveRecord') }}
                        </NButton>
                    </NFlex>
                </div>
            </NFlex>
        </template>
    </CommonModal>


</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, toRef } from "vue";
import {
    NCard,
    NFlex,
    NText,
    NTag,
    NButton,
    NIcon,
    NInput,
    NFormItem,
    NSelect,
    NEmpty,
    NScrollbar,
    NPagination,
    NPopconfirm,
    NSplit,
    NTabs,
    NTabPane,
    NAlert,
    NSpace,
    useMessage,
} from "naive-ui";
import {
    Heart,
    Edit,
    Copy,
    Wand,
    Check,
    History,
    FileText,
    Trash,
    Tag,
    Box,
    Bug,
    Robot,
    CircleCheck,
    AlertTriangle,
    Plus,
    X,
    Loader,
    Clock,
    Code,
    Keyboard,
} from "@vicons/tabler";
import { api } from "@/lib/api";
import { useTagColors } from "@/composables/useTagColors";
import { useI18n } from "@/composables/useI18n";
import CommonModal from "@/components/common/CommonModal.vue";
import AIModelSelector from "@/components/common/AIModelSelector.vue";
import type { AIGenerationHistory } from "../../../shared/types/ai";
import { jinjaService } from "@/lib/utils/jinja.service";

interface Props {
    show: boolean;
    prompt?: any;
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "use"): void;
    (e: "edit", prompt: any): void;
    (e: "updated"): void; // 添加数据更新事件
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();
const { t } = useI18n();

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors();

// 响应式数据
const variableValues = ref<Record<string, any>>({});
const useHistory = ref<Array<{
    date: string;
    content: string;
    variables: Record<string, any>;
}>>([]);
const debugHistory = ref<AIGenerationHistory[]>([]); // 调试历史记录
const activeTab = ref("detail"); // 默认显示详情页面
const selectedHistoryIndex = ref(-1);
const selectedDebugIndex = ref(-1); // 选中的调试记录索引

// 调试相关状态
const debugging = ref(false);
const debugResult = ref("");
const debugError = ref("");

// 流式调试相关状态
const debugStreaming = ref(false);
const debugStreamStats = ref({
    charCount: 0,
    isStreaming: true,
    lastCharCount: 0,
    noContentUpdateCount: 0,
    lastUpdateTime: Date.now(),
    isGenerationActive: true,
    contentGrowthRate: 0
});

// 调试中断控制
const debugGenerationControl = ref({
    shouldStop: false,
    abortController: null as AbortController | null
});

// 手动记录相关状态
const showManualRecordModal = ref(false);
const savingManualRecord = ref(false);
const manualRecordFormRef = ref();


const manualRecordData = ref({
    title: "",
    result: "",
    notes: "",
    status: "success" as "success" | "error"
});

// 手动记录表单验证规则
const manualRecordRules = {
    title: {
        required: true,
        message: "请输入记录标题",
        trigger: "blur"
    },
    result: {
        required: true,
        message: "请输入调试结果",
        trigger: "blur"
    },
    status: {
        required: true,
        message: "请选择调试状态",
        trigger: "change"
    }
};

// AI 配置相关 - 使用新的组件
const modelSelectorRef = ref();
const selectedModelKey = ref("");

// 分页相关
const currentPage = ref(1);
const pageSize = ref(3);
const debugCurrentPage = ref(1);
const debugPageSize = ref(3);

// 分页计算属性
const totalPages = computed(() =>
    Math.ceil(useHistory.value.length / pageSize.value)
);

const paginatedHistory = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return useHistory.value.slice(start, end);
});

// 调试记录分页计算属性
const debugTotalPages = computed(() =>
    Math.ceil(debugHistory.value.length / debugPageSize.value)
);

const paginatedDebugHistory = computed(() => {
    const start = (debugCurrentPage.value - 1) * debugPageSize.value;
    const end = start + debugPageSize.value;
    return debugHistory.value.slice(start, end);
});

// 选中的调试记录
const selectedDebugHistory = computed(() => {
    if (
        selectedDebugIndex.value >= 0 &&
        selectedDebugIndex.value < debugHistory.value.length
    ) {
        return debugHistory.value[selectedDebugIndex.value];
    }
    return null;
});

// 处理页面大小变化
const handlePageSizeChange = (newPageSize: number) => {
    pageSize.value = newPageSize;
    currentPage.value = 1;
    selectedHistoryIndex.value = -1;
};

// 初始化变量值
const initializeVariables = () => {
    const values: Record<string, any> = {};

    if (props.prompt?.isJinjaTemplate) {
        // Jinja 模板模式：优先使用存储的变量配置，如果没有则从模板内容中提取
        if (props.prompt?.variables && props.prompt.variables.length > 0) {
            // 使用存储的变量配置
            props.prompt.variables.forEach((variable: any) => {
                values[variable.name] = variable.defaultValue || "";
            });
        } else {
            // 从模板内容中提取变量
            try {
                const templateVariables = jinjaService.extractVariables(props.prompt.content || '');
                templateVariables.forEach(variableName => {
                    values[variableName] = "";
                });
            } catch (error) {
                console.error("提取 Jinja 模板变量失败:", error);
            }
        }
    } else {
        // 变量模式：使用存储的变量配置
        if (props.prompt?.variables) {
            props.prompt.variables.forEach((variable: any) => {
                // 确保每个变量都有初始值，即使是空字符串
                values[variable.name] = variable.defaultValue || "";
            });
        }
    }

    variableValues.value = values;
};



// 生成填充后的 Prompt - 改为计算属性，自动生成
const filledContent = computed(() => {
    if (!props.prompt?.content) return "";

    let content = props.prompt.content;

    // 检查是否为 Jinja 模板
    if (props.prompt.isJinjaTemplate) {
        try {
            // 使用 Jinja 服务渲染模板
            content = jinjaService.render(props.prompt.content, variableValues.value);
        } catch (error) {
            console.error("Jinja 模板渲染失败:", error);
            // 渲染失败时返回原始内容
            content = props.prompt.content;
        }
    } else {
        // 变量模式：检查是否有变量配置
        if (props.prompt.variables && props.prompt.variables.length > 0) {
            // 变量替换逻辑
            Object.entries(variableValues.value).forEach(([key, value]) => {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
                // 如果变量有值，就替换；如果没有值，保留原始的 {{key}} 格式
                if (
                    value !== undefined &&
                    value !== null &&
                    value.toString().trim() !== ""
                ) {
                    content = content.replace(regex, value.toString());
                }
            });
        }
    }

    return content;
});

// 是否有变量
const hasVariables = computed(() => {
    if (props.prompt?.isJinjaTemplate) {
        // Jinja 模板模式：优先检查存储的变量配置
        if (props.prompt?.variables && props.prompt.variables.length > 0) {
            return true;
        }
        // 如果没有存储的变量配置，从模板内容中提取
        try {
            const templateVariables = jinjaService.extractVariables(props.prompt.content || '');
            return templateVariables.length > 0;
        } catch (error) {
            return false;
        }
    } else {
        // 变量模式：使用存储的变量配置
        return props.prompt?.variables && props.prompt.variables.length > 0;
    }
});

// 是否有未填写的变量
const hasUnfilledVariables = computed(() => {
    if (!hasVariables.value) return false;

    if (props.prompt?.isJinjaTemplate) {
        // Jinja 模板模式：检查是否有未定义的变量
        try {
            const templateVariables = jinjaService.extractVariables(props.prompt.content);

            // 检查每个模板变量是否都有对应的值
            return templateVariables.some(variableName => {
                const value = variableValues.value[variableName];
                return value === undefined ||
                    value === null ||
                    value.toString().trim() === "";
            });
        } catch (error) {
            console.error("检查 Jinja 模板变量失败:", error);
            return true; // 验证失败，认为有未填写的变量
        }
    } else {
        // 变量模式：检查配置的变量是否都已填写
        if (props.prompt?.variables) {
            return props.prompt.variables.some((variable: any) => {
                const value = variableValues.value[variable.name];
                return variable.required && (
                    value === undefined ||
                    value === null ||
                    value.toString().trim() === ""
                );
            });
        }
        return false;
    }
});

// 是否可以调试 - 变量已填写完或没有变量
const canDebug = computed(() => {
    return !hasUnfilledVariables.value && props.prompt?.content && filledContent.value.trim().length > 0;
});

// 选中的历史记录
const selectedHistory = computed(() => {
    if (
        selectedHistoryIndex.value >= 0 &&
        selectedHistoryIndex.value < useHistory.value.length
    ) {
        return useHistory.value[selectedHistoryIndex.value];
    }
    return null;
});

// 获取 Jinja 模板变量列表
const getJinjaTemplateVariables = () => {
    if (!props.prompt?.isJinjaTemplate) {
        return [];
    }

    // 优先使用存储的变量配置
    if (props.prompt?.variables && props.prompt.variables.length > 0) {
        return props.prompt.variables.map((v: any) => v.name);
    }

    // 如果没有存储的变量配置，从模板内容中提取
    if (props.prompt?.content) {
        try {
            return jinjaService.extractVariables(props.prompt.content);
        } catch (error) {
            console.error("提取 Jinja 模板变量失败:", error);
            return [];
        }
    }

    return [];
};

// 获取变量数量
const getVariableCount = () => {
    if (props.prompt?.isJinjaTemplate) {
        // Jinja 模板模式：优先使用存储的变量配置
        if (props.prompt?.variables && props.prompt.variables.length > 0) {
            return props.prompt.variables.length;
        }
        // 如果没有存储的变量配置，从模板内容中提取
        return getJinjaTemplateVariables().length;
    } else {
        return props.prompt?.variables?.length || 0;
    }
};

// 清空变量
const clearVariables = () => {
    initializeVariables();
};

// 复制到剪贴板
const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        message.success("已复制到剪贴板");
    } catch (error) {
        message.error("复制失败");
    }
};

// 加载调试历史记录
const loadDebugHistory = async () => {
    try {
        if (!props.prompt?.id) return;

        // 使用新的API方法根据提示词ID获取调试记录
        debugHistory.value = await api.aiGenerationHistory.getDebugHistoryByPromptId.query(props.prompt.id);

    } catch (error) {
        console.error("加载调试历史失败:", error);
        debugHistory.value = [];
    }
};

// 选择调试记录
const selectDebugRecord = (index: number) => {
    selectedDebugIndex.value = index;
    // 同时取消选择使用记录
    selectedHistoryIndex.value = -1;
};

// 删除调试记录
const deleteDebugRecord = async () => {
    if (selectedDebugIndex.value >= 0) {
        try {
            const record = debugHistory.value[selectedDebugIndex.value];
            if (record.id) {
                await api.aiGenerationHistory.delete.mutate(record.id);

                // 从本地列表中移除
                debugHistory.value.splice(selectedDebugIndex.value, 1);

                // 重置选择
                selectedDebugIndex.value = -1;

                // 如果当前页面没有记录了，回到第一页
                if (paginatedDebugHistory.value.length === 0 && debugCurrentPage.value > 1) {
                    debugCurrentPage.value = 1;
                }

                message.success("调试记录已删除");
            }
        } catch (error) {
            console.error("删除调试记录失败:", error);
            message.error("删除调试记录失败");
        }
    }
};

// 调试提示词功能（支持流式传输）
const debugPrompt = async () => {
    if (!canDebug.value) {
        message.warning("请先完成变量填写");
        return;
    }

    const selectedConfig = modelSelectorRef.value?.selectedConfig;
    const selectedModel = modelSelectorRef.value?.selectedModel;

    if (!selectedConfig) {
        message.warning("没有可用的AI配置，请先在AI配置页面添加配置");
        return;
    }

    if (!selectedModel) {
        message.error("请选择一个模型");
        return;
    }

    debugging.value = true;
    debugStreaming.value = true;
    debugResult.value = "";
    debugError.value = "";

    // 重置流式传输状态
    Object.assign(debugStreamStats.value, {
        charCount: 0,
        isStreaming: true,
        lastCharCount: 0,
        noContentUpdateCount: 0,
        lastUpdateTime: Date.now(),
        isGenerationActive: true,
        contentGrowthRate: 0
    });

    // 重置生成控制状态
    debugGenerationControl.value.shouldStop = false;
    debugGenerationControl.value.abortController = new AbortController();

    try {
        console.log("开始调试提示词:", filledContent.value);

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

        // 构建请求参数 - 直接使用用户的Prompt进行测试
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(`请直接回应以下提示词：\n\n${filledContent.value}`),
            customPrompt: String(filledContent.value), // 直接使用用户的Prompt
            model: String(selectedModel)
        };

        console.log("开始调试提示词:", filledContent.value);
        console.log("选中的配置:", selectedConfig);
        console.log("请求参数:", request);
        console.log("配置参数:", serializedConfig);

        let result;

        // 检查是否支持流式传输
        if ((window as any).electronAPI?.ai?.generatePromptStream) {
            console.log('使用流式传输模式进行调试');

            // 使用流式传输
            result = await (window as any).electronAPI.ai.generatePromptStream(
                request,
                serializedConfig,
                (charCount: number, partialContent?: string) => {
                    // 检查是否应该停止
                    if (debugGenerationControl.value.shouldStop) {
                        console.log('检测到停止信号，中断调试流式传输');
                        return false; // 返回 false 表示停止流式传输
                    }

                    const now = Date.now();
                    console.log('调试流式传输回调:', {
                        charCount,
                        hasContent: !!partialContent,
                        contentLength: partialContent?.length || 0,
                        contentPreview: partialContent?.substring(0, 50) || 'null',
                        timeSinceLastUpdate: now - debugStreamStats.value.lastUpdateTime
                    });

                    // 更新时间统计
                    const prevCharCount = debugStreamStats.value.charCount;
                    const prevUpdateTime = debugStreamStats.value.lastUpdateTime;
                    debugStreamStats.value.charCount = charCount;
                    debugStreamStats.value.lastUpdateTime = now;

                    // 计算内容增长速率
                    if (prevUpdateTime > 0 && charCount > prevCharCount) {
                        const timeDiff = (now - prevUpdateTime) / 1000;
                        const charDiff = charCount - prevCharCount;
                        debugStreamStats.value.contentGrowthRate = timeDiff > 0 ? charDiff / timeDiff : 0;
                    }

                    // 检测是否有真实内容
                    const hasRealContent = typeof partialContent === 'string' && partialContent.length > 0;

                    // 判断生成是否活跃
                    debugStreamStats.value.isGenerationActive = hasRealContent ||
                        (charCount > prevCharCount && (now - prevUpdateTime) < 2000);

                    if (hasRealContent) {
                        // 有真实内容时直接更新调试结果
                        debugResult.value = partialContent;
                        debugStreamStats.value.noContentUpdateCount = 0;
                        console.log('✅ 调试内容已更新，当前长度:', partialContent.length);
                    } else {
                        // 没有内容时的处理
                        debugStreamStats.value.noContentUpdateCount++;

                        if (charCount > prevCharCount) {
                            // 字符数在增长，说明正在生成
                            const placeholderText = `正在调试中... (已生成 ${charCount} 字符)`;
                            if (debugStreamStats.value.noContentUpdateCount > 3 && !debugResult.value) {
                                debugResult.value = placeholderText;
                                console.log('📝 显示调试占位符:', placeholderText);
                            }
                        }
                    }

                    return true; // 继续生成
                }
            );

            console.log('调试流式传输完成，最终结果:', {
                success: !!result,
                contentLength: result?.generatedPrompt?.length || 0
            });

            // 如果流式传输过程中没有获得内容，但最终结果有内容，则立即显示
            if (result && result.generatedPrompt &&
                (!debugResult.value || debugResult.value.startsWith('正在调试中...'))) {
                console.log('🔧 调试流式传输未提供内容，使用最终结果');
                debugResult.value = result.generatedPrompt;
            }
        } else {
            console.log('使用普通生成模式进行调试');
            // 使用普通生成
            result = await (window as any).electronAPI.ai.generatePrompt(request, serializedConfig);

            // 模拟流式更新
            if (result?.generatedPrompt) {
                const content = result.generatedPrompt;
                const totalChars = content.length;
                const steps = Math.min(30, totalChars);
                const stepSize = Math.ceil(totalChars / steps);

                for (let i = 0; i < steps; i++) {
                    if (debugGenerationControl.value.shouldStop) break;

                    const currentCharCount = Math.min((i + 1) * stepSize, totalChars);
                    const partialContent = content.substring(0, currentCharCount);

                    debugStreamStats.value.charCount = currentCharCount;
                    debugResult.value = partialContent;

                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // 确保显示完整内容
                debugResult.value = content;
            }
        }

        // 确保最终结果正确显示
        if (result?.generatedPrompt) {
            debugResult.value = result.generatedPrompt;
        }

        message.success("调试完成");

        // 保存调试结果到AI生成历史记录
        await api.aiGenerationHistory.create.mutate({
            historyId: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            configId: selectedConfig.configId,
            topic: `提示词调试: ${props.prompt?.title || '未命名提示词'}`,
            generatedPrompt: filledContent.value, // 原始提示词内容
            model: request.model,
            status: 'success',
            debugResult: result.generatedPrompt, // AI的响应结果
            debugStatus: 'success',
            customPrompt: `调试提示词内容：\n${filledContent.value}`,
            uuid: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // 添加uuid字段
        });

        // 刷新调试历史记录
        await loadDebugHistory();

    } catch (error: any) {
        console.error("调试失败:", error);
        debugError.value = error.message || "调试失败";
        message.error("调试失败: " + (error.message || "未知错误"));

        // 保存失败记录
        try {
            const selectedConfig = modelSelectorRef.value?.selectedConfig;
            if (selectedConfig) {
                await api.aiGenerationHistory.create.mutate({
                    historyId: `debug_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    configId: selectedConfig.configId,
                    topic: `提示词调试失败: ${props.prompt?.title || '未命名提示词'}`,
                    generatedPrompt: filledContent.value,
                    model: selectedModel,
                    status: 'error',
                    errorMessage: error.message || "调试失败",
                    debugStatus: 'error',
                    debugErrorMessage: error.message || "调试失败",
                    uuid: `debug_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // 添加uuid字段
                });

                // 刷新调试历史记录
                await loadDebugHistory();
            }
        } catch (saveError: any) {
            console.error("保存调试失败记录时出错:", saveError);
        }
    } finally {
        debugging.value = false;
        debugStreaming.value = false;

        // 清理生成控制状态
        debugGenerationControl.value.shouldStop = false;
        if (debugGenerationControl.value.abortController) {
            debugGenerationControl.value.abortController = null;
        }

        // 清理流式传输状态
        debugStreamStats.value.isStreaming = false;
        debugStreamStats.value.charCount = 0;
        debugStreamStats.value.lastCharCount = 0;
        debugStreamStats.value.noContentUpdateCount = 0;
        debugStreamStats.value.lastUpdateTime = 0;
        debugStreamStats.value.isGenerationActive = false;
        debugStreamStats.value.contentGrowthRate = 0;
    }
};

// 中断调试
const stopDebug = () => {
    debugGenerationControl.value.shouldStop = true;
    if (debugGenerationControl.value.abortController) {
        debugGenerationControl.value.abortController.abort();
    }
    message.info("正在停止调试...");
};

// 使用 Prompt
const usePrompt = async () => {
    try {
        // 保存使用记录到本地存储
        const record = {
            date: formatDate(new Date()),
            content: filledContent.value,
            variables: { ...variableValues.value },
        };

        useHistory.value.unshift(record);
        if (useHistory.value.length > 50) {
            useHistory.value = useHistory.value.slice(0, 50);
        }

        // 保存到本地存储
        localStorage.setItem(
            `prompt_history_${props.prompt.id}`,
            JSON.stringify(useHistory.value)
        );

        // 增加使用计数
        await api.prompts.incrementUseCount.mutate(props.prompt.id);

        // 立即更新当前 prompt 对象的使用计数
        if (props.prompt) {
            props.prompt.useCount = (props.prompt.useCount || 0) + 1;
        }

        // 直接复制到剪贴板，不显示单独的复制消息
        await navigator.clipboard.writeText(filledContent.value);

        message.success("提示词已复制到剪贴板，使用计数已更新");
        emit("use");
        emit("updated"); // 通知父组件重新加载数据以更新使用计数
    } catch (error) {
        message.error("操作失败");
        console.error(error);
    }
};

// 切换收藏状态
const toggleFavorite = async () => {
    try {
        await api.prompts.toggleFavorite.mutate(props.prompt.id);

        // 立即更新当前 prompt 对象的收藏状态
        if (props.prompt) {
            props.prompt.isFavorite = !props.prompt.isFavorite;
        }

        message.success("收藏状态已更新");
        emit("updated"); // 通知父组件重新加载数据
    } catch (error) {
        message.error("更新收藏状态失败");
        console.error(error);
    }
};

// 切换快捷键触发状态
const toggleShortcutTrigger = async () => {
    try {
        await api.prompts.toggleShortcutTrigger.mutate(props.prompt.id);

        // 立即更新当前 prompt 对象的快捷键触发状态
        if (props.prompt) {
            props.prompt.isShortcutTrigger = !props.prompt.isShortcutTrigger;
        }

        // 刷新快捷键注册
        await window.electronAPI.shortcuts.refresh();

        message.success("快捷键触发状态已更新");
        emit("updated"); // 通知父组件重新加载数据
    } catch (error) {
        message.error("更新快捷键触发状态失败");
        console.error(error);
    }
};

// 加载历史记录
const loadHistoryRecord = (record: any) => {
    variableValues.value = { ...record.variables };
    activeTab.value = "detail"; // 切换到详情页面
    message.success("已加载历史记录");
};

// 选择历史记录
const selectHistoryRecord = (index: number) => {
    selectedHistoryIndex.value = index;
    // 取消选择调试记录
    selectedDebugIndex.value = -1;
};

// 删除历史记录
const deleteHistoryRecord = async () => {
    if (selectedHistoryIndex.value >= 0) {
        try {
            // 删除历史记录
            useHistory.value.splice(selectedHistoryIndex.value, 1);

            // 更新本地存储
            localStorage.setItem(
                `prompt_history_${props.prompt.id}`,
                JSON.stringify(useHistory.value)
            );

            // 减少数据库中的使用计数
            await api.prompts.decrementUseCount.mutate(props.prompt.id);

            // 重置选择
            selectedHistoryIndex.value = -1;

            // 如果当前页面没有记录了，回到第一页
            if (paginatedHistory.value.length === 0 && currentPage.value > 1) {
                currentPage.value = 1;
            }

            // 发出更新事件，通知父组件刷新数据
            emit("updated");

            message.success("历史记录已删除");
        } catch (error) {
            console.error("删除历史记录失败:", error);
            message.error("删除历史记录失败");
        }
    }
};

// 格式化日期
const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString("zh-CN");
};

// 关闭弹窗
const handleClose = () => {
    emit("update:show", false);
};

// 监听 prompt 变化
watch(
    () => props.prompt,
    (newPrompt) => {

        if (newPrompt) {
            initializeVariables();

            // 加载使用历史
            const history = localStorage.getItem(`prompt_history_${newPrompt.id}`);
            if (history) {
                try {
                    useHistory.value = JSON.parse(history);
                } catch {
                    useHistory.value = [];
                }
            } else {
                useHistory.value = [];
            }

            // 加载调试历史
            loadDebugHistory();
        }
    },
    { immediate: true }
);



// 监听显示状态
watch(
    () => props.show,
    (show) => {
        if (!show) {
            // 关闭弹窗时重置状态
            activeTab.value = "detail";
            selectedHistoryIndex.value = -1;
            selectedDebugIndex.value = -1;
            currentPage.value = 1;
            debugCurrentPage.value = 1;
            // 重置调试状态
            debugging.value = false;
            debugResult.value = "";
            debugError.value = "";
            // 重置手动记录状态
            showManualRecordModal.value = false;
            savingManualRecord.value = false;
            manualRecordData.value = {
                title: "",
                result: "",
                notes: "",
                status: "success"
            };
        }
    }
);

// 手动记录调试历史
const saveManualRecord = async () => {
    try {
        // 手动验证表单数据
        if (!manualRecordData.value.title.trim()) {
            message.error("请输入记录标题");
            return;
        }
        if (!manualRecordData.value.result.trim()) {
            message.error("请输入调试结果");
            return;
        }
        if (!manualRecordData.value.status) {
            message.error("请选择调试状态");
            return;
        }

        savingManualRecord.value = true;

        // 构建符合AIGenerationHistory接口的数据
        const manualHistoryId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const historyData = {
            historyId: manualHistoryId,
            configId: 'manual', // 手动记录使用特殊的configId
            topic: `手动调试记录: ${manualRecordData.value.title}`,
            generatedPrompt: filledContent.value, // 当前填充后的提示词内容
            model: 'manual', // 手动记录使用特殊的model标识
            customPrompt: manualRecordData.value.notes || `手动调试记录：${manualRecordData.value.title}`,
            status: manualRecordData.value.status,
            debugResult: manualRecordData.value.result,
            debugStatus: manualRecordData.value.status,
            debugErrorMessage: manualRecordData.value.status === 'error' ? manualRecordData.value.notes : undefined,
            uuid: manualHistoryId // 使用相同的ID作为uuid
        };

        // 保存到数据库
        await api.aiGenerationHistory.create.mutate(historyData);

        // 刷新调试历史记录
        await loadDebugHistory();

        // 重置表单数据
        manualRecordData.value = {
            title: "",
            result: "",
            notes: "",
            status: "success"
        };

        showManualRecordModal.value = false;
        message.success("手动调试记录已保存");

    } catch (error: any) {
        console.error("保存手动调试记录失败:", error);
        message.error("保存调试记录失败: " + (error.message || "未知错误"));
    } finally {
        savingManualRecord.value = false;
    }
};

// 编辑提示词
const handleEdit = () => {
    if (!props.prompt) {
        message.error("提示词数据不存在");
        return;
    }

    // 确保传递完整的prompt数据，包括所有必要字段
    const editPrompt = {
        id: props.prompt.id,
        uuid: props.prompt.uuid,
        title: props.prompt.title,
        description: props.prompt.description,
        content: props.prompt.content,
        categoryId: props.prompt.categoryId,
        category: props.prompt.category,
        tags: props.prompt.tags,
        variables: props.prompt.variables || [],
        isActive: props.prompt.isActive,
        isFavorite: props.prompt.isFavorite,
        useCount: props.prompt.useCount,
        isJinjaTemplate: props.prompt.isJinjaTemplate || false,
        createdAt: props.prompt.createdAt,
        updatedAt: props.prompt.updatedAt
    };

    emit("edit", editPrompt);
};
</script>

<style scoped>
/* Header 区域描述文本截断 - 最多显示 2 行 */
.header-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
    max-height: calc(1.4em * 2);
    word-break: break-word;
}

/* 历史记录内容预览截断 - 最多显示 3 行 */
.history-content-preview {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
    max-height: calc(1.4em * 3);
    word-break: break-word;
}
</style>
