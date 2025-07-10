<template>
    <NModal :show="show" @update:show="(value) => emit('update:show', value)" preset="dialog" title="解决数据冲突"
        :mask-closable="false" :closable="false" style="width: 90%; max-width: 1400px;">
        <div v-if="conflictData">
            <NFlex vertical :size="20">
                <!-- 冲突概述 -->
                <NAlert type="warning" show-icon>
                    <template #header>🔍 检测到数据差异</template>
                    <div>
                        本地数据与服务器数据存在差异，请仔细比较并选择如何处理。
                        <br>
                        <div style="margin-top: 8px;">
                            <NTag type="info" size="small" style="margin-right: 8px;">
                                本地: {{ getDataSummary(conflictData.localData) }}
                            </NTag>
                            <NTag type="warning" size="small" style="margin-right: 8px;">
                                远程: {{ getDataSummary(conflictData.remoteData) }}
                            </NTag>
                            <NTag type="error" size="small" v-if="totalDifferences > 0">
                                差异: {{ totalDifferences }} 项
                            </NTag>
                        </div>
                    </div>
                </NAlert>

                <!-- 解决策略选择 -->
                <NCard title="🎯 选择解决策略" size="small">
                    <NRadioGroup v-model:value="selectedStrategy">
                        <NFlex vertical :size="16">
                            <div class="strategy-option">
                                <NRadio value="use_local">
                                    <NFlex align="center" :size="12">
                                        <NIcon size="20" color="#18a058">
                                            <Database />
                                        </NIcon>
                                        <div>
                                            <div style="font-weight: 600;">使用本地数据</div>
                                            <NText depth="3" style="font-size: 12px;">
                                                保持当前本地数据，丢弃远程更改（推荐：当确信本地数据更准确时）
                                            </NText>
                                        </div>
                                    </NFlex>
                                </NRadio>
                            </div>

                            <div class="strategy-option">
                                <NRadio value="use_remote">
                                    <NFlex align="center" :size="12">
                                        <NIcon size="20" color="#2080f0">
                                            <Cloud />
                                        </NIcon>
                                        <div>
                                            <div style="font-weight: 600;">使用远程数据</div>
                                            <NText depth="3" style="font-size: 12px;">
                                                用服务器数据完全替换本地数据（注意：会丢失本地未同步的更改）
                                            </NText>
                                        </div>
                                    </NFlex>
                                </NRadio>
                            </div>

                            <div class="strategy-option">
                                <NRadio value="merge_smart">
                                    <NFlex align="center" :size="12">
                                        <NIcon size="20" color="#f0a020">
                                            <GitMerge />
                                        </NIcon>
                                        <div>
                                            <div style="font-weight: 600;">智能合并</div>
                                            <NText depth="3" style="font-size: 12px;">
                                                自动合并非冲突项，对冲突项选择更新的版本（推荐：安全的默认选择）
                                            </NText>
                                        </div>
                                    </NFlex>
                                </NRadio>
                            </div>

                            <div class="strategy-option">
                                <NRadio value="merge_manual">
                                    <NFlex align="center" :size="12">
                                        <NIcon size="20" color="#d03050">
                                            <Settings />
                                        </NIcon>
                                        <div>
                                            <div style="font-weight: 600;">手动精细控制</div>
                                            <NText depth="3" style="font-size: 12px;">
                                                逐项查看差异，手动选择要保留的数据（适用于重要数据冲突）
                                            </NText>
                                        </div>
                                    </NFlex>
                                </NRadio>
                            </div>
                        </NFlex>
                    </NRadioGroup>
                </NCard>

                <!-- 数据比较和预览 -->
                <div v-if="selectedStrategy === 'merge_smart' || selectedStrategy === 'merge_manual'">
                    <!-- 智能合并预览 -->
                    <div v-if="selectedStrategy === 'merge_smart'">
                        <NCard title="🤖 智能合并预览" size="small">
                            <NFlex vertical :size="12">
                                <NAlert type="info" show-icon>
                                    智能合并将自动处理以下规则：
                                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                                        <li>新增项：自动添加远程新增的项目</li>
                                        <li>修改项：选择修改时间更新的版本</li>
                                        <li>删除项：保留本地存在但远程已删除的项目</li>
                                    </ul>
                                </NAlert>

                                <div class="merge-summary">
                                    <NFlex :size="16">
                                        <div v-if="addedItems.length > 0">
                                            <NTag type="success" size="small">
                                                +{{ addedItems.length }} 新增
                                            </NTag>
                                        </div>
                                        <div v-if="modifiedItems.length > 0">
                                            <NTag type="warning" size="small">
                                                ~{{ modifiedItems.length }} 修改
                                            </NTag>
                                        </div>
                                        <div v-if="deletedItems.length > 0">
                                            <NTag type="error" size="small">
                                                ×{{ deletedItems.length }} 保留
                                            </NTag>
                                        </div>
                                    </NFlex>
                                </div>
                            </NFlex>
                        </NCard>
                    </div>
                    <!-- 手动合并详细控制 -->
                    <div v-if="selectedStrategy === 'merge_manual'">
                        <NCard title="🔧 精细控制选项" size="small">
                            <NFlex vertical :size="16">
                                <!-- 操作提示 -->
                                <NAlert type="info" show-icon>
                                    <template #header>操作说明</template>
                                    <div>
                                        下方显示了所有数据差异。请仔细比较本地和远程数据，选择要保留的版本。
                                        <strong>未选择的修改项将保持本地版本。</strong>
                                    </div>
                                </NAlert>

                                <!-- 快速操作 -->
                                <NFlex :size="12">
                                    <NButton size="small" @click="selectAllAdded">
                                        全选新增项
                                    </NButton>
                                    <NButton size="small" @click="selectAllRemote">
                                        全选远程版本
                                    </NButton>
                                    <NButton size="small" @click="selectAllLocal">
                                        全选本地版本
                                    </NButton>
                                    <NButton size="small" @click="clearAllSelections">
                                        清空选择
                                    </NButton>
                                </NFlex>

                                <NTabs type="line" animated>
                                    <!-- 新增项 -->
                                    <NTabPane name="added" :tab="`🆕 新增项 (${addedItems.length})`"
                                        v-if="addedItems.length > 0">
                                        <NFlex vertical :size="8">
                                            <NText depth="2" style="font-size: 14px;">
                                                以下项目在远程存在，但本地没有。勾选的项目将被添加到本地：
                                            </NText>
                                            <div v-for="item in addedItems" :key="`${item._type}-${item.id}`"
                                                class="diff-item added-item">
                                                <NCheckbox
                                                    :checked="mergeSelections.added.includes(`${item._type}-${item.id}`)"
                                                    @update:checked="(checked) => handleMergeSelection('added', `${item._type}-${item.id}`, checked)">
                                                    <NFlex align="center" :size="12" style="width: 100%;">
                                                        <NTag :type="getDataTypeColor(item._type)" size="small">
                                                            {{ getDataTypeLabel(item._type) }}
                                                        </NTag>
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600;">{{ item.name || item.title ||
                                                                item.id }}
                                                            </div>
                                                            <NText depth="3" style="font-size: 12px;">
                                                                {{ item.description || '无描述' }}
                                                            </NText>
                                                        </div>
                                                        <NButton size="tiny" text @click="showItemDetail(item)">
                                                            查看详情
                                                        </NButton>
                                                    </NFlex>
                                                </NCheckbox>
                                            </div>
                                        </NFlex>
                                    </NTabPane>

                                    <!-- 修改项 -->
                                    <NTabPane name="modified" :tab="`🔄 修改项 (${modifiedItems.length})`"
                                        v-if="modifiedItems.length > 0">
                                        <NFlex vertical :size="12">
                                            <NText depth="2" style="font-size: 14px;">
                                                以下项目在本地和远程都有修改，请选择要保留的版本：
                                            </NText>
                                            <div v-for="item in modifiedItems" :key="`${item._type}-${item.id}`"
                                                class="diff-item modified-item">
                                                <div class="item-header">
                                                    <NFlex align="center" :size="12">
                                                        <NTag :type="getDataTypeColor(item._type)" size="small">
                                                            {{ getDataTypeLabel(item._type) }}
                                                        </NTag>
                                                        <div style="font-weight: 600;">{{ item.local?.name ||
                                                            item.local?.title ||
                                                            item.id }}</div>
                                                        <NTag
                                                            :type="mergeSelections.modified[`${item._type}-${item.id}`] ? 'success' : 'warning'"
                                                            size="tiny">
                                                            {{ mergeSelections.modified[`${item._type}-${item.id}`] ===
                                                                'local' ? '已选本地'
                                                                :
                                                            mergeSelections.modified[`${item._type}-${item.id}`] ===
                                                            'remote' ? '已选远程' :
                                                            '未选择' }}
                                                        </NTag>
                                                    </NFlex>
                                                </div>
                                                <div class="item-content">
                                                    <NFlex :size="16">
                                                        <div class="version-option">
                                                            <NRadio
                                                                :checked="mergeSelections.modified[`${item._type}-${item.id}`] === 'local'"
                                                                @update:checked="(checked) => checked && handleModifiedSelection(`${item._type}-${item.id}`, 'local')"
                                                                :name="`modified-${item._type}-${item.id}`">
                                                                <div
                                                                    style="display: flex; align-items: center; gap: 8px;">
                                                                    <strong>本地版本</strong>
                                                                    <NTag size="tiny" type="info">
                                                                        {{ formatDate(item.localLastModified) }}
                                                                    </NTag>
                                                                </div>
                                                            </NRadio>
                                                            <NCard size="small" class="version-preview">
                                                                <pre>{{ formatItemPreview(item.local) }}</pre>
                                                            </NCard>
                                                        </div>
                                                        <div class="version-option">
                                                            <NRadio
                                                                :checked="mergeSelections.modified[`${item._type}-${item.id}`] === 'remote'"
                                                                @update:checked="(checked) => checked && handleModifiedSelection(`${item._type}-${item.id}`, 'remote')"
                                                                :name="`modified-${item._type}-${item.id}`">
                                                                <div
                                                                    style="display: flex; align-items: center; gap: 8px;">
                                                                    <strong>远程版本</strong>
                                                                    <NTag size="tiny" type="warning">
                                                                        {{ formatDate(item.remoteLastModified) }}
                                                                    </NTag>
                                                                </div>
                                                            </NRadio>
                                                            <NCard size="small" class="version-preview">
                                                                <pre>{{ formatItemPreview(item.remote) }}</pre>
                                                            </NCard>
                                                        </div>
                                                    </NFlex>
                                                </div>
                                            </div>
                                        </NFlex>
                                    </NTabPane>

                                    <!-- 删除项 -->
                                    <NTabPane name="deleted" :tab="`🗑️ 删除项 (${deletedItems.length})`"
                                        v-if="deletedItems.length > 0">
                                        <NFlex vertical :size="8">
                                            <NText depth="2" style="font-size: 14px;">
                                                以下项目在本地存在，但远程已删除。勾选的项目将被保留：
                                            </NText>
                                            <div v-for="item in deletedItems" :key="`${item._type}-${item.id}`"
                                                class="diff-item deleted-item">
                                                <NCheckbox
                                                    :checked="mergeSelections.deleted.includes(`${item._type}-${item.id}`)"
                                                    @update:checked="(checked) => handleMergeSelection('deleted', `${item._type}-${item.id}`, checked)">
                                                    <NFlex align="center" :size="12" style="width: 100%;">
                                                        <NTag :type="getDataTypeColor(item._type)" size="small">
                                                            {{ getDataTypeLabel(item._type) }}
                                                        </NTag>
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600;">{{ item.name || item.title ||
                                                                item.id }}
                                                            </div>
                                                            <NText depth="3" style="font-size: 12px;">
                                                                {{ item.description || '本地保留，远程已删除' }}
                                                            </NText>
                                                        </div>
                                                        <NTag size="tiny" type="error">保留此项</NTag>
                                                    </NFlex>
                                                </NCheckbox>
                                            </div>
                                        </NFlex>
                                    </NTabPane>
                                </NTabs>
                            </NFlex>
                        </NCard>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <NFlex justify="space-between" align="center">
                    <div v-if="selectedStrategy === 'merge_manual'">
                        <NText depth="3" style="font-size: 12px;">
                            操作提示: {{ getOperationHint() }}
                        </NText>
                    </div>
                    <div v-else></div>

                    <NFlex :size="12">
                        <NButton @click="handleCancel">
                            取消操作
                        </NButton>
                        <NButton type="primary" @click="handleConfirm" :loading="loading" :disabled="!canConfirm">
                            <template #icon>
                                <NIcon>
                                    <CircleCheck />
                                </NIcon>
                            </template>
                            {{ getConfirmButtonText() }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </NFlex>
        </div>
    </NModal>
</template>

<script setup lang="ts">
import {
    NModal,
    NAlert,
    NCard,
    NFlex,
    NText,
    NRadioGroup,
    NRadio,
    NButton,
    NTabs,
    NTabPane,
    NCheckbox,
    NTag,
    NIcon,
    useMessage,
} from "naive-ui";
import {
    Database,
    Cloud,
    GitMerge,
    Settings,
    CircleCheck,
} from "@vicons/tabler";
import { ref, computed, watch } from "vue";

interface ConflictData {
    hasConflicts: boolean;
    conflictDetails?: any[];
    localData?: any;
    remoteData?: any;
    differences?: {
        added: any[];
        modified: any[];
        deleted: any[];
        summary: {
            localTotal: number;
            remoteTotal: number;
            conflicts: number;
        };
    };
}

const props = defineProps<{
    show: boolean;
    conflictData: ConflictData | null;
    loading?: boolean;
}>();

const emit = defineEmits<{
    "update:show": [value: boolean];
    "resolve": [resolution: any];
    "cancel": [];
}>();

const message = useMessage();

// 选择的解决策略
const selectedStrategy = ref<'use_local' | 'use_remote' | 'merge_smart' | 'merge_manual'>('use_local');

// 合并选择状态
const mergeSelections = ref({
    added: [] as string[],
    deleted: [] as string[],
    modified: {} as Record<string, 'local' | 'remote'>
});

const addedItems = computed(() => props.conflictData?.differences?.added || []);
const modifiedItems = computed(() => props.conflictData?.differences?.modified || []);
const deletedItems = computed(() => props.conflictData?.differences?.deleted || []);

// 总差异数量
const totalDifferences = computed(() =>
    addedItems.value.length + modifiedItems.value.length + deletedItems.value.length
);

const canConfirm = computed(() => {
    if (selectedStrategy.value === 'merge_manual') {
        // 检查是否所有修改项都有选择
        const allModifiedSelected = modifiedItems.value.every(item =>
            mergeSelections.value.modified[`${item._type}-${item.id}`]
        );
        return allModifiedSelected;
    }
    return true;
});

// 监听冲突数据变化，重置选择状态
watch(() => props.conflictData, (newData) => {
    if (newData) {
        // 默认选择所有新增项
        mergeSelections.value.added = addedItems.value.map(item => `${item._type}-${item.id}`);
        // 默认保留所有删除项
        mergeSelections.value.deleted = deletedItems.value.map(item => `${item._type}-${item.id}`);
        // 清空修改项选择
        mergeSelections.value.modified = {};
    }
}, { immediate: true });

// 处理合并选择
const handleMergeSelection = (type: 'added' | 'deleted', itemKey: string, checked: boolean) => {
    const selections = mergeSelections.value[type];
    if (checked) {
        if (!selections.includes(itemKey)) {
            selections.push(itemKey);
        }
    } else {
        const index = selections.indexOf(itemKey);
        if (index > -1) {
            selections.splice(index, 1);
        }
    }
};

// 处理修改项选择
const handleModifiedSelection = (itemKey: string, version: 'local' | 'remote') => {
    mergeSelections.value.modified[itemKey] = version;
};

// 获取数据类型颜色
const getDataTypeColor = (type: string): 'success' | 'info' | 'warning' | 'default' | 'error' => {
    const colors: Record<string, 'success' | 'info' | 'warning' | 'default' | 'error'> = {
        categories: 'success',
        prompts: 'info',
        aiConfigs: 'warning',
        history: 'default',
        settings: 'error'
    };
    return colors[type] || 'default';
};

// 获取数据类型标签
const getDataTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
        prompts: '提示词',
        aiConfigs: 'AI配置',
        categories: '分类',
        history: '历史记录',
        settings: '设置'
    };
    return labels[type] || type;
};

