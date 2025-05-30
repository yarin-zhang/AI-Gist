import type { AppRouter } from '../../main/trpc';

// 创建一个简化的 tRPC 客户端，手动实现路由调用
function createClient() {
  return {
    users: {
      create: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('users.create', input);
        }
      },
      getAll: {
        query: async () => {
          return window.electronAPI.trpc.query('users.getAll');
        }
      },
      getById: {
        query: async (id: number) => {
          return window.electronAPI.trpc.query('users.getById', id);
        }
      },
      update: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('users.update', input);
        }
      },
      delete: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('users.delete', id);
        }
      }
    },
    posts: {
      create: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('posts.create', input);
        }
      },
      getAll: {
        query: async () => {
          return window.electronAPI.trpc.query('posts.getAll');
        }
      },
      getById: {
        query: async (id: number) => {
          return window.electronAPI.trpc.query('posts.getById', id);
        }
      },
      update: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('posts.update', input);
        }
      },
      delete: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('posts.delete', id);
        }
      }
    }
  };
}

// 创建 tRPC 客户端
export const trpc = createClient();

// 导出类型
export type { AppRouter } from '../../main/trpc';
