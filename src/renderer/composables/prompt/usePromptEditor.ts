import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import { api } from '@/lib/api'
import { jinjaService } from '@/lib/utils/jinja.service'
import {
  createVariable, isVariableConfigured, reconcilePromptVariables, replaceVariableName,
  unwrapVariableOccurrences, type EditablePromptVariable,
} from '@/lib/utils/prompt-template'
import {
  cloneEditorForm, createEditorForm, findDuplicateTitle, generateAutoTitle,
  serializeVariablesForSave, snapshotEditorForm, type PromptEditorForm,
} from '@/lib/utils/prompt-editor'
import { writePromptHistory } from '@/lib/utils/prompt-history'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractJinjaNames = (content: string): string[] => {
  try { return jinjaService.extractVariables(content) } catch { return [] }
}

/**
 * 提示词页的编辑状态：标题、描述、正文、分类、标签、变量定义和附图都在这里，
 * 保存时写版本历史。正文变化时自动补齐或收起变量定义；用户建过、改过名或配置过的
 * 变量即使从正文里删掉也保留在「未使用」里，换回来时设置还在。
 */
export function usePromptEditor(source: Ref<PromptWithRelations | null>) {
  const { t } = useI18n()
  const message = useMessage()

  const form = ref<PromptEditorForm>(createEditorForm(null))
  const saving = ref(false)
  let confirmingTitle = false
  const cleanSnapshot = ref('')
  let cleanVariablelessSnapshot = ''
  let cleanForm: PromptEditorForm = cloneEditorForm(form.value)
  let retainedNames = new Set<string>()
  let variableCache = new Map<string, EditablePromptVariable>()

  const dirty = computed(() => Boolean(cleanSnapshot.value) && snapshotEditorForm(form.value) !== cleanSnapshot.value)

  const markClean = () => {
    cleanSnapshot.value = snapshotEditorForm(form.value)
    cleanVariablelessSnapshot = snapshotEditorForm(form.value, false)
    cleanForm = cloneEditorForm(form.value)
  }

  const retainUnused = (variable: EditablePromptVariable) => retainedNames.has(variable.name) || isVariableConfigured(variable)

  const variablesKey = (variables: EditablePromptVariable[]) => JSON.stringify(variables)

  // 正文变化后对齐变量定义；只是自动补齐、其他字段没动时不算未保存修改
  const syncVariables = () => {
    const { content, isJinjaTemplate } = form.value
    let next: EditablePromptVariable[]
    if (isJinjaTemplate) {
      const existing = new Set(form.value.variables.map(variable => variable.name))
      next = [
        ...form.value.variables,
        ...extractJinjaNames(content)
          .filter(name => !existing.has(name))
          .map(name => ({ name, type: 'str', required: true })),
      ]
    } else {
      const cached = [...variableCache.values()].filter(cachedVariable => (
        !form.value.variables.some(variable => variable.name === cachedVariable.name)
      ))
      next = reconcilePromptVariables(content, [...form.value.variables, ...cached], { retainUnused }).all
    }
    next.forEach(variable => variableCache.set(variable.name, variable))
    if (variablesKey(next) === variablesKey(form.value.variables)) return
    form.value.variables = next
    if (snapshotEditorForm(form.value, false) === cleanVariablelessSnapshot) markClean()
  }

  // 「未使用」变量的记忆只认这份定义：改名、新建、换模板类型留下的旧变量都忘掉
  const resetVariableMemory = (variables: EditablePromptVariable[]) => {
    retainedNames = new Set(variables.map(variable => variable.name))
    variableCache = new Map(variables.map(variable => [variable.name, variable]))
  }

  const load = (prompt: PromptWithRelations | null) => {
    form.value = createEditorForm(prompt)
    resetVariableMemory(form.value.variables)
    markClean()
    syncVariables()
  }

  /** 放弃修改：回到上次保存的状态，这期间改名、新建的变量不留在「未使用」里 */
  const discard = () => {
    const restored = cloneEditorForm(cleanForm)
    resetVariableMemory(restored.variables)
    form.value = restored
  }

  // 外部更新（收藏、使用次数、跨窗口同步）在没有未保存修改时直接换入；有修改时保留用户的编辑
  watch(
    () => [source.value?.id, source.value?.uuid, source.value?.updatedAt ? String(source.value.updatedAt) : ''] as const,
    ([id, uuid], previous) => {
      const sameRecord = previous && id === previous[0] && uuid === previous[1]
      if (sameRecord && dirty.value) return
      load(source.value)
    },
    { immediate: true },
  )

  watch(() => [form.value.content, form.value.isJinjaTemplate], syncVariables)

  const activeVariables = computed(() => {
    if (form.value.isJinjaTemplate) return form.value.variables
    return reconcilePromptVariables(form.value.content, form.value.variables).active
  })

  const unusedVariables = computed(() => {
    if (form.value.isJinjaTemplate) return []
    const active = new Set(activeVariables.value.map(variable => variable.name))
    return form.value.variables.filter(variable => !active.has(variable.name))
  })

  /** 把未保存的编辑叠加到原提示词上，填写视图和复制都用它 */
  const effectivePrompt = computed<PromptWithRelations>(() => ({
    ...(source.value || {
      uuid: 'draft',
      isFavorite: false,
      useCount: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    title: form.value.title,
    description: form.value.description,
    content: form.value.content,
    categoryId: form.value.categoryId ?? undefined,
    tags: form.value.tags,
    variables: form.value.variables as unknown as PromptVariable[],
    isJinjaTemplate: form.value.isJinjaTemplate,
    imageBlobs: form.value.imageBlobs,
  } as PromptWithRelations))

  const nextVariableName = () => {
    const names = new Set(form.value.variables.map(variable => variable.name))
    let index = 1
    while (names.has(t('promptEditor.defaultVariableName', { index }))) index += 1
    return t('promptEditor.defaultVariableName', { index })
  }

  /** 新建一个变量定义并返回名字，调用方负责把占位符插到光标处 */
  const addVariable = (name = nextVariableName()) => {
    if (!form.value.variables.some(variable => variable.name === name)) {
      const variable = form.value.isJinjaTemplate
        ? { name, type: 'str', required: true }
        : createVariable(name)
      form.value.variables = [...form.value.variables, variable]
      variableCache.set(name, variable)
    }
    retainedNames.add(name)
    return name
  }

  const updateVariable = (previousName: string, variable: EditablePromptVariable) => {
    form.value.variables = form.value.variables.map(item => item.name === previousName ? variable : item)
    variableCache.delete(previousName)
    variableCache.set(variable.name, variable)
    retainedNames.delete(previousName)
    retainedNames.add(variable.name)
    if (variable.name === previousName) return
    if (form.value.isJinjaTemplate) {
      const tagPattern = /({[{%][\s\S]*?[}%]})/g
      const namePattern = new RegExp(`\\b${escapeRegExp(previousName)}\\b`, 'g')
      form.value.content = form.value.content.replace(tagPattern, tag => tag.replace(namePattern, variable.name))
    } else {
      form.value.content = replaceVariableName(form.value.content, previousName, variable.name)
    }
  }

  /** 删除变量定义；普通模板里正文中的引用变成普通文字 */
  const removeVariable = (name: string) => {
    variableCache.delete(name)
    retainedNames.delete(name)
    form.value.variables = form.value.variables.filter(variable => variable.name !== name)
    if (!form.value.isJinjaTemplate) form.value.content = unwrapVariableOccurrences(form.value.content, name)
  }

  /** 切换普通模板和 Jinja 模板：两种语法不通用，已有正文会被清空（调用方先确认） */
  const setTemplateType = (jinja: boolean) => {
    if (form.value.isJinjaTemplate === jinja) return
    form.value.isJinjaTemplate = jinja
    form.value.content = ''
    form.value.variables = []
    // 另一种模板的变量（比如 Jinja 的 name:str）不能再被当成「未使用」合并回来
    resetVariableMemory([])
  }

  const addImage = (file: Blob) => {
    form.value.imageBlobs = [...form.value.imageBlobs, file]
  }

  const removeImage = (index: number) => {
    form.value.imageBlobs = form.value.imageBlobs.filter((_, itemIndex) => itemIndex !== index)
  }

  /**
   * 找一条和这个标题完全相同的其他提示词。数据库、同步和命令行都按 id / uuid 区分提示词，
   * 标题允许重复；这里只用来在保存前提醒用户，查不到时不拦着保存。
   */
  const findSameTitle = async (title: string, selfId?: number) => {
    try {
      const response = await api.prompts.getAll.query({ search: title })
      const existing = Array.isArray(response) ? response : response?.data || []
      return findDuplicateTitle(title, existing, selfId)
    } catch (error) {
      console.error('检查标题重复时出错:', error)
      return undefined
    }
  }

  /** 写版本历史（新建记 v1，保存前的内容不在历史里时先补记），规则见 writePromptHistory，移动端共用 */
  const writeHistory = (
    prompt: PromptWithRelations,
    variables: unknown[],
    changeDescription: string,
    previous?: PromptWithRelations,
  ) => writePromptHistory(prompt, variables, changeDescription, {
    previous,
    beforeEditDescription: t('promptHistory.beforeEdit'),
  })

  /**
   * 保存为新版本（已有提示词）或创建提示词（草稿）。
   * changeDescription 会写进版本历史，例如「采纳 AI 修改：补充约束」。
   * 新建或改了标题时，如果已有同名提示词，先交给 confirmDuplicateTitle 让用户决定；
   * 它返回 false 时不保存。标题不会被自动改名。
   */
  const save = async (options: {
    changeDescription?: string
    confirmDuplicateTitle?: (title: string) => Promise<boolean>
  } = {}): Promise<PromptWithRelations | null> => {
    if (!form.value.content.trim()) {
      message.warning(t('promptManagement.contentRequired'))
      return null
    }
    if (saving.value || confirmingTitle) return null
    const existing = source.value
    const fallbackTitle = `${t('promptManagement.prompt')} ${new Date().toLocaleString()}`
    const title = form.value.title.trim() || generateAutoTitle(form.value.content, fallbackTitle)
    const titleChanged = !existing?.id || title !== existing.title
    if (options.confirmDuplicateTitle && titleChanged) {
      // 等用户选择时不算「保存中」，保存按钮不转圈；这期间再按 ⌘S 也不会再问一次
      confirmingTitle = true
      try {
        if (await findSameTitle(title, existing?.id) && !(await options.confirmDuplicateTitle(title))) return null
      } finally {
        confirmingTitle = false
      }
    }
    saving.value = true
    try {
      const variables = serializeVariablesForSave(form.value)
      const data = {
        title,
        description: form.value.description || undefined,
        content: form.value.content,
        categoryId: form.value.categoryId || undefined,
        tags: [...form.value.tags],
        isJinjaTemplate: form.value.isJinjaTemplate,
        variables,
        imageBlobs: [...form.value.imageBlobs],
        isActive: true,
      }

      let saved: PromptWithRelations
      if (existing?.id) {
        saved = await api.prompts.update.mutate({
          id: existing.id,
          // 变量定义在服务层按 uuid 重建，这里只传名字、类型等用户可见的字段
          data: { ...data, isFavorite: existing.isFavorite || false, useCount: existing.useCount || 0 } as never,
        }) as PromptWithRelations
        // 保存成功后再记版本，保存失败不会留下一条没生效的版本
        await writeHistory(
          { ...existing, ...data } as PromptWithRelations,
          variables,
          options.changeDescription || t('promptManagement.editUpdate'),
          existing,
        )
        message.success(t('promptManagement.updateSuccess'))
      } else {
        saved = await api.prompts.create.mutate({
          ...data,
          isFavorite: false,
          useCount: 0,
          uuid: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        } as never) as PromptWithRelations
        await writeHistory({ ...data, id: saved.id } as PromptWithRelations, variables,
          options.changeDescription || t('promptHistory.createdVersion'))
        message.success(t('promptManagement.createSuccess'))
      }
      form.value.title = title
      markClean()
      return saved
    } catch (error) {
      console.error(error)
      message.error(existing?.id ? t('promptManagement.updateFailed') : t('promptManagement.createFailed'))
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    form,
    dirty,
    saving,
    activeVariables,
    unusedVariables,
    effectivePrompt,
    load,
    discard,
    markClean,
    save,
    addVariable,
    updateVariable,
    removeVariable,
    setTemplateType,
    addImage,
    removeImage,
  }
}

export type PromptEditor = ReturnType<typeof usePromptEditor>
