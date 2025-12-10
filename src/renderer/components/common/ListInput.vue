<template>
  <div class="list-input-container">
    <div v-for="(item, index) in localValue" :key="index" class="list-input-item">
      <n-input
        v-model:value="localValue[index]"
        placeholder="请输入内容"
        @update:value="handleUpdate"
        class="flex-input"
      />
      <n-button quaternary circle type="error" @click="removeItem(index)">
        <template #icon>
          <n-icon><Trash /></n-icon>
        </template>
      </n-button>
    </div>
    <n-button dashed block @click="addItem">
      <template #icon>
        <n-icon><Plus /></n-icon>
      </template>
      添加一项
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { NSpace, NInput, NButton, NIcon } from 'naive-ui';
import { Trash, Plus } from '@vicons/tabler';

const props = defineProps<{
  value?: string[];
}>();

const emit = defineEmits<{
  (e: 'update:value', value: string[]): void;
}>();

const localValue = ref<string[]>([]);

watch(
  () => props.value,
  (newValue) => {
    if (newValue && Array.isArray(newValue)) {
      localValue.value = [...newValue];
    } else {
      localValue.value = [];
    }
  },
  { immediate: true, deep: true }
);

const handleUpdate = () => {
  emit('update:value', [...localValue.value]);
};

const addItem = () => {
  localValue.value.push('');
  handleUpdate();
};

const removeItem = (index: number) => {
  localValue.value.splice(index, 1);
  handleUpdate();
};
</script>

<style scoped>
.list-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.list-input-item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.flex-input {
  flex: 1;
}
</style>
