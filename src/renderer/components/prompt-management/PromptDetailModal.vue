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
                    <NText 
                        depth="3" 
                        v-if="prompt.description" 
                        class="header-description"
                    >{{
                        prompt.description || "暂无描述"
                        }}</NText>
                </NFlex>
            </div>
        </template>
        
        <!-- Header 额外区域 - 操作按钮 -->
        <template #header-extra>
            <NFlex size="small">
                <NButton @click="toggleFavorite" :type="prompt.isFavorite ? 'error' : 'default'">
                    <template #icon>
                        <NIcon>
                            <Heart />
                        </NIcon>
                    </template>
                    {{ prompt.isFavorite ? "取消收藏" : "收藏" }}
                </NButton>
                <NButton type="primary" @click="$emit('edit', prompt)">
                    <template #icon>
                        <NIcon>
                            <Edit />
                        </NIcon>
                    </template>
                    编辑
                </NButton>
            </NFlex>
        </template>        <!-- 中间可操作区域 -->
        <template #content="{ contentHeight }">
            <!-- Tabs 切换 -->
            <NTabs v-model:value="activeTab" type="segment" :style="{ height: `${contentHeight}px` }">
                <!-- 详情 Tab -->
                <NTabPane name="detail" tab="详情">
                    <NSplit direction="horizontal" :min="0.3" :max="0.8" :default-size="0.6" 
                        :style="{ height: `${contentHeight - 50}px` }">
                        <!-- 左侧：提示词内容 -->
                        <template #1>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>提示词内容</NText>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 130}px` }" ref="contentScrollbarRef">
                                    <NFlex vertical size="medium" style="padding-right: 12px">
                                        <NInput :value="filledContent" type="textarea" readonly :style="{
                                            height: `${contentHeight - 180}px`,
                                            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                        }" :placeholder="!filledContent ? '内容为空' : ''" />

                                        <!-- 如果有未填写的变量，显示提示 -->
                                        <NFlex v-if="hasUnfilledVariables" align="center">
                                            <NIcon color="#fa8c16">
                                                <Wand />
                                            </NIcon>
                                            <NText>检测到未填写的变量，请在右侧填写以生成完整的提示词</NText>
                                        </NFlex>

                                        <!-- 调试区域 -->
                                        <NAlert v-if="canDebug && aiConfigs.length > 0" type="info" :show-icon="false" style="margin-top: 16px;">
                                            <template #header>
                                                <NFlex align="center" size="small">
                                                    <NIcon>
                                                        <Bug />
                                                    </NIcon>
                                                    <NText strong>调试提示词</NText>
                                                </NFlex>
                                            </template>
                                            
                                            <!-- AI配置和模型选择 -->
                                            <NFlex vertical size="medium" style="margin-top: 12px;">
                                                <NFlex size="medium" align="end">
                                                    <NFormItem label="AI配置" size="small" style="margin-bottom: 0; flex: 1;">
                                                        <NSelect
                                                            v-model:value="selectedConfigId"
                                                            :options="aiConfigs.map(config => ({
                                                                label: `${config.name} (${config.type})`,
                                                                value: config.configId
                                                            }))"
                                                            placeholder="选择AI配置"
                                                            size="small"
                                                        />
                                                    </NFormItem>
                                                    
                                                    <NFormItem v-if="selectedConfig" label="模型" size="small" style="margin-bottom: 0; flex: 1;">
                                                        <NSelect
                                                            v-model:value="selectedModel"
                                                            :options="getModelOptions(selectedConfig)"
                                                            placeholder="选择模型"
                                                            size="small"
                                                        />
                                                    </NFormItem>
                                                </NFlex>
                                                
                                                <!-- 调试按钮 -->
                                                <NFlex justify="center">
                                                    <NButton 
                                                        type="primary" 
                                                        :loading="debugging"
                                                        :disabled="!canDebug || debugging"
                                                        @click="debugPrompt"
                                                        size="small"
                                                    >
                                                        <template #icon>
                                                            <NIcon>
                                                                <Robot />
                                                            </NIcon>
                                                        </template>
                                                        {{ debugging ? '调试中...' : '开始调试' }}
                                                    </NButton>
                                                </NFlex>
                                            </NFlex>
                                        </NAlert>

                                        <!-- 调试结果显示 -->
                                        <div v-if="debugResult || debugError">
                                            <NText strong style="margin-bottom: 8px; display: block;">调试结果:</NText>
                                            
                                            <!-- 成功结果 -->
                                            <NAlert v-if="debugResult" type="success" :show-icon="false">
                                                <template #header>
                                                    <NFlex align="center" size="small">
                                                        <NIcon>
                                                            <CircleCheck />
                                                        </NIcon>
                                                        <NText>AI 响应</NText>
                                                    </NFlex>
                                                </template>
                                                <NInput
                                                    v-model:value="debugResult"
                                                    type="textarea"
                                                    readonly
                                                    :rows="4"
                                                    :style="{ 
                                                        fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        backgroundColor: 'var(--success-color-suppl)',
                                                        marginTop: '8px'
                                                    }"
                                                />
                                                <template #action>
                                                    <NButton size="small" @click="copyToClipboard(debugResult)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Copy />
                                                            </NIcon>
                                                        </template>
                                                        复制结果
                                                    </NButton>
                                                </template>
                                            </NAlert>

                                            <!-- 错误结果 -->
                                            <NAlert v-if="debugError" type="error" :show-icon="false">
                                                <template #header>
                                                    <NFlex align="center" size="small">
                                                        <NIcon>
                                                            <AlertTriangle />
                                                        </NIcon>
                                                        <NText>调试失败</NText>
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
                                        <NText strong>变量设置</NText>
                                        <NButton v-if="prompt.variables && prompt.variables.length > 0" size="small"
                                            @click="clearVariables">清空</NButton>
                                    </NFlex>
                                </template>
                                <NScrollbar :style="{ height: `${contentHeight - 140}px` }">
                                    <NFlex vertical size="medium" style="padding-right: 12px"
                                        v-if="prompt.variables && prompt.variables.length > 0">
                                        <NFormItem v-for="variable in prompt.variables" :key="variable.id"
                                            :label="variable.label" :required="variable.required">
                                            <NInput v-if="variable.type === 'text'"
                                                v-model:value="variableValues[variable.name]" type="textarea" :placeholder="variable.placeholder || `请输入${variable.label}`
                                                    " :rows="1" :autosize="{ minRows: 1, maxRows: 5 }" />
                                            <NSelect v-else-if="variable.type === 'select'"
                                                v-model:value="variableValues[variable.name]"
                                                :options="getSelectOptions(variable.options)" :placeholder="variable.placeholder || `请选择${variable.label}`
                                                    " />
                                        </NFormItem>
                                    </NFlex>
                                    <NEmpty v-else description="此提示词没有可配置的变量">
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

                <!-- 历史记录 Tab - 重新设计 -->
                <NTabPane name="history" :tab="`历史记录 (${useHistory.length + debugHistory.length})`" :disabled="useHistory.length === 0 && debugHistory.length === 0">
                    <NSplit direction="vertical" :min="0.3" :max="0.7" :default-size="0.5" 
                        :style="{ height: `${contentHeight - 50}px` }">
                        <!-- 上半部分：使用记录 -->
                        <template #1>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>变量历史记录</NText>
                                        <NFlex align="center" size="small">
                                            <NTag size="small" type="info">{{ useHistory.length }} 条</NTag>
                                            <NText depth="3">使用记录</NText>
                                        </NFlex>
                                    </NFlex>
                                </template>

                                <NSplit v-if="useHistory.length > 0" direction="horizontal" :min="0.3" :max="0.8" :default-size="0.6" 
                                    :style="{ height: `${(contentHeight - 50) * 0.5 - 60}px` }">
                                    <!-- 左侧：使用记录预览 -->
                                    <template #1>
                                        <div :style="{ height: '100%', overflow: 'hidden' }">
                                            <NScrollbar :style="{ height: '100%' }" v-if="selectedHistory">
                                                <NFlex vertical size="medium" style="padding-right: 12px;">
                                                    <NFlex align="center" size="small">
                                                        <NTag type="info" size="small">使用记录</NTag>
                                                        <NText depth="3">{{ selectedHistory.date }}</NText>
                                                    </NFlex>
                                                    
                                                    <!-- 变量信息 -->
                                                    <div v-if="selectedHistory.variables && Object.keys(selectedHistory.variables).length > 0">
                                                        <NText strong style="margin-bottom: 8px; display: block;">包含变量：</NText>
                                                        <NFlex vertical size="small">
                                                            <NFlex v-for="(value, key) in selectedHistory.variables" :key="key" align="center" size="small">
                                                                <NTag size="small" type="primary" :bordered="false">{{ key }}</NTag>
                                                                <NInput :value="value" readonly size="small" />
                                                            </NFlex>
                                                        </NFlex>
                                                    </div>

                                                    <!-- 完整内容 -->
                                                    <div>
                                                        <NText strong style="margin-bottom: 8px; display: block;">完整内容：</NText>
                                                        <NInput :value="selectedHistory.content" type="textarea" readonly :rows="8" :style="{
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
                                                                    删除
                                                                </NButton>
                                                            </template>
                                                            确定要删除这条历史记录吗？删除后将无法恢复。
                                                        </NPopconfirm>
                                                        <NButton type="primary" size="small" @click="copyToClipboard(selectedHistory.content)">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Copy />
                                                                </NIcon>
                                                            </template>
                                                            复制记录
                                                        </NButton>
                                                    </NFlex>
                                                </NFlex>
                                            </NScrollbar>
                                            <NEmpty v-else description="请选择一条使用记录查看详情">
                                                <template #icon>
                                                    <NIcon>
                                                        <History />
                                                    </NIcon>
                                                </template>
                                            </NEmpty>
                                        </div>
                                    </template>

                                    <!-- 右侧：使用记录列表 -->
                                    <template #2>
                                        <div :style="{ height: '100%', overflow: 'hidden' }">
                                            <NFlex vertical :style="{ height: '100%' }">
                                                <!-- 分页控件 -->
                                                <NFlex justify="center" style="margin-bottom: 8px;">
                                                    <NPagination v-model:page="currentPage" :page-count="totalPages" :page-size="pageSize"
                                                        size="small" show-quick-jumper show-size-picker :page-sizes="[1, 3, 5, 10]"
                                                        :page-slot="5" @update:page-size="handlePageSizeChange" />
                                                </NFlex>

                                                <!-- 记录列表 -->
                                                <NScrollbar :style="{ flex: 1 }">
                                                    <NFlex vertical size="small" style="padding-right: 12px">
                                                        <NCard v-for="(record, index) in paginatedHistory"
                                                            :key="(currentPage - 1) * pageSize + index" size="small" hoverable
                                                            :style="{ cursor: 'pointer' }"
                                                            @click="selectHistoryRecord((currentPage - 1) * pageSize + index)"
                                                            :class="{ 'selected-record': selectedHistoryIndex === (currentPage - 1) * pageSize + index }">
                                                            <template #header>
                                                                <NFlex justify="space-between" align="center">
                                                                    <NText depth="3" style="font-size: 12px;">{{ record.date }}</NText>
                                                                    <NButton size="tiny" text type="primary" @click.stop="loadHistoryRecord(record)">
                                                                        重新加载
                                                                    </NButton>
                                                                </NFlex>
                                                            </template>

                                                            <NFlex vertical size="small">
                                                                <NText class="history-content-preview" style="font-size: 12px;">
                                                                    {{ record.content.substring(0, 60) }}{{ record.content.length > 60 ? "..." : "" }}
                                                                </NText>

                                                                <NFlex v-if="record.variables && Object.keys(record.variables).length > 0" size="small">
                                                                    <NText depth="3" style="font-size: 11px;">变量：</NText>
                                                                    <NTag v-for="key in Object.keys(record.variables).slice(0, 2)" :key="key"
                                                                        size="tiny" type="primary" :bordered="false">
                                                                        {{ key }}
                                                                    </NTag>
                                                                    <NText v-if="Object.keys(record.variables).length > 2" depth="3" style="font-size: 11px;">
                                                                        +{{ Object.keys(record.variables).length - 2 }}...
                                                                    </NText>
                                                                </NFlex>
                                                            </NFlex>
                                                        </NCard>
                                                    </NFlex>
                                                </NScrollbar>
                                            </NFlex>
                                        </div>
                                    </template>
                                </NSplit>
                                <NEmpty v-else description="暂无使用记录">
                                    <template #icon>
                                        <NIcon>
                                            <History />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NCard>
                        </template>

                        <!-- 下半部分：调试记录 -->
                        <template #2>
                            <NCard size="small" :style="{ height: '100%' }">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText strong>调试历史记录</NText>
                                        <NFlex align="center" size="small">
                                            <NTag size="small" type="success">{{ debugHistory.length }} 条</NTag>
                                            <NText depth="3">调试记录</NText>
                                        </NFlex>
                                    </NFlex>
                                </template>

                                <NSplit v-if="debugHistory.length > 0" direction="horizontal" :min="0.3" :max="0.8" :default-size="0.6" 
                                    :style="{ height: `${(contentHeight - 50) * 0.5 - 60}px` }">
                                    <!-- 左侧：调试记录预览 -->
                                    <template #1>
                                        <div :style="{ height: '100%', overflow: 'hidden' }">
                                            <NScrollbar :style="{ height: '100%' }" v-if="selectedDebugHistory">
                                                <NFlex vertical size="medium" style="padding-right: 12px;">
                                                    <NFlex align="center" size="small">
                                                        <NTag :type="selectedDebugHistory.debugStatus === 'success' ? 'success' : 'error'" size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Robot />
                                                                </NIcon>
                                                            </template>
                                                            调试记录
                                                        </NTag>
                                                        <NText depth="3">{{ formatDate(selectedDebugHistory.createdAt) }}</NText>
                                                    </NFlex>
                                                    
                                                    <!-- 调试配置信息 -->
                                                    <div>
                                                        <NText strong style="margin-bottom: 8px; display: block;">调试配置：</NText>
                                                        <NFlex size="small">
                                                            <NTag size="small" type="primary" :bordered="false">{{ selectedDebugHistory.model }}</NTag>
                                                            <NTag size="small" type="default" :bordered="false">{{ selectedDebugHistory.configId }}</NTag>
                                                        </NFlex>
                                                    </div>

                                                    <!-- 原始提示词 -->
                                                    <div>
                                                        <NText strong style="margin-bottom: 8px; display: block;">原始提示词：</NText>
                                                        <NInput :value="selectedDebugHistory.generatedPrompt" type="textarea" readonly :rows="4" :style="{
                                                            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        }" />
                                                    </div>

                                                    <!-- AI响应结果 -->
                                                    <div v-if="selectedDebugHistory.debugResult">
                                                        <NText strong style="margin-bottom: 8px; display: block;">AI 响应：</NText>
                                                        <NInput :value="selectedDebugHistory.debugResult" type="textarea" readonly :rows="6" :style="{
                                                            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                                                        }" />
                                                    </div>

                                                    <!-- 错误信息 -->
                                                    <div v-if="selectedDebugHistory.debugStatus === 'error' && selectedDebugHistory.debugErrorMessage">
                                                        <NText strong style="margin-bottom: 8px; display: block;">错误信息：</NText>
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
                                                                    删除
                                                                </NButton>
                                                            </template>
                                                            确定要删除这条调试记录吗？删除后将无法恢复。
                                                        </NPopconfirm>
                                                        <NFlex size="small">
                                                            <NButton v-if="selectedDebugHistory.debugResult" size="small" @click="copyToClipboard(selectedDebugHistory.debugResult)">
                                                                <template #icon>
                                                                    <NIcon>
                                                                        <Copy />
                                                                    </NIcon>
                                                                </template>
                                                                复制AI响应
                                                            </NButton>
                                                            <NButton size="small" @click="copyToClipboard(selectedDebugHistory.generatedPrompt)">
                                                                <template #icon>
                                                                    <NIcon>
                                                                        <Copy />
                                                                    </NIcon>
                                                                </template>
                                                                复制提示词
                                                            </NButton>
                                                        </NFlex>
                                                    </NFlex>
                                                </NFlex>
                                            </NScrollbar>
                                            <NEmpty v-else description="请选择一条调试记录查看详情">
                                                <template #icon>
                                                    <NIcon>
                                                        <Robot />
                                                    </NIcon>
                                                </template>
                                            </NEmpty>
                                        </div>
                                    </template>

                                    <!-- 右侧：调试记录列表 -->
                                    <template #2>
                                        <div :style="{ height: '100%', overflow: 'hidden' }">
                                            <NFlex vertical :style="{ height: '100%' }">
                                                <!-- 分页控件 -->
                                                <NFlex justify="center" style="margin-bottom: 8px;">
                                                    <NPagination v-model:page="debugCurrentPage" :page-count="debugTotalPages" :page-size="debugPageSize"
                                                        size="small" show-quick-jumper show-size-picker :page-sizes="[1, 3, 5, 10]"
                                                        :page-slot="5" @update:page-size="(newSize) => { debugPageSize = newSize; debugCurrentPage = 1; selectedDebugIndex = -1; }" />
                                                </NFlex>

                                                <!-- 记录列表 -->
                                                <NScrollbar :style="{ flex: 1 }">
                                                    <NFlex vertical size="small" style="padding-right: 12px">
                                                        <NCard v-for="(record, index) in paginatedDebugHistory"
                                                            :key="(debugCurrentPage - 1) * debugPageSize + index" size="small" hoverable
                                                            :style="{ cursor: 'pointer' }"
                                                            @click="selectDebugRecord((debugCurrentPage - 1) * debugPageSize + index)"
                                                            :class="{ 'selected-record': selectedDebugIndex === (debugCurrentPage - 1) * debugPageSize + index }">
                                                            <template #header>
                                                                <NFlex justify="space-between" align="center">
                                                                    <NText depth="3" style="font-size: 12px;">{{ formatDate(record.createdAt) }}</NText>
                                                                    <NTag :type="record.debugStatus === 'success' ? 'success' : 'error'" size="tiny">
                                                                        {{ record.debugStatus === 'success' ? '成功' : '失败' }}
                                                                    </NTag>
                                                                </NFlex>
                                                            </template>

                                                            <NFlex vertical size="small">
                                                                <NText style="font-size: 12px;">{{ record.topic }}</NText>
                                                                <NFlex size="small">
                                                                    <NTag size="tiny" type="primary" :bordered="false">{{ record.model }}</NTag>
                                                                    <NTag size="tiny" type="default" :bordered="false">{{ record.configId }}</NTag>
                                                                </NFlex>
                                                            </NFlex>
                                                        </NCard>
                                                    </NFlex>
                                                </NScrollbar>
                                            </NFlex>
                                        </div>
                                    </template>
                                </NSplit>
                                <NEmpty v-else description="暂无调试记录">
                                    <template #icon>
                                        <NIcon>
                                            <Robot />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NCard>
                        </template>
                    </NSplit>
                </NTabPane>

            </NTabs>
        </template>        <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="space-between" align="center">
                <div>
                    <!-- 左侧区域 - 时间和标签信息 -->
                    <NFlex size="small" align="center" wrap>
                        <NText depth="3" style="margin-right: 8px">{{
                            formatDate(prompt.updatedAt)
                            }}</NText>
                        <NTag v-if="prompt.variables?.length > 0" size="small" type="info">
                            {{ prompt.variables.length }} 个变量
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
                        <NButton @click="copyToClipboard(filledContent)">
                            <template #icon>
                                <NIcon>
                                    <Copy />
                                </NIcon>
                            </template>
                            复制内容
                        </NButton>
                        <NButton type="primary" @click="usePrompt">
                            <template #icon>
                                <NIcon>
                                    <Check />
                                </NIcon>
                            </template>
                            使用此提示词
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
} from "@vicons/tabler";
import { api } from "@/lib/api";
import { useTagColors } from "@/composables/useTagColors";
import CommonModal from "@/components/common/CommonModal.vue";

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

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors();

