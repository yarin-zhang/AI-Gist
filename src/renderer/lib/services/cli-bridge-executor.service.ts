/**
 * 本地 CLI 桥接执行器
 *
 * 主进程的 cli-bridge-manager 会把本地 CLI（bin/ai-gist.js）发来的请求通过 IPC
 * 转发到这里。这里维护一张显式的白名单动作表，每个动作都直接调用已有的
 * PromptService / CategoryService 方法（不新写数据库逻辑），因此 CLI 创建/修改的数据
 * 会和应用内其他数据一样触发 emitDataChange，让正在运行的 UI 实时刷新。
 *
 * 出于安全考虑，这里只允许调用下面显式列出的动作，不支持任意代码执行。
 */

import type {
  Category,
  PaginatedResult,
  Prompt,
  PromptFilters,
  PromptVariable,
  PromptWithRelations,
} from '@shared/types/database';
import type { CliBridgeRequest } from '@shared/types/cli-bridge';
import { PromptService } from './prompt.service';
import { CategoryService } from './category.service';

/**
 * 带错误码的桥接错误，便于 CLI 端区分"未找到" / "参数错误" / "未知动作"等情况
 */
export class CliBridgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CliBridgeError';
  }
}

const VARIABLE_TOKEN_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * 根据数字 id 或 UUID 解析出完整的 prompt 记录
 */
async function resolvePromptRef(ref: string): Promise<PromptWithRelations> {
  if (!ref) throw new CliBridgeError('Missing prompt reference', 'INVALID_PARAMS');
  const promptService = PromptService.getInstance();
  const prompt = /^\d+$/.test(ref)
    ? await promptService.getPromptById(parseInt(ref, 10))
    : await promptService.getPromptByUUID(ref);
  if (!prompt) {
    throw new CliBridgeError(`Prompt not found: ${ref}`, 'NOT_FOUND');
  }
  return prompt;
}

/**
 * 根据数字 id、UUID 或分类名称解析出分类记录（CLI 场景下按名称引用更符合直觉）
 */
async function resolveCategoryRef(ref: string): Promise<Category> {
  if (!ref) throw new CliBridgeError('Missing category reference', 'INVALID_PARAMS');
  const categoryService = CategoryService.getInstance();

  if (/^\d+$/.test(ref)) {
    const byId = await categoryService.getCategoryById(parseInt(ref, 10));
    if (byId) return byId;
  } else {
    const byUuid = await categoryService.getCategoryByUUID(ref);
    if (byUuid) return byUuid;
  }

  const byName = await categoryService.getCategoryByName(ref);
  if (byName) return byName;

  throw new CliBridgeError(`Category not found: ${ref}`, 'NOT_FOUND');
}

async function resolveCategoryId(ref: string | undefined | null): Promise<number | undefined> {
  if (ref === undefined || ref === null || ref === '') return undefined;
  const category = await resolveCategoryRef(ref);
  return category.id;
}

/**
 * 从 prompt 内容中提取所有 {{name}} 占位符（去重）
 */
function extractVariableNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(VARIABLE_TOKEN_PATTERN)) {
    names.add(match[1]);
  }
  return Array.from(names);
}

async function listPrompts(params: PromptFilters & { categoryRef?: string }): Promise<PaginatedResult<PromptWithRelations>> {
  const { categoryRef, ...filters } = params ?? {};
  const categoryId = categoryRef !== undefined ? await resolveCategoryId(categoryRef) : filters.categoryId;
  return PromptService.getInstance().getAllPrompts({ ...filters, categoryId });
}

interface CreatePromptParams {
  title: string;
  content: string;
  description?: string;
  categoryRef?: string;
  tags?: string[] | string;
  isFavorite?: boolean;
  isJinjaTemplate?: boolean;
  variables?: Omit<PromptVariable, 'id' | 'uuid' | 'promptId' | 'createdAt' | 'updatedAt'>[];
}

interface UpdatePromptParams {
  ref: string;
  title?: string;
  content?: string;
  description?: string;
  categoryRef?: string | null;
  tags?: string[] | string;
  isFavorite?: boolean;
  isJinjaTemplate?: boolean;
}

