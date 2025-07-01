<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleCancel">
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex align="center" justify="space-between">
                <NFlex align="center" style="gap: 12px">
                    <NIcon size="24">
                        <Settings />
                    </NIcon>
                    <div>
                        <NText :style="{ fontSize: '20px', fontWeight: 600 }">
                            快速优化提示词配置
                        </NText>
                        <NText depth="3" style="font-size: 13px; display: block; margin-top: 2px">
                            管理提示词编辑时的快速优化选项
                        </NText>
                    </div>
                </NFlex>
            </NFlex>
        </template>

        <!-- 中间可操作区域 -->
        <template #content="{ contentHeight }">
            <NFlex vertical size="medium" :style="{ height: `${contentHeight}px` }">
                <!-- 配置列表 -->
                <NCard size="small" :style="{ flex: 1 }">
                    <template #header>
                        <NFlex justify="space-between" align="center">
                            <NText strong>优化配置列表</NText>
                            <NText depth="3" style="font-size: 12px;">
                                {{ enabledCount }}/{{ totalCount }}
                            </NText>
                        </NFlex>
                    </template>
                    <NScrollbar :style="{ height: `${contentHeight - 80}px` }">
                        <NFlex vertical size="medium" style="padding-right: 12px;">
                            <div v-if="configs.length === 0" style="text-align: center; padding: 40px">
                                <NEmpty description="暂无配置">
                                    <template #extra>
                                        <NButton size="small" @click="initializeDefaults" :loading="initializing">
                                            初始化默认配置
                                        </NButton>
                                    </template>
                                </NEmpty>
                            </div>
                            
                            <NCard 
                                v-for="(config, index) in configs" 
                                :key="config.id" 
                                size="small"
                                :style="{ marginBottom: '8px' }"
                            >
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NFlex align="center" size="small">
                                            <NText strong>{{ config.name }}</NText>
                                            <NTag size="small" :type="config.enabled ? 'success' : 'default'">
                                                {{ config.enabled ? '已启用' : '已禁用' }}
                                            </NTag>
                                            <NTag size="small" type="info">
                                                排序: {{ config.sortOrder }}
                                            </NTag>
                                        </NFlex>
                                        <NFlex size="small">
                                            <NButton 
                                                size="small" 
                                                @click="editConfig(config)"
                                                type="info"
                                            >
                                                <template #icon>
                                                    <NIcon>
                                                        <Edit />
                                                    </NIcon>
                                                </template>
                                                编辑
                                            </NButton>
                                            <NButton 
                                                size="small" 
                                                @click="toggleConfig(config)"
                                                :type="config.enabled ? 'warning' : 'success'"
                                                :disabled="!config.enabled && enabledCount >= 5"
                                            >
                                                {{ config.enabled ? '禁用' : '启用' }}
                                            </NButton>
                                            <NButton 
                                                size="small" 
                                                @click="deleteConfig(config)"
                                                type="error"
                                            >
                                                <template #icon>
                                                    <NIcon>
                                                        <Trash />
                                                    </NIcon>
                                                </template>
                                                删除
                                            </NButton>
                                        </NFlex>
                                    </NFlex>
                                </template>

                                <NFlex vertical size="small">
                                    <div v-if="config.description">
                                        <NText depth="3" style="font-size: 12px;">描述</NText>
                                        <NText style="font-size: 12px;">{{ config.description }}</NText>
                                    </div>
                                    <div>
                                        <NText depth="3" style="font-size: 12px;">提示词模板</NText>
                                        <NInput 
                                            :value="config.prompt" 
                                            type="textarea" 
                                            readonly 
                                            :rows="3"
                                            :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace', fontSize: '11px' }"
                                        />

                                    </div>
                                </NFlex>
                            </NCard>
                        </NFlex>
                    </NScrollbar>
                </NCard>
            </NFlex>
        </template>

                <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="end" align="center">
                <NButton type="primary" @click="addNewConfig">
                    <template #icon>
                        <NIcon>
                            <Plus />
                        </NIcon>
                    </template>
                    添加配置
                </NButton>
            </NFlex>
        </template>
    </CommonModal>

    <!-- 编辑配置弹窗 -->
    <CommonModal ref="editModalRef" :show="showEditModal" @update:show="showEditModal = $event" @close="closeEditModal">
        <template #header>
            <NText :style="{ fontSize: '18px', fontWeight: 600 }">
                {{ editingConfig ? "编辑配置" : "添加配置" }}
            </NText>
        </template>

        <template #content="{ contentHeight }">
            <NForm ref="editFormRef" :model="editFormData" :rules="editFormRules" label-placement="top">
                <NFlex vertical size="large" :style="{ height: `${contentHeight}px` }">
                    <NFormItem label="配置名称" path="name">
                        <NInput v-model:value="editFormData.name" placeholder="输入配置名称，如：更简短、更丰富等" />
                    </NFormItem>

                    <NFormItem label="描述" path="description">
                        <NInput 
                            v-model:value="editFormData.description" 
                            type="textarea" 
                            placeholder="输入配置描述（可选）" 
                            :rows="2" 
                        />
                    </NFormItem>

                    <NFormItem label="提示词模板" path="prompt">
                        <NInput 
                            v-model:value="editFormData.prompt" 
                            type="textarea" 
                            placeholder="输入提示词模板，使用 {{content}} 作为占位符" 
                            :rows="6"
                            :style="{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }"
                            show-count
                        />

                    </NFormItem>

                    <NFlex>
                        <NFormItem label="排序" path="sortOrder" style="flex: 1">
                            <NInputNumber 
                                v-model:value="editFormData.sortOrder" 
                                placeholder="排序数字" 
                                :min="0"
                                :max="999"
                            />
                        </NFormItem>
                        <NFormItem label="启用状态" path="enabled" style="width: 120px">
                            <NSwitch v-model:value="editFormData.enabled" />
                        </NFormItem>
                    </NFlex>
                </NFlex>
            </NForm>
        </template>

        <template #footer>
            <NFlex justify="end">
                <NButton @click="closeEditModal">取消</NButton>
                <NButton type="primary" @click="saveEditConfig" :loading="saving">
                    {{ editingConfig ? "更新" : "创建" }}
                </NButton>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import {
    NForm,
    NFormItem,
    NInput,
    NInputNumber,
    NButton,
    NCard,
    NFlex,
    NText,
    NIcon,
    NAlert,
    NEmpty,
    NTag,
    NScrollbar,
    NSwitch,
    useMessage,
} from "naive-ui";
import { Settings, Edit, Trash, Plus } from "@vicons/tabler";
import CommonModal from "@/components/common/CommonModal.vue";
import { api } from "@/lib/api";
import type { QuickOptimizationConfig, CreateQuickOptimizationConfig, UpdateQuickOptimizationConfig } from "@shared/types/ai";

