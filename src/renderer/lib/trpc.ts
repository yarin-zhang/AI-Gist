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
    },
    categories: {
      create: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('categories.create', input);
        }
      },
      getAll: {
        query: async () => {
          return window.electronAPI.trpc.query('categories.getAll');
        }
      },
      update: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('categories.update', input);
        }
      },
      delete: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('categories.delete', id);
        }
      }
    },
    prompts: {
      create: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('prompts.create', input);
        }
      },
      getAll: {
        query: async (filters?: any) => {
          return window.electronAPI.trpc.query('prompts.getAll', filters);
        }
      },
      getById: {
        query: async (id: number) => {
          return window.electronAPI.trpc.query('prompts.getById', id);
        }
      },
      update: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('prompts.update', input);
        }
      },
      delete: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('prompts.delete', id);
        }
      },
      incrementUseCount: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('prompts.incrementUseCount', id);
        }
      },
      fillVariables: {
        mutate: async (input: any) => {
          return window.electronAPI.trpc.mutate('prompts.fillVariables', input);
        }
      },
      getFavorites: {
        query: async () => {
          return window.electronAPI.trpc.query('prompts.getFavorites');
        }
      },
      toggleFavorite: {
        mutate: async (id: number) => {
          return window.electronAPI.trpc.mutate('prompts.toggleFavorite', id);
        }
      }
    }
  };
}

// 创建 tRPC 客户端
export const trpc = createClient();

// 导出类型
export type { AppRouter } from '../../main/trpc';
