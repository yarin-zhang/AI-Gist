<script setup lang="ts">
import { ref } from 'vue'
import {
    NCard,
    NButton,
    NH1,
    NP,
    NSpace,
    NFlex,
    NGrid,
    NGridItem,
    NTag,
    NAlert,
    NIcon
} from 'naive-ui'
import { InfoCircle, Code, Rocket } from '@vicons/tabler'
import viteLogo from '../assets/images/vite.svg'
import vueLogo from '../assets/images/vue.svg'

defineProps({
    msg: String,
})

const count = ref(0)
</script>

<template>
    <NFlex vertical :size="24">
        <!-- 标题区域 -->
        <NFlex vertical align="center" :size="16">
            <NH1>{{ msg }}</NH1>

            <NFlex justify="center" :size="32">
                <a href="https://vitejs.dev" target="_blank">
                    <img :src="viteLogo" style="height: 4em" alt="Vite logo" />
                </a>
                <a href="https://vuejs.org/" target="_blank">
                    <img :src="vueLogo" style="height: 4em" alt="Vue logo" />
                </a>
            </NFlex>
        </NFlex>

        <!-- 欢迎提示 -->
        <NAlert type="success" show-icon>
            <template #icon>
                <NIcon>
                    <Rocket />
                </NIcon>
            </template>
            <template #header>欢迎使用 Electron Starter 模板！</template>
            这是一个集成了 Vue 3 + Vite + Electron + Prisma + tRPC 的现代化开发模板，
            为你提供了完整的全栈桌面应用开发解决方案。
        </NAlert>

        <!-- 功能演示区域 -->
        <NFlex vertical :size="16">
            <NCard title="🎯 计数器演示">
                <NFlex vertical align="center" :size="12">
                    <NButton type="primary" size="large" @click="count++">
                        点击次数: {{ count }}
                    </NButton>
                    <NP style="margin: 0;">
                        编辑 <NTag type="info">components/HelloWorld.vue</NTag> 来测试热重载功能
                    </NP>
                </NFlex>
            </NCard>
        </NFlex>

        <!-- 技术栈展示 -->
        <NCard title="🚀 技术栈">
            <NFlex vertical :size="16">
                <NAlert type="default" show-icon>
                    <template #icon>
                        <NIcon>
                            <InfoCircle />
                        </NIcon>
                    </template>
                    本模板整合了现代前端和桌面应用开发的最佳实践，提供了完整的开发工具链。
                </NAlert>

                <NGrid cols="1 s:2 m:3" responsive="screen" :x-gap="16" :y-gap="16">
                    <NGridItem>
                        <NCard title="⚡ Vite" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="primary">构建工具</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">极速的前端构建工具</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                    <NGridItem>
                        <NCard title="🖖 Vue 3" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="success">前端框架</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">渐进式 JavaScript 框架</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                    <NGridItem>
                        <NCard title="⚡ Electron" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="info">桌面应用</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">跨平台桌面应用框架</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                    <NGridItem>
                        <NCard title="🔗 tRPC" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="warning">通信协议</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">端到端类型安全的 RPC</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                    <NGridItem>
                        <NCard title="🗄️ Prisma" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="error">数据库 ORM</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">现代化数据库工具包</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                    <NGridItem>
                        <NCard title="📘 TypeScript" size="small" hoverable>
                            <template #header-extra>
                                <NTag size="small" type="default">类型系统</NTag>
                            </template>
                            <NFlex vertical :size="8">
                                <NP style="margin: 0;">类型安全的 JavaScript</NP>
                            </NFlex>
                        </NCard>
                    </NGridItem>
                </NGrid>
            </NFlex>
        </NCard>
    </NFlex>
</template>