// 响应式数据
const variableValues = ref({});
const useHistory = ref([]);
const debugHistory = ref([]); // 调试历史记录
const activeTab = ref("detail"); // 默认显示详情页面
const selectedHistoryIndex = ref(-1);
const selectedDebugIndex = ref(-1); // 选中的调试记录索引

// 调试相关状态
const debugging = ref(false);
const debugResult = ref("");
const debugError = ref("");

// AI 配置相关
const aiConfigs = ref([]);
const selectedConfigId = ref("");

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
const handlePageSizeChange = (newPageSize) => {
    pageSize.value = newPageSize;
    currentPage.value = 1;
    selectedHistoryIndex.value = -1;
};

// 初始化变量值
const initializeVariables = () => {
    if (!props.prompt?.variables) {
        variableValues.value = {};
        return;
    }

    const values = {};
    props.prompt.variables.forEach((variable) => {
        // 确保每个变量都有初始值，即使是空字符串
        values[variable.name] = variable.defaultValue || "";
    });
    variableValues.value = values;

    console.log("初始化变量:", values); // 调试用
    console.log("Prompt 内容:", props.prompt.content); // 调试用
};

// 获取选择框选项
const getSelectOptions = (options) => {
    if (!options) return [];
    // 如果是数组，直接使用；如果是字符串，按逗号分割
    const optionsArray = Array.isArray(options)
        ? options
        : options
            .split(",")
            .map((opt) => opt.trim())
            .filter((opt) => opt);
    return optionsArray.map((option) => ({
        label: option,
        value: option,
    }));
};