interface Props {
    show: boolean;
}

interface Emits {
    (e: "update:show", value: boolean): void;
    (e: "configs-updated"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();

// 数据状态
const configs = ref<QuickOptimizationConfig[]>([]);
const loading = ref(false);
const initializing = ref(false);
const saving = ref(false);

// 编辑弹窗状态
const showEditModal = ref(false);
const editingConfig = ref<QuickOptimizationConfig | null>(null);
const editFormRef = ref();

// 编辑表单数据
const editFormData = ref({
    name: "",
    description: "",
    prompt: "",
    sortOrder: 1,
    enabled: true,
});

// 编辑表单验证规则
const editFormRules = {
    name: {
        required: true,
        message: "请输入配置名称",
        trigger: "blur",
    },
    prompt: {
        required: true,
        message: "请输入提示词模板",
        trigger: "blur",
    },
    sortOrder: {
        required: false,
        validator: (rule: any, value: any) => {
            // 允许空值或数字
            if (value === null || value === undefined || value === '') {
                return true;
            }
            // 检查是否为有效数字
            const numValue = Number(value);
            if (isNaN(numValue)) {
                return new Error('排序数字必须是有效数字');
            }
            if (numValue < 0) {
                return new Error('排序数字不能为负数');
            }
            return true;
        },
        trigger: "blur",
    },
};

// 计算属性
const totalCount = computed(() => configs.value.length);
const enabledCount = computed(() => configs.value.filter(c => c.enabled).length);

// 加载配置列表
const loadConfigs = async () => {
    try {
        loading.value = true;
        console.log('开始加载快速优化配置...');
        configs.value = await api.quickOptimizationConfigs.getAll.query();
        console.log('加载到的配置:', configs.value);
    } catch (error) {
        console.error("加载快速优化配置失败:", error);
        message.error("加载配置失败");
    } finally {
        loading.value = false;
    }
};

// 初始化默认配置
const initializeDefaults = async () => {
    try {
        initializing.value = true;
        await api.quickOptimizationConfigs.initializeDefaults.mutate();
        message.success("默认配置初始化成功");
        await loadConfigs();
        emit("configs-updated");
    } catch (error) {
        console.error("初始化默认配置失败:", error);
        message.error("初始化失败");
    } finally {
        initializing.value = false;
    }
};

// 切换配置启用状态
const toggleConfig = async (config: QuickOptimizationConfig) => {
    if (!config.id) return;

    try {
        const newEnabled = !config.enabled;
        
        // 检查启用数量限制
        if (newEnabled && enabledCount.value >= 5) {
            message.warning("最多只能启用 5 个配置");
            return;
        }

        await api.quickOptimizationConfigs.toggle.mutate({
            id: config.id,
            enabled: newEnabled
        });
        
        // 不显示消息，由父组件统一处理
        await loadConfigs();
        emit("configs-updated");
    } catch (error) {
        console.error("切换配置状态失败:", error);
        message.error("操作失败");
    }
};

// 编辑配置
const editConfig = (config: QuickOptimizationConfig) => {
    editingConfig.value = config;
    editFormData.value = {
        name: config.name,
        description: config.description || "",
        prompt: config.prompt,
        sortOrder: Number(config.sortOrder),
        enabled: config.enabled,
    };
    showEditModal.value = true;
};

// 添加新配置
const addNewConfig = () => {
    editingConfig.value = null;
    editFormData.value = {
        name: "",
        description: "",
        prompt: "",
        sortOrder: Number(configs.value.length + 1),
        enabled: true,
    };
    console.log('添加新配置，初始数据:', editFormData.value);
    showEditModal.value = true;
};

// 保存编辑配置
const saveEditConfig = async () => {
    try {
        // 确保 sortOrder 有有效值
        if (editFormData.value.sortOrder === null || editFormData.value.sortOrder === undefined || editFormData.value.sortOrder === '') {
            editFormData.value.sortOrder = Number(configs.value.length + 1);
        }
        
        await editFormRef.value?.validate();
        saving.value = true;

        console.log('准备保存配置数据:', editFormData.value);

        if (editingConfig.value) {
            // 更新配置
            console.log('更新配置:', editingConfig.value.id, editFormData.value);
            await api.quickOptimizationConfigs.update.mutate({
                id: editingConfig.value.id!,
                data: editFormData.value as UpdateQuickOptimizationConfig
            });
            // 不显示消息，由父组件统一处理
        } else {
            // 创建新配置
            console.log('创建新配置:', editFormData.value);
            const result = await api.quickOptimizationConfigs.create.mutate(editFormData.value as CreateQuickOptimizationConfig);
            console.log('创建结果:', result);
            // 不显示消息，由父组件统一处理
        }

        closeEditModal();
        await loadConfigs();
        emit("configs-updated");
    } catch (error) {
        console.error("保存配置失败:", error);
        console.error("错误类型:", typeof error);
        console.error("错误详情:", JSON.stringify(error, null, 2));
        
        // 提供更详细的错误信息
        if (error && typeof error === 'object' && 'message' in error) {
            message.error(`保存失败: ${error.message}`);
        } else if (Array.isArray(error) && error.length > 0) {
            // 处理数组形式的错误
            const errorDetails = error.map((err: any) => 
                typeof err === 'object' && err.message ? err.message : String(err)
            ).join(', ');
            message.error(`保存失败: ${errorDetails}`);
        } else {
            message.error(`保存失败: ${String(error)}`);
        }
    } finally {
        saving.value = false;
    }
};

// 删除配置
const deleteConfig = async (config: QuickOptimizationConfig) => {
    if (!config.id) return;

    try {
        await api.quickOptimizationConfigs.delete.mutate(config.id);
        // 不显示消息，由父组件统一处理
        await loadConfigs();
        emit("configs-updated");
    } catch (error) {
        console.error("删除配置失败:", error);
        message.error("删除失败");
    }
};

// 关闭编辑弹窗
const closeEditModal = () => {
    showEditModal.value = false;
    editingConfig.value = null;
    editFormData.value = {
        name: "",
        description: "",
        prompt: "",
        sortOrder: 1,
        enabled: true,
    };
};

// 取消操作
const handleCancel = () => {
    emit("update:show", false);
};

// 监听弹窗显示状态
watch(
    () => props.show,
    (newShow) => {
        if (newShow) {
            // 检查数据库健康状态
            checkDatabaseHealth();
            loadConfigs();
        }
    }
);

// 检查数据库健康状态
const checkDatabaseHealth = async () => {
    try {
        console.log('检查数据库健康状态...');
        // 这里可以添加数据库健康检查逻辑
        // 暂时只是记录日志
    } catch (error) {
        console.error('数据库健康检查失败:', error);
    }
};
</script>

<style scoped></style> 