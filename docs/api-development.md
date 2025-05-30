# API 接口开发指南

本指南介绍如何使用 tRPC 开发类型安全的 API 接口。

## 1. tRPC 基础概念

### 1.1 核心组件

- **Router** - 路由器，组织相关的 API 端点
- **Procedure** - 过程，单个 API 端点的实现
- **Input Validation** - 输入验证，使用 Zod 进行数据校验
- **Context** - 上下文，在请求之间共享数据

### 1.2 过程类型

```typescript
// Query - 获取数据（GET 请求语义）
const getUser = publicProcedure
  .input(z.number())
  .query(async ({ input }) => {
    return await getUserById(input);
  });

// Mutation - 修改数据（POST/PUT/DELETE 请求语义）
const createUser = publicProcedure
  .input(userSchema)
  .mutation(async ({ input }) => {
    return await createUser(input);
  });
```

## 2. 开发新接口的步骤

### 2.1 第一步：定义数据验证 Schema

在 `src/main/trpc.ts` 中添加 Zod 验证 schema：

```typescript
import { z } from 'zod';

// 创建分类的输入验证
const createCategorySchema = z.object({
  name: z.string().min(1, '分类名称不能为空').max(50, '分类名称过长'),
  description: z.string().optional(),
});

// 更新分类的输入验证
const updateCategorySchema = z.object({
  id: z.number().positive('ID 必须为正数'),
  data: z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().optional(),
  }),
});

// 查询参数验证
const getCategoriesSchema = z.object({
  page: z.number().positive().default(1),
  limit: z.number().positive().max(100).default(10),
  search: z.string().optional(),
});
```

### 2.2 第二步：在数据库服务中添加方法

在 `src/main/database.ts` 中添加对应的数据库操作：

```typescript
export class DatabaseService {
  // 创建分类
  async createCategory(data: { name: string; description?: string }) {
    return this.prisma.category.create({
      data,
      include: {
        posts: true,
      },
    });
  }

  // 获取分类列表（支持分页和搜索）
  async getCategories(params: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {};

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        include: {
          posts: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: categories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // 更新分类
  async updateCategory(id: number, data: { name?: string; description?: string }) {
    return this.prisma.category.update({
      where: { id },
      data,
      include: {
        posts: true,
      },
    });
  }

  // 删除分类
  async deleteCategory(id: number) {
    // 检查是否有关联的文章
    const categoryWithPosts = await this.prisma.category.findUnique({
      where: { id },
      include: {
        posts: true,
      },
    });

    if (categoryWithPosts?.posts.length) {
      throw new Error('无法删除包含文章的分类');
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }
}
```

### 2.3 第三步：定义 tRPC 路由

在 `src/main/trpc.ts` 的 `appRouter` 中添加新的路由：

```typescript
export const appRouter = router({
  // ...existing routes...

  // 分类相关路由
  categories: router({
    // 创建分类
    create: publicProcedure
      .input(createCategorySchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.createCategory(input);
      }),

    // 获取分类列表
    getAll: publicProcedure
      .input(getCategoriesSchema)
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getCategories(input);
      }),

    // 根据 ID 获取分类
    getById: publicProcedure
      .input(z.number().positive())
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        const category = await dbService.getCategoryById(input);
        if (!category) {
          throw new Error('Category not found');
        }
        return category;
      }),

    // 更新分类
    update: publicProcedure
      .input(updateCategorySchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        try {
          return await dbService.updateCategory(input.id, input.data);
        } catch (error) {
          throw new Error('Failed to update category');
        }
      }),

    // 删除分类
    delete: publicProcedure
      .input(z.number().positive())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        try {
          return await dbService.deleteCategory(input);
        } catch (error: any) {
          throw new Error(error.message || 'Failed to delete category');
        }
      }),
  }),
});
```

### 2.4 第四步：在前端使用接口

在 Vue 组件中使用新的 API：

```vue
<template>
  <div>
    <h2>分类管理</h2>
    
    <!-- 创建分类表单 -->
    <n-form @submit="handleCreate">
      <n-form-item label="分类名称">
        <n-input v-model:value="newCategory.name" placeholder="请输入分类名称" />
      </n-form-item>
      <n-form-item label="描述">
        <n-input v-model:value="newCategory.description" type="textarea" placeholder="请输入描述" />
      </n-form-item>
      <n-button type="primary" @click="handleCreate">创建分类</n-button>
    </n-form>

    <!-- 分类列表 -->
    <n-data-table
      :columns="columns"
      :data="categories.data"
      :loading="loading"
      :pagination="paginationProps"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { NForm, NFormItem, NInput, NButton, NDataTable, useMessage } from 'naive-ui';

const message = useMessage();

// 响应式数据
const loading = ref(false);
const newCategory = reactive({
  name: '',
  description: '',
});

const categories = ref({
  data: [],
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
});

// 表格列定义
const columns = [
  { title: 'ID', key: 'id' },
  { title: '名称', key: 'name' },
  { title: '描述', key: 'description' },
  { title: '文章数量', key: 'posts', render: (row: any) => row.posts.length },
  {
    title: '操作',
    key: 'actions',
    render: (row: any) => [
      h('button', { onClick: () => handleEdit(row) }, '编辑'),
      h('button', { onClick: () => handleDelete(row.id) }, '删除'),
    ],
  },
];

// 分页配置
const paginationProps = computed(() => ({
  page: categories.value.pagination.page,
  pageSize: categories.value.pagination.limit,
  itemCount: categories.value.pagination.total,
  onUpdatePage: (page: number) => {
    categories.value.pagination.page = page;
    loadCategories();
  },
}));

// 方法
const loadCategories = async () => {
  try {
    loading.value = true;
    const result = await window.electronAPI.trpc.categories.getAll.query({
      page: categories.value.pagination.page,
      limit: categories.value.pagination.limit,
    });
    categories.value = result;
  } catch (error) {
    message.error('加载分类失败');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleCreate = async () => {
  if (!newCategory.name.trim()) {
    message.warning('请输入分类名称');
    return;
  }

  try {
    await window.electronAPI.trpc.categories.create.mutate({
      name: newCategory.name,
      description: newCategory.description || undefined,
    });
    
    message.success('创建成功');
    newCategory.name = '';
    newCategory.description = '';
    loadCategories();
  } catch (error) {
    message.error('创建失败');
    console.error(error);
  }
};

const handleDelete = async (id: number) => {
  try {
    await window.electronAPI.trpc.categories.delete.mutate(id);
    message.success('删除成功');
    loadCategories();
  } catch (error: any) {
    message.error(error.message || '删除失败');
    console.error(error);
  }
};

// 生命周期
onMounted(() => {
  loadCategories();
});
</script>
```

