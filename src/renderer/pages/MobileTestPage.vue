<template>
  <ion-app>
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>测试页面</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <div style="padding: 20px;">
          <h1>移动端测试</h1>
          <p>如果你能看到这个，说明 Ionic 正常工作</p>
          <p>平台: {{ platform }}</p>
        </div>
      </ion-content>
    </ion-page>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue'
import { PlatformDetector } from '@shared/platform'

const platform = PlatformDetector.getPlatform()
console.log('测试页面已加载，平台:', platform)
</script>