// 生成填充后的 Prompt - 改为计算属性，自动生成
const filledContent = computed(() => {
    if (!props.prompt?.content) return "";

    let content = props.prompt.content;

    // 如果没有变量，直接返回原始内容
    if (!props.prompt.variables || props.prompt.variables.length === 0) {
        return content;
    }

    // 替换变量
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

    console.log("计算填充内容:", {
        original: props.prompt.content,
        variables: variableValues.value,
        result: content,
    }); // 调试用

    return content;
});

// 是否有变量
const hasVariables = computed(() => {
    return props.prompt?.variables && props.prompt.variables.length > 0;
});

// 是否有未填写的变量
const hasUnfilledVariables = computed(() => {
    if (!hasVariables.value) return false;

    // 检查是否还有未替换的变量占位符
    const content = filledContent.value;
    const hasPlaceholders = /\{\{[^}]+\}\}/.test(content);

    return hasPlaceholders;
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

// 清空变量
const clearVariables = () => {
    initializeVariables();
};

// 复制到剪贴板
const copyToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        message.success("已复制到剪贴板");
    } catch (error) {
        message.error("复制失败");
    }
};

// 加载AI配置列表
const loadAIConfigs = async () => {
    try {
        // 使用数据库API获取AI配置
        const allConfigs = await api.aiConfigs.getAll.query();
        aiConfigs.value = allConfigs.filter(config => config.enabled);
        
        // 设置默认选择的配置（优先选择首选配置）
        const preferredConfig = aiConfigs.value.find(config => config.isPreferred);
        if (preferredConfig) {
            selectedConfigId.value = preferredConfig.configId;
        } else if (aiConfigs.value.length > 0) {
            selectedConfigId.value = aiConfigs.value[0].configId;
        }
    } catch (error) {
        console.error("加载AI配置失败:", error);
        message.error("加载AI配置失败");
    }
};