## 3. 高级特性

### 3.1 错误处理

```typescript
import { TRPCError } from '@trpc/server';

const deleteUser = publicProcedure
  .input(z.number())
  .mutation(async ({ input }) => {
    const user = await dbService.getUserById(input);
    
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: '用户不存在',
      });
    }

    if (user.posts.length > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: '无法删除有文章的用户',
      });
    }

    return await dbService.deleteUser(input);
  });
```

### 3.2 中间件

```typescript
// 创建中间件
const authMiddleware = t.middleware(({ next }) => {
  // 这里可以添加认证逻辑
  return next();
});

// 使用中间件的过程
const protectedProcedure = publicProcedure.use(authMiddleware);

const sensitiveOperation = protectedProcedure
  .input(someSchema)
  .mutation(async ({ input }) => {
    // 只有通过认证的请求才能到达这里
  });
```

### 3.3 批量操作

```typescript
const batchCreateUsers = publicProcedure
  .input(z.array(createUserSchema))
  .mutation(async ({ input }) => {
    if (!dbService) throw new Error('Database not initialized');
    
    // 使用事务确保数据一致性
    return await dbService.prisma.$transaction(
      input.map(userData => 
        dbService.prisma.user.create({ data: userData })
      )
    );
  });
```

### 3.4 订阅（实时更新）

```typescript
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

const userSubscription = publicProcedure
  .subscription(() => {
    return observable<User>((emit) => {
      const onUserChange = (user: User) => emit.next(user);
      
      eventEmitter.on('userChanged', onUserChange);
      
      return () => {
        eventEmitter.off('userChanged', onUserChange);
      };
    });
  });
```

## 4. 最佳实践

### 4.1 路由组织

```typescript
// 按功能模块组织路由
export const appRouter = router({
  // 用户管理
  users: userRouter,
  // 文章管理
  posts: postRouter,
  // 分类管理
  categories: categoryRouter,
  // 系统设置
  settings: settingsRouter,
});

// 在单独文件中定义子路由
const userRouter = router({
  create: /* ... */,
  getAll: /* ... */,
  getById: /* ... */,
  update: /* ... */,
  delete: /* ... */,
});
```

### 4.2 输入验证最佳实践

```typescript
// 复用通用验证 schema
const idSchema = z.number().positive('ID 必须为正数');
const paginationSchema = z.object({
  page: z.number().positive().default(1),
  limit: z.number().positive().max(100).default(10),
});

// 使用 transform 进行数据转换
const emailSchema = z.string()
  .email('邮箱格式无效')
  .transform(email => email.toLowerCase());

// 条件验证
const userSchema = z.object({
  name: z.string().min(1),
  age: z.number().optional(),
  email: z.string().email(),
}).refine(data => {
  if (data.age && data.age < 13) {
    return data.email.endsWith('@parent.com');
  }
  return true;
}, {
  message: '未成年用户必须使用家长邮箱',
});
```

### 4.3 性能优化

```typescript
// 使用 select 只获取需要的字段
const getUsers = publicProcedure
  .query(async () => {
    return await dbService.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        // 不包含大字段
      },
    });
  });

// 使用索引优化查询
const searchPosts = publicProcedure
  .input(z.object({
    query: z.string(),
    categoryId: z.number().optional(),
  }))
  .query(async ({ input }) => {
    return await dbService.prisma.post.findMany({
      where: {
        AND: [
          {
            OR: [
              { title: { contains: input.query } },
              { content: { contains: input.query } },
            ],
          },
          input.categoryId ? { categoryId: input.categoryId } : {},
        ],
      },
      // 利用数据库索引
      orderBy: { createdAt: 'desc' },
    });
  });
```

## 5. 调试和测试

### 5.1 日志记录

```typescript
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({
  transformer: /* ... */,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
          ? error.cause.flatten()
          : null,
      },
    };
  },
});
```

### 5.2 错误监控

```typescript
const loggedProcedure = publicProcedure.use(({ next, path, input }) => {
  console.log(`调用 API: ${path}`, { input });
  
  const start = Date.now();
  const result = next();
  
  result.then(() => {
    console.log(`API ${path} 执行成功，耗时: ${Date.now() - start}ms`);
  }).catch((error) => {
    console.error(`API ${path} 执行失败:`, error);
  });
  
  return result;
});
```

## 下一步

现在你已经掌握了 tRPC 接口开发的基础知识，可以开始：

1. 为现有的数据模型创建完整的 CRUD 接口
2. 实现复杂的业务逻辑
3. 添加认证和权限控制
4. 优化查询性能
5. 添加实时功能（如果需要）
