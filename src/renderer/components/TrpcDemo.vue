<template>
  <NFlex vertical :size="24">
    <!-- 页面标题 -->
    <NCard>
      <template #header>
        <NFlex align="center" :size="12">
          <NIcon size="24" color="#18a058">
            <Server />
          </NIcon>
          <span>tRPC 数据库演示</span>
        </NFlex>
      </template>
      
      <NFlex vertical :size="16">
        <NAlert type="info" show-icon>
          <template #header>tRPC 简介</template>
          这个演示展示了如何使用 tRPC 进行类型安全的全栈开发，实现前后端之间的无缝通信。
        </NAlert>
        
        <NAlert type="success" show-icon>
          <template #header>tRPC 优势</template>
          与传统的 Electron IPC 通信相比，tRPC 提供了端到端的类型安全、自动代码生成和更好的开发体验。
          所有的 API 调用都有完整的 TypeScript 类型支持。
        </NAlert>
      </NFlex>
    </NCard>
    
    <!-- 用户管理 -->
    <NCard title="👤 用户管理">
      <NFlex vertical :size="16">
        <!-- 创建用户表单 -->
        <NCard title="创建新用户" size="small" hoverable>
          <NFlex vertical :size="12">
            <NInput 
              v-model:value="newUser.email"
              placeholder="邮箱地址（必填）"
              clearable
            />
            <NInput 
              v-model:value="newUser.name"
              placeholder="姓名（可选）"
              clearable
            />
            <NFlex justify="end">
              <NButton 
                type="primary"
                :disabled="!newUser.email"
                :loading="loading.createUser"
                @click="createUser"
              >
                创建用户
              </NButton>
            </NFlex>
          </NFlex>
        </NCard>
        
        <!-- 用户列表 -->
        <NCard title="用户列表" size="small">
          <template #header-extra>
            <NButton @click="loadUsers" :loading="loading.users" secondary size="small">
              刷新列表
            </NButton>
          </template>
          
          <NSpin :show="loading.users">
            <NEmpty v-if="users.length === 0" description="暂无用户数据" />
            <NFlex v-else vertical :size="12">
              <NCard 
                v-for="user in users" 
                :key="user.id" 
                size="small" 
                hoverable
                style="border: 1px solid #e0e0e6;"
              >
                <NFlex justify="space-between" align="center">
                  <NFlex vertical :size="4">
                    <NFlex align="center" :size="8">
                      <NText strong>{{ user.name || '未设置姓名' }}</NText>
                      <NTag size="small" type="primary">ID: {{ user.id }}</NTag>
                    </NFlex>
                    <NText depth="3">{{ user.email }}</NText>
                    <NText depth="3" style="font-size: 12px;">
                      创建时间: {{ new Date(user.createdAt).toLocaleString() }}
                    </NText>
                  </NFlex>
                  
                  <NFlex :size="8">
                    <NButton 
                      size="small" 
                      @click="editUser(user)"
                      :disabled="loading.updateUser"
                    >
                      编辑
                    </NButton>
                    <NButton 
                      size="small" 
                      type="error" 
                      @click="deleteUser(user.id)"
                      :loading="loading.deleteUser === user.id"
                    >
                      删除
                    </NButton>
                  </NFlex>
                </NFlex>
              </NCard>
            </NFlex>
          </NSpin>
        </NCard>
      </NFlex>
    </NCard>

    <!-- 文章管理 -->
    <NCard title="📝 文章管理">
      <NFlex vertical :size="16">
        <!-- 创建文章表单 -->
        <NCard title="创建新文章" size="small" hoverable>
          <NFlex vertical :size="12">
            <NInput 
              v-model:value="newPost.title"
              placeholder="文章标题（必填）"
              clearable
            />
            <NInput 
              v-model:value="newPost.content"
              placeholder="文章内容（可选）"
              type="textarea"
              :rows="3"
              clearable
            />
            <NSelect
              v-model:value="newPost.authorId"
              :options="userOptions"
              placeholder="选择作者"
              clearable
            />
            <NFlex justify="end">
              <NButton 
                type="primary"
                :disabled="!newPost.title || !newPost.authorId"
                :loading="loading.createPost"
                @click="createPost"
              >
                创建文章
              </NButton>
            </NFlex>
          </NFlex>
        </NCard>
        
        <!-- 文章列表 -->
        <NCard title="文章列表" size="small">
          <template #header-extra>
            <NButton @click="loadPosts" :loading="loading.posts" secondary size="small">
              刷新列表
            </NButton>
          </template>
          
          <NSpin :show="loading.posts">
            <NEmpty v-if="posts.length === 0" description="暂无文章数据" />
            <NFlex v-else vertical :size="12">
              <NCard 
                v-for="post in posts" 
                :key="post.id" 
                size="small" 
                hoverable
                style="border: 1px solid #e0e0e6;"
              >
                <NFlex justify="space-between" align="center">
                  <NFlex vertical :size="4" style="flex: 1;">
                    <NFlex align="center" :size="8">
                      <NText strong>{{ post.title }}</NText>
                      <NTag size="small" :type="post.published ? 'success' : 'default'">
                        {{ post.published ? '已发布' : '草稿' }}
                      </NTag>
                    </NFlex>
                    <NText depth="3" v-if="post.content">{{ post.content }}</NText>
                    <NFlex align="center" :size="8">
                      <NText depth="3" style="font-size: 12px;">
                        作者: {{ post.author?.name || post.author?.email }}
                      </NText>
                      <NText depth="3" style="font-size: 12px;">
                        创建时间: {{ new Date(post.createdAt).toLocaleString() }}
                      </NText>
                    </NFlex>
                  </NFlex>
                  
                  <NFlex :size="8">
                    <NButton 
                      size="small" 
                      :type="post.published ? 'default' : 'primary'"
                      @click="togglePublish(post)"
                      :loading="loading.updatePost === post.id"
                    >
                      {{ post.published ? '取消发布' : '发布' }}
                    </NButton>
                    <NButton 
                      size="small" 
                      type="error" 
                      @click="deletePost(post.id)"
                      :loading="loading.deletePost === post.id"
                    >
                      删除
                    </NButton>
                  </NFlex>
                </NFlex>
              </NCard>
            </NFlex>
          </NSpin>
        </NCard>
      </NFlex>
    </NCard>

    <!-- 编辑用户模态框 -->
    <NModal v-model:show="showEditModal" preset="card" title="编辑用户" style="width: 400px;">
      <NFlex vertical :size="16" v-if="editingUser">
        <NInput 
          v-model:value="editingUser.email"
          placeholder="邮箱地址"
        />
        <NInput 
          v-model:value="editingUser.name"
          placeholder="姓名"
        />
      </NFlex>
      
      <template #footer>
        <NFlex justify="end" :size="12">
          <NButton @click="closeEditModal">取消</NButton>
          <NButton 
            type="primary" 
            @click="updateUser"
            :loading="loading.updateUser"
          >
            保存
          </NButton>
        </NFlex>
      </template>
    </NModal>

    <!-- tRPC 功能说明 -->
    <NCard title="🚀 tRPC 特性">
      <NFlex vertical :size="16">
        <NAlert type="success" show-icon>
          <template #header>类型安全的全栈开发</template>
          tRPC 为你的应用提供端到端的类型安全，确保前后端接口的一致性，减少运行时错误。
        </NAlert>
        
        <NAlert type="warning" show-icon>
          <template #header>与传统 IPC 的区别</template>
          传统的 Electron IPC 需要手动定义通信协议，而 tRPC 自动生成类型定义，提供更好的开发体验。
        </NAlert>
        
        <NCard title="主要优势" size="small">
          <NFlex vertical :size="8">
            <NFlex align="center" :size="8">
              <NIcon color="#18a058">
                <CircleCheck />
              </NIcon>
              <NText>自动类型推断，无需手动编写接口类型</NText>
            </NFlex>
            <NFlex align="center" :size="8">
              <NIcon color="#18a058">
                <CircleCheck />
              </NIcon>
              <NText>编译时类型检查，减少运行时错误</NText>
            </NFlex>
            <NFlex align="center" :size="8">
              <NIcon color="#18a058">
                <CircleCheck />
              </NIcon>
              <NText>优秀的开发体验，支持自动补全和重构</NText>
            </NFlex>
            <NFlex align="center" :size="8">
              <NIcon color="#18a058">
                <CircleCheck />
              </NIcon>
              <NText>内置请求验证和错误处理机制</NText>
            </NFlex>
          </NFlex>
        </NCard>
      </NFlex>
    </NCard>
  </NFlex>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { 
  NSpace, NCard, NButton, NInput, NSelect, NTag, NText, NP, 
  NSpin, NEmpty, NModal, NDivider, NList, NListItem, NAlert, NIcon, NFlex
} from 'naive-ui'
import { 
  Server, 
  CircleCheck 
} from '@vicons/tabler'
import { trpc } from '../lib/trpc'

// 响应式数据
const users = ref<any[]>([])
const posts = ref<any[]>([])

const loading = ref({
  users: false,
  posts: false,
  createUser: false,
  createPost: false,
  updateUser: false,
  updatePost: null as number | null,
  deleteUser: null as number | null,
  deletePost: null as number | null,
})

const newUser = ref({
  email: '',
  name: ''
})

const newPost = ref({
  title: '',
  content: '',
  authorId: null as number | null
})

const editingUser = ref<any>(null)

// 计算属性：用户选项
const userOptions = computed(() => 
  users.value.map(user => ({
    label: user.name || user.email,
    value: user.id
  }))
)

// 计算属性：编辑模态框显示状态
const showEditModal = computed({
  get: () => !!editingUser.value,
  set: (value: boolean) => {
    if (!value) editingUser.value = null
  }
})

// 用户操作
async function createUser() {
  try {
    if (!newUser.value.email) return
    
    loading.value.createUser = true
    await trpc.users.create.mutate({
      email: newUser.value.email,
      name: newUser.value.name || undefined
    })
    
    newUser.value = { email: '', name: '' }
    await loadUsers()
    window.$message?.success('用户创建成功！')
  } catch (error) {
    console.error('创建用户失败:', error)
    window.$message?.error('创建用户失败: ' + (error as Error).message)
  } finally {
    loading.value.createUser = false
  }
}