async function createPrompt(params: CreatePromptParams): Promise<PromptWithRelations> {
  if (!params?.title || !params?.content) {
    throw new CliBridgeError('"title" and "content" are required', 'INVALID_PARAMS');
  }
  const categoryId = await resolveCategoryId(params.categoryRef);
  return PromptService.getInstance().createPrompt({
    title: params.title,
    content: params.content,
    description: params.description,
    categoryId,
    tags: params.tags ?? [],
    isFavorite: params.isFavorite ?? false,
    useCount: 0,
    isActive: true,
    isJinjaTemplate: params.isJinjaTemplate,
    // Prompt.variables 与 createPrompt 的 variables 参数形状不同，PromptService 的交叉类型
    // 签名无法同时满足两者的静态检查，这里按运行时实际接受的形状显式转换。
    variables: params.variables as unknown as PromptVariable[] | undefined,
  });
}

async function updatePrompt(params: UpdatePromptParams): Promise<PromptWithRelations> {
  const prompt = await resolvePromptRef(params.ref);
  const patch: Partial<Prompt> = {};
  if (params.title !== undefined) patch.title = params.title;
  if (params.content !== undefined) patch.content = params.content;
  if (params.description !== undefined) patch.description = params.description;
  if (params.tags !== undefined) patch.tags = params.tags;
  if (params.isFavorite !== undefined) patch.isFavorite = params.isFavorite;
  if (params.isJinjaTemplate !== undefined) patch.isJinjaTemplate = params.isJinjaTemplate;
  if (params.categoryRef !== undefined) {
    patch.categoryId = params.categoryRef === null ? undefined : await resolveCategoryId(params.categoryRef);
  }
  return PromptService.getInstance().updatePrompt(prompt.id!, patch);
}

async function deletePrompt(params: { ref: string }): Promise<{ success: true }> {
  const prompt = await resolvePromptRef(params.ref);
  await PromptService.getInstance().deletePrompt(prompt.id!);
  return { success: true };
}

async function fillPrompt(params: { ref: string; variables?: Record<string, string> }) {
  const prompt = await resolvePromptRef(params.ref);
  return PromptService.getInstance().fillPromptVariables(prompt.id!, params.variables ?? {});
}

async function listPromptVariables(params: { ref: string }): Promise<PromptVariable[]> {
  const prompt = await resolvePromptRef(params.ref);
  return PromptService.getInstance().getPromptVariablesByPromptId(prompt.id!);
}