// 加载调试历史记录
const loadDebugHistory = async () => {
    try {
        if (!props.prompt?.id) return;
        
        // 获取所有AI生成历史记录并过滤出调试记录
        const allHistory = await api.aiGenerationHistory.getAll.query();
        
        // 过滤出与当前提示词相关的调试记录
        debugHistory.value = allHistory.filter(record => 
            record.topic.includes(`${props.prompt.title}`) || 
            record.topic.includes('提示词调试') ||
            record.debugResult || 
            record.debugStatus
        ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
    } catch (error) {
        console.error("加载调试历史失败:", error);
        debugHistory.value = [];
    }
};

// 选择调试记录
const selectDebugRecord = (index) => {
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

// 调试提示词功能
const debugPrompt = async () => {
    if (!canDebug.value) {
        message.warning("请先完成变量填写");
        return;
    }

    if (aiConfigs.value.length === 0) {
        message.warning("没有可用的AI配置，请先在AI配置页面添加配置");
        return;
    }

    const selectedConfig = aiConfigs.value.find(config => config.configId === selectedConfigId.value);
    if (!selectedConfig) {
        message.error("请选择一个AI配置");
        return;
    }

    debugging.value = true;
    debugResult.value = "";
    debugError.value = "";

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
            models: Array.isArray(selectedConfig.models) ? selectedConfig.models.map(m => String(m)) : [],
            defaultModel: selectedConfig.defaultModel ? String(selectedConfig.defaultModel) : '',
            customModel: selectedConfig.customModel ? String(selectedConfig.customModel) : '',
            enabled: Boolean(selectedConfig.enabled),
            systemPrompt: selectedConfig.systemPrompt ? String(selectedConfig.systemPrompt) : '',
            createdAt: selectedConfig.createdAt ? selectedConfig.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: selectedConfig.updatedAt ? selectedConfig.updatedAt.toISOString() : new Date().toISOString()
        };

        // 构建请求参数 - 不包含 config
        const request = {
            configId: String(selectedConfig.configId || ''),
            topic: String(`请分析并回应以下提示词：\n\n${filledContent.value}`),
            customPrompt: String(filledContent.value),
            model: String(selectedConfig.defaultModel || selectedConfig.models?.[0] || '')
        };

        console.log("开始调试提示词:", filledContent.value);
        console.log("选中的配置:", selectedConfig);
        console.log("请求参数:", request);
        console.log("配置参数:", serializedConfig);

        // 调用AI接口 - 传递两个分离的参数：request 和 config
        const result = await window.electronAPI.ai.generatePrompt(request, serializedConfig);
        
        debugResult.value = result.generatedPrompt;
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
            customPrompt: `调试提示词内容：\n${filledContent.value}`
        });

        // 刷新调试历史记录
        await loadDebugHistory();

    } catch (error) {
        console.error("调试失败:", error);
        debugError.value = error.message || "调试失败";
        message.error("调试失败: " + (error.message || "未知错误"));

        // 保存失败记录
        try {
            const selectedConfig = aiConfigs.value.find(config => config.configId === selectedConfigId.value);
            if (selectedConfig) {
                await api.aiGenerationHistory.create.mutate({
                    historyId: `debug_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    configId: selectedConfig.configId,
                    topic: `提示词调试失败: ${props.prompt?.title || '未命名提示词'}`,
                    generatedPrompt: filledContent.value,
                    model: selectedConfig.defaultModel || selectedConfig.models[0],
                    status: 'error',
                    errorMessage: error.message || "调试失败",
                    debugStatus: 'error',
                    debugErrorMessage: error.message || "调试失败"
                });
                
                // 刷新调试历史记录
                await loadDebugHistory();
            }
        } catch (saveError) {
            console.error("保存调试失败记录时出错:", saveError);
        }
    } finally {
        debugging.value = false;
    }
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

// 加载历史记录
const loadHistoryRecord = (record) => {
    variableValues.value = { ...record.variables };
    activeTab.value = "detail"; // 切换到详情页面
    message.success("已加载历史记录");
};

// 选择历史记录
const selectHistoryRecord = (index) => {
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
const formatDate = (date) => {
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
        console.log("Prompt 变化:", newPrompt); // 调试用
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

// 监听变量值变化，用于调试
watch(
    () => variableValues.value,
    (newValues) => {
        console.log("变量值变化:", newValues);
        console.log("填充后内容:", filledContent.value);
    },
    { deep: true }
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
        } else {
            // 显示弹窗时加载AI配置
            loadAIConfigs();
        }
    }
);
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

/* 选中的记录样式 */
.selected-record {
    border: 2px solid var(--primary-color) !important;
    background-color: var(--primary-color-suppl) !important;
}
</style>