// 格式化项目预览
const formatItemPreview = (item: any) => {
    if (!item) return '';

    const preview = {
        name: item.name || item.title,
        description: item.description,
        content: item.content ? item.content.substring(0, 100) + '...' : undefined,
        updatedAt: item.updatedAt,
    };

    // 过滤掉undefined的字段
    const filtered = Object.fromEntries(
        Object.entries(preview).filter(([_, value]) => value !== undefined)
    );

    return JSON.stringify(filtered, null, 2);
};

// 新增的方法
// 获取数据概要
const getDataSummary = (data: any) => {
    if (!data) return '无数据';
    const counts = [];
    if (data.categories?.length) counts.push(`${data.categories.length}个分类`);
    if (data.prompts?.length) counts.push(`${data.prompts.length}个提示词`);
    if (data.aiConfigs?.length) counts.push(`${data.aiConfigs.length}个AI配置`);
    return counts.join(', ') || '空数据';
};

// 格式化日期
const formatDate = (dateString: string) => {
    if (!dateString) return '未知';
    return new Date(dateString).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// 快速操作方法
const selectAllAdded = () => {
    mergeSelections.value.added = addedItems.value.map(item => `${item._type}-${item.id}`);
};

const selectAllRemote = () => {
    modifiedItems.value.forEach(item => {
        mergeSelections.value.modified[`${item._type}-${item.id}`] = 'remote';
    });
};

const selectAllLocal = () => {
    modifiedItems.value.forEach(item => {
        mergeSelections.value.modified[`${item._type}-${item.id}`] = 'local';
    });
};

const clearAllSelections = () => {
    mergeSelections.value.added = [];
    mergeSelections.value.deleted = [];
    mergeSelections.value.modified = {};
};

// 显示项目详情（可以扩展为对话框）
const showItemDetail = (item: any) => {
    message.info(`${item.name || item.title}: ${item.description || '无详细描述'}`);
};

// 获取操作提示
const getOperationHint = () => {
    const unselectedModified = modifiedItems.value.filter(item =>
        !mergeSelections.value.modified[`${item._type}-${item.id}`]
    ).length;

    if (unselectedModified > 0) {
        return `还有 ${unselectedModified} 个修改项未选择版本`;
    }
    return '所有必要选择已完成，可以确认应用';
};

// 获取确认按钮文本
const getConfirmButtonText = () => {
    switch (selectedStrategy.value) {
        case 'use_local': return '使用本地数据';
        case 'use_remote': return '使用远程数据';
        case 'merge_smart': return '执行智能合并';
        case 'merge_manual': return '应用手动选择';
        default: return '确认应用';
    }
};

// 处理确认
const handleConfirm = () => {
    let resolution;

    switch (selectedStrategy.value) {
        case 'merge_smart':
            // 智能合并：自动处理规则
            const smartMergedData = buildSmartMergedData();
            resolution = {
                strategy: 'merge_smart',
                mergedData: smartMergedData
            };
            break;
        case 'merge_manual':
            // 手动合并：按用户选择
            const manualMergedData = buildMergedData();
            resolution = {
                strategy: 'merge_manual',
                mergedData: manualMergedData
            };
            break;
        default:
            resolution = {
                strategy: selectedStrategy.value
            };
    }

    emit('resolve', resolution);
};

// 构建智能合并数据
const buildSmartMergedData = () => {
    const localData = props.conflictData?.localData || {};
    const remoteData = props.conflictData?.remoteData || {};

    const mergedData = JSON.parse(JSON.stringify(localData)); // 深拷贝本地数据

    // 自动添加所有新增项
    for (const item of addedItems.value) {
        if (mergedData[item._type]) {
            const cleanItem = { ...item };
            delete cleanItem._type;
            delete cleanItem._changeType;
            mergedData[item._type].push(cleanItem);
        }
    }

    // 自动处理修改项：选择时间更新的版本
    for (const item of modifiedItems.value) {
        const localTime = new Date(item.localLastModified || item.local?.updatedAt || 0).getTime();
        const remoteTime = new Date(item.remoteLastModified || item.remote?.updatedAt || 0).getTime();

        if (mergedData[item._type]) {
            const index = mergedData[item._type].findIndex((dataItem: any) => dataItem.id === item.id);
            if (index > -1) {
                // 使用时间更新的版本
                mergedData[item._type][index] = remoteTime > localTime ? item.remote : item.local;
            }
        }
    }

    // 删除项：保留本地版本（即不删除）

    return mergedData;
};

// 构建合并后的数据
const buildMergedData = () => {
    const localData = props.conflictData?.localData || {};
    const remoteData = props.conflictData?.remoteData || {};

    const mergedData = JSON.parse(JSON.stringify(localData)); // 深拷贝本地数据

    // 处理新增项
    for (const itemKey of mergeSelections.value.added) {
        const [type, id] = itemKey.split('-');
        const remoteItem = addedItems.value.find(item =>
            item._type === type && item.id === id
        );

        if (remoteItem && mergedData[type]) {
            // 移除临时属性
            const cleanItem = { ...remoteItem };
            delete cleanItem._type;
            delete cleanItem._changeType;

            mergedData[type].push(cleanItem);
        }
    }

    // 处理修改项
    for (const [itemKey, version] of Object.entries(mergeSelections.value.modified)) {
        const [type, id] = itemKey.split('-');
        const modifiedItem = modifiedItems.value.find(item =>
            item._type === type && item.id === id
        );

        if (modifiedItem && mergedData[type]) {
            const index = mergedData[type].findIndex((item: any) => item.id === id);
            if (index > -1) {
                mergedData[type][index] = version === 'local' ?
                    modifiedItem.local : modifiedItem.remote;
            }
        }
    }

    // 处理删除项（从删除列表中移除表示要保留）
    // 这里不需要特殊处理，因为我们基于本地数据，默认就保留了这些项

    return mergedData;
};

// 处理取消
const handleCancel = () => {
    emit('cancel');
};
</script>

<style scoped>
.strategy-option {
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    transition: all 0.2s ease;
}

.strategy-option:hover {
    background-color: var(--hover-color);
    border-color: var(--primary-color);
}

.diff-item {
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    margin-bottom: 8px;
    transition: all 0.2s ease;
}

.diff-item:hover {
    border-color: var(--primary-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.added-item {
    border-left: 4px solid #18a058;
    background-color: rgba(24, 160, 88, 0.05);
}

.modified-item {
    border-left: 4px solid #f0a020;
    background-color: rgba(240, 160, 32, 0.05);
    padding: 16px;
    margin-bottom: 16px;
}

.deleted-item {
    border-left: 4px solid #d03050;
    background-color: rgba(208, 48, 80, 0.05);
}

.item-header {
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
}

.item-content {
    display: flex;
    gap: 16px;
}

.version-option {
    flex: 1;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background-color: var(--card-color);
}

.version-option:hover {
    border-color: var(--primary-color);
}

.version-preview {
    margin-top: 8px;
    max-height: 200px;
    overflow-y: auto;
    background-color: var(--code-bg-color, #f5f5f5);
}

.version-preview pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    margin: 0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    line-height: 1.4;
}

.merge-summary {
    padding: 12px;
    background-color: var(--info-color-suppl);
    border-radius: 6px;
    border: 1px solid var(--info-color);
}

/* 深色模式适配 */
[data-theme="dark"] .version-preview {
    background-color: #2d2d2d;
}

[data-theme="dark"] .version-preview pre {
    color: #e0e0e0;
}
</style>
