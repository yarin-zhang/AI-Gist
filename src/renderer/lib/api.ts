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
      getAllForTags: {
        query: async () => {
          return databaseService.getAllPromptsForTags();
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
    },
    promptHistories: {
      checkExists: {
        query: async () => {
          return databaseService.checkObjectStoreExists('promptHistories');
        }
      },
      create: {
        mutate: async (input: any) => {
          return databaseService.createPromptHistory(input);
        }
      },
      getByPromptId: {
        query: async (promptId: number) => {
          return databaseService.getPromptHistoryByPromptId(promptId);
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getPromptHistoryById(id);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deletePromptHistory(id);
          return { id };
        }
      },
      deleteByPromptId: {
        mutate: async (promptId: number) => {
          return databaseService.deletePromptHistoriesByPromptId(promptId);
        }
      },
      getLatestVersion: {
        query: async (promptId: number) => {
          return databaseService.getLatestPromptHistoryVersion(promptId);
        }
      }
    },
    aiConfigs: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createAIConfig(input);
        }
      },
      getAll: {
        query: async () => {
          return databaseService.getAllAIConfigs();
        }
      },
      getEnabled: {
        query: async () => {
          return databaseService.getEnabledAIConfigs();
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getAIConfigById(id);
        }
      },
      getByConfigId: {
        query: async (configId: string) => {
          return databaseService.getAIConfigByConfigId(configId);
        }
      },
      getByType: {
        query: async (type: 'openai' | 'ollama') => {
          return databaseService.getAIConfigsByType(type);
        }
      },
      update: {
        mutate: async (input: any) => {
          const { id, data } = input;
          return databaseService.updateAIConfig(id, data);
        }
      },
      updateByConfigId: {
        mutate: async (input: any) => {
          const { configId, data } = input;
          return databaseService.updateAIConfigByConfigId(configId, data);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deleteAIConfig(id);
          return { id };
        }
      },
      deleteByConfigId: {
        mutate: async (configId: string) => {
          const deleted = await databaseService.deleteAIConfigByConfigId(configId);
          return { configId, deleted };
        }
      },
      toggleEnabled: {
        mutate: async (id: number) => {
          return databaseService.toggleAIConfigEnabled(id);
        }
      }
    },
    aiGenerationHistory: {
      create: {
        mutate: async (input: any) => {
          return databaseService.createAIGenerationHistory(input);
        }
      },
      getAll: {
        query: async () => {
          return databaseService.getAllAIGenerationHistory();
        }
      },
      getById: {
        query: async (id: number) => {
          return databaseService.getAIGenerationHistoryById(id);
        }
      },
      getByHistoryId: {
        query: async (historyId: string) => {
          return databaseService.getAIGenerationHistoryByHistoryId(historyId);
        }
      },
      getByConfigId: {
        query: async (configId: string) => {
          return databaseService.getAIGenerationHistoryByConfigId(configId);
        }
      },
      getByStatus: {
        query: async (status: 'success' | 'error') => {
          return databaseService.getAIGenerationHistoryByStatus(status);
        }
      },
      getPaginated: {
        query: async (options?: any) => {
          return databaseService.getAIGenerationHistoryPaginated(options);
        }
      },
      delete: {
        mutate: async (id: number) => {
          await databaseService.deleteAIGenerationHistory(id);
          return { id };
        }
      },
      deleteByHistoryId: {
        mutate: async (historyId: string) => {
          const deleted = await databaseService.deleteAIGenerationHistoryByHistoryId(historyId);
          return { historyId, deleted };
        }
      },
      deleteByConfigId: {
        mutate: async (configId: string) => {
          const deletedCount = await databaseService.deleteAIGenerationHistoryByConfigId(configId);
          return { configId, deletedCount };
        }
      },
      clear: {
        mutate: async () => {
          const deletedCount = await databaseService.clearAIGenerationHistory();
          return { deletedCount };
        }
      },
      getStats: {
        query: async () => {
          return databaseService.getAIGenerationHistoryStats();
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
