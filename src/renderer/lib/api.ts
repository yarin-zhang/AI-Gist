import { databaseService } from './db';

// 创建一个数据库客户端，直接使用 IndexedDB
function createApiClient() {
  return {
    users: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createUser(input);
        }
      },
      getAll: {
        query: async () => {
          return databaseService.getAllUsers();
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getUserById(id);
        }
      },
      update: {
        mutate: async (input: any) => {
          const { id, data } = input;
          return databaseService.updateUser(id, data);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deleteUser(id);
          return { id };
        }
      }
    },
    posts: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createPost(input);
        }
      },
      getAll: {
        query: async () => {
          return databaseService.getAllPosts();
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getPostById(id);
        }
      },
      update: {
        mutate: async (input: any) => {
          const { id, data } = input;
          return databaseService.updatePost(id, data);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deletePost(id);
          return { id };
        }
      }
    },
    categories: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createCategory(input);
        }
      },
      getAll: {
        query: async () => {
          return databaseService.getAllCategories();
        }
      },
      update: {
        mutate: async (input: any) => {
          const { id, data } = input;
          return databaseService.updateCategory(id, data);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deleteCategory(id);
          return { id };
        }
      }
    },
    prompts: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createPrompt(input);
        }
      },
      getAll: {
        query: async (filters?: any) => {
          return databaseService.getAllPrompts(filters);
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getPromptById(id);
        }
      },
      update: {
        mutate: async (input: any) => {
          const { id, data } = input;
          return databaseService.updatePrompt(id, data);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deletePrompt(id);
          return { id };
        }
      },
      incrementUseCount: {
        mutate: async (id: number) => {
          return databaseService.incrementPromptUseCount(id);
        }
      },
      decrementUseCount: {
        mutate: async (id: number) => {
          return databaseService.decrementPromptUseCount(id);
        }
      },
      fillVariables: {
        mutate: async (input: any) => {
          const { promptId, variables } = input;
          return databaseService.fillPromptVariables(promptId, variables);
        }
      },
      getFavorites: {
        query: async () => {
          return databaseService.getFavoritePrompts();
        }
      },
      toggleFavorite: {
        mutate: async (id: number) => {
          return databaseService.togglePromptFavorite(id);
        }
      }
    }
  };
}

// 创建数据库客户端，直接使用 IndexedDB
export const api = createApiClient();


// 类型定义（为了兼容性保留）
export type AppRouter = any;
export type DatabaseClient = typeof api;