async function loadUsers() {
  try {
    loading.value.users = true
    users.value = await trpc.users.getAll.query()
  } catch (error) {
    console.error('加载用户失败:', error)
    window.$message?.error('加载用户失败')
  } finally {
    loading.value.users = false
  }
}

function editUser(user: any) {
  editingUser.value = { ...user }
}

async function updateUser() {
  try {
    if (!editingUser.value) return
    
    loading.value.updateUser = true
    await trpc.users.update.mutate({
      id: editingUser.value.id,
      data: {
        email: editingUser.value.email,
        name: editingUser.value.name
      }
    })
    
    editingUser.value = null
    await loadUsers()
    window.$message?.success('用户更新成功！')
  } catch (error) {
    console.error('更新用户失败:', error)
    window.$message?.error('更新用户失败: ' + (error as Error).message)
  } finally {
    loading.value.updateUser = false
  }
}

async function deleteUser(id: number) {
  try {
    if (!window.confirm('确定要删除这个用户吗？这将同时删除其所有文章。')) return
    
    loading.value.deleteUser = id
    await trpc.users.delete.mutate(id)
    await loadUsers()
    await loadPosts()
    window.$message?.success('用户删除成功！')
  } catch (error) {
    console.error('删除用户失败:', error)
    window.$message?.error('删除用户失败: ' + (error as Error).message)
  } finally {
    loading.value.deleteUser = null
  }
}

function closeEditModal() {
  editingUser.value = null
}

// 文章操作
async function createPost() {
  try {
    if (!newPost.value.title || !newPost.value.authorId) return
    
    loading.value.createPost = true
    await trpc.posts.create.mutate({
      title: newPost.value.title,
      content: newPost.value.content || undefined,
      authorId: newPost.value.authorId
    })
    
    newPost.value = { title: '', content: '', authorId: null }
    await loadPosts()
    window.$message?.success('文章创建成功！')
  } catch (error) {
    console.error('创建文章失败:', error)
    window.$message?.error('创建文章失败: ' + (error as Error).message)
  } finally {
    loading.value.createPost = false
  }
}

async function loadPosts() {
  try {
    loading.value.posts = true
    posts.value = await trpc.posts.getAll.query()
  } catch (error) {
    console.error('加载文章失败:', error)
    window.$message?.error('加载文章失败')
  } finally {
    loading.value.posts = false
  }
}

async function togglePublish(post: any) {
  try {
    loading.value.updatePost = post.id
    await trpc.posts.update.mutate({
      id: post.id,
      data: { published: !post.published }
    })
    await loadPosts()
  } catch (error) {
    window.$message?.error('更新文章状态失败')
  } finally {
    loading.value.updatePost = null
  }
}

async function deletePost(id: number) {
  try {
    if (!window.confirm('确定要删除这篇文章吗？')) return
    
    loading.value.deletePost = id
    await trpc.posts.delete.mutate(id)
    await loadPosts()
    window.$message?.success('文章删除成功！')
  } catch (error) {
    console.error('删除文章失败:', error)
    window.$message?.error('删除文章失败: ' + (error as Error).message)
  } finally {
    loading.value.deletePost = null
  }
}

// 组件挂载时加载数据
onMounted(async () => {
  await Promise.all([loadUsers(), loadPosts()])
})
</script>