interface AddVariableParams {
  ref: string;
  name: string;
  type?: PromptVariable['type'];
  label?: string;
  description?: string;
  defaultValue?: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

async function addPromptVariable(params: AddVariableParams): Promise<PromptVariable> {
  if (!params?.name) {
    throw new CliBridgeError('"name" is required', 'INVALID_PARAMS');
  }
  const prompt = await resolvePromptRef(params.ref);
  return PromptService.getInstance().createPromptVariable({
    promptId: prompt.id!,
    name: params.name,
    type: params.type ?? 'text',
    description: params.description,
    defaultValue: params.defaultValue,
    options: params.options,
    required: params.required ?? false,
    placeholder: params.placeholder,
  });
}

async function removePromptVariable(params: { ref: string; name: string }): Promise<{ success: true }> {
  const prompt = await resolvePromptRef(params.ref);
  const variables = await PromptService.getInstance().getPromptVariablesByPromptId(prompt.id!);
  const target = variables.find(variable => variable.name === params.name);
  if (!target?.id) {
    throw new CliBridgeError(`Variable not found: ${params.name}`, 'NOT_FOUND');
  }
  await PromptService.getInstance().deletePromptVariable(target.id);
  return { success: true };
}

/**
 * "挖空"便捷命令：扫描 content 里所有 {{name}} 占位符，
 * 为尚未定义的变量自动创建默认的文本类型 stub。
 */
async function syncPromptVariables(params: { ref: string }): Promise<{ created: PromptVariable[]; existing: PromptVariable[] }> {
  const prompt = await resolvePromptRef(params.ref);
  const existing = await PromptService.getInstance().getPromptVariablesByPromptId(prompt.id!);
  const existingNames = new Set(existing.map(variable => variable.name));
  const tokenNames = extractVariableNames(prompt.content);

  const created: PromptVariable[] = [];
  for (const name of tokenNames) {
    if (existingNames.has(name)) continue;
    const variable = await PromptService.getInstance().createPromptVariable({
      promptId: prompt.id!,
      name,
      type: 'text',
      required: false,
    });
    created.push(variable);
  }

  return { created, existing };
}

interface CreateCategoryParams {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentRef?: string;
}

async function createCategory(params: CreateCategoryParams): Promise<Category> {
  if (!params?.name) {
    throw new CliBridgeError('"name" is required', 'INVALID_PARAMS');
  }
  const parentId = await resolveCategoryId(params.parentRef);
  return CategoryService.getInstance().createCategory({
    name: params.name,
    description: params.description,
    color: params.color,
    icon: params.icon,
    parentId,
    isActive: true,
  });
}

async function updateCategory(params: {
  ref: string;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}): Promise<Category> {
  const category = await resolveCategoryRef(params.ref);
  const patch: Partial<Category> = {};
  if (params.name !== undefined) patch.name = params.name;
  if (params.description !== undefined) patch.description = params.description;
  if (params.color !== undefined) patch.color = params.color;
  if (params.icon !== undefined) patch.icon = params.icon;
  return CategoryService.getInstance().updateCategory(category.id!, patch);
}

async function deleteCategory(params: { ref: string }): Promise<{ success: true }> {
  const category = await resolveCategoryRef(params.ref);
  await CategoryService.getInstance().deleteCategory(category.id!);
  return { success: true };
}

/**
 * 白名单动作表：key 是 "resource.action"，value 是对应的处理函数。
 * 新增能力时只应该往这里加映射到既有 service 方法的条目，不要在这里新写数据库逻辑。
 */
const actions: Record<string, (params: any) => Promise<any>> = {
  'system.ping': async () => ({ ok: true }),

  'prompt.list': params => listPrompts(params ?? {}),
  'prompt.get': params => resolvePromptRef(params?.ref),
  'prompt.create': params => createPrompt(params),
  'prompt.update': params => updatePrompt(params),
  'prompt.delete': params => deletePrompt(params),
  'prompt.fill': params => fillPrompt(params),

  'prompt.variable.list': params => listPromptVariables(params),
  'prompt.variable.add': params => addPromptVariable(params),
  'prompt.variable.remove': params => removePromptVariable(params),
  'prompt.variable.sync': params => syncPromptVariables(params),

  'category.list': () => CategoryService.getInstance().getAllCategories(),
  'category.create': params => createCategory(params),
  'category.update': params => updateCategory(params),
  'category.delete': params => deleteCategory(params),

  'stats.get': () => PromptService.getInstance().getPromptStatistics(),
};

/**
 * 执行一个白名单动作并返回结果，未知动作或业务错误都以抛出异常的形式表达。
 * 单独导出这个函数是为了让单元测试可以直接调用白名单表，而不必经过 IPC/window.electronAPI。
 */
export async function dispatchCliBridgeAction(action: string, params: any): Promise<any> {
  const actionHandler = actions[action];
  if (!actionHandler) {
    throw new CliBridgeError(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
  }
  return actionHandler(params ?? {});
}

async function handleRequest(request: CliBridgeRequest): Promise<void> {
  const cliBridge = window.electronAPI?.cliBridge;
  if (!cliBridge) return;

  try {
    const result = await dispatchCliBridgeAction(request.action, request.params);
    cliBridge.sendInvokeResponse({ id: request.id, ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliBridgeError ? error.code : 'INTERNAL_ERROR';
    cliBridge.sendInvokeResponse({ id: request.id, ok: false, error: { message, code } });
  }
}

/**
 * 在渲染进程启动时调用一次即可。Web/移动端构建没有 window.electronAPI.cliBridge，
 * 这里会直接跳过，不影响其他平台。
 * @returns 取消监听的函数
 */
export function initializeCliBridgeExecutor(): () => void {
  const noop = () => undefined;
  const cliBridge = typeof window !== 'undefined' ? window.electronAPI?.cliBridge : undefined;
  if (!cliBridge) return noop;
  return cliBridge.onInvokeRequest(request => { void handleRequest(request); });
}
