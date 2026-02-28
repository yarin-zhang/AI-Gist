<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.prompts') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('mainPage.menu.prompts') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <div class="content-padding">
        <h2>提示词管理</h2>
        <p>移动端提示词列表即将推出...</p>
        <p>这里将显示所有提示词的列表</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, onBeforeMount } from 'vue'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent
} from '@ionic/vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

console.log('📱 [MobilePromptPage] 组件脚本开始执行')

onBeforeMount(() => {
  console.log('📱 [MobilePromptPage] onBeforeMount')
})

onMounted(() => {
  console.log('📱 [MobilePromptPage] onMounted - 提示词页面已挂载')
})
</script>

<style scoped>
.content-padding {
  padding: 16px;
}
</style>
