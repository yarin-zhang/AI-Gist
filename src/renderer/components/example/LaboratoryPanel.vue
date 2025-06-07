<template>
  <div class="laboratory-panel">
    <NFlex vertical :size="24">
      <!-- 环境信息 -->
      <NCard title="环境信息" size="small">
        <NFlex vertical :size="8">
          <NText depth="3">开发模式: {{ isDevelopment ? '是' : '否' }}</NText>
          <NText depth="3">当前环境: {{ currentMode }}</NText>
          <NText depth="3">Vite 版本信息可在控制台查看</NText>
        </NFlex>
      </NCard>

      <!-- 组件测试区域 -->
      <NCard title="组件测试" size="small">
        <NFlex vertical :size="16">
          <NText depth="2">测试组件功能</NText>
          
          <!-- 模态框测试 -->
          <div>
            <NText tag="div" depth="3" style="margin-bottom: 8px;">模态框布局测试:</NText>
            <ExampleModalUsage />
          </div>
        </NFlex>
      </NCard>

      <!-- 系统信息 -->
      <NCard title="系统信息" size="small">
        <NFlex vertical :size="12">
          <NText depth="2">获取系统相关信息</NText>
          
          <div>
            <NFlex :size="8">
              <NButton @click="getSystemInfo" size="small" type="primary">获取系统信息</NButton>
              <NButton @click="getAppInfo" size="small" type="info">获取应用信息</NButton>
            </NFlex>
          </div>
        </NFlex>
      </NCard>

      <!-- 测试结果显示 -->
      <NCard v-if="testResult" title="信息结果" size="small">
        <NCode :code="testResult" language="json" />
      </NCard>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NCard,
  NFlex,
  NText,
  NButton,
  NCode,
  useMessage
} from 'naive-ui'
import ExampleModalUsage from '@/components/example/ExampleModalUsage.vue'

const message = useMessage()
const testResult = ref('')

// 环境变量（在 script 中获取，避免模板中的错误）
const isDevelopment = import.meta.env.DEV
const currentMode = import.meta.env.MODE
const nodeEnv = import.meta.env.NODE_ENV

// 获取系统信息
const getSystemInfo = async () => {
  try {
    const info = {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      onLine: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      vendor: navigator.vendor,
      timestamp: new Date().toISOString()
    }
    testResult.value = JSON.stringify(info, null, 2)
    message.success('系统信息获取成功')
  } catch (error) {
    testResult.value = JSON.stringify({ error: String(error) }, null, 2)
    message.error('获取系统信息失败')
  }
}

// 获取应用信息
const getAppInfo = async () => {
  try {
    const info = {
      isDevelopment,
      currentMode,
      nodeEnv,
      location: {
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        protocol: window.location.protocol
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      timestamp: new Date().toISOString()
    }
    testResult.value = JSON.stringify(info, null, 2)
    message.success('应用信息获取成功')
  } catch (error) {
    testResult.value = JSON.stringify({ error: String(error) }, null, 2)
    message.error('获取应用信息失败')
  }
}
</script>

<style scoped>
.laboratory-panel {
  padding: 0;
}
</style>
