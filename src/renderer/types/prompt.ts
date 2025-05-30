export interface Category {
  id: number;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    prompts: number;
  };
}

export interface PromptVariable {
  id: number;
  promptId: number;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string;
  defaultValue?: string;
  required: boolean;
  placeholder?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prompt {
  id: number;
  title: string;
  content: string;
  description?: string;
  category?: Category;
  categoryId?: number;
  variables: PromptVariable[];
  tags?: string;
  isFavorite: boolean;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePromptData {
  title: string;
  content: string;
  description?: string;
  categoryId?: number;
  tags?: string;
  variables?: Array<{
    name: string;
    label: string;
    type?: 'text' | 'textarea' | 'select';
    options?: string;
    defaultValue?: string;
    required?: boolean;
    placeholder?: string;
  }>;
}

export interface UpdatePromptData {
  title?: string;
  content?: string;
  description?: string;
  categoryId?: number;
  tags?: string;
  isFavorite?: boolean;
}

export interface CreateCategoryData {
  name: string;
  color?: string;
}

export interface UpdateCategoryData {
  name?: string;
  color?: string;
}

export interface PromptFilters {
  categoryId?: number;
  search?: string;
  tags?: string;
  isFavorite?: boolean;
}
