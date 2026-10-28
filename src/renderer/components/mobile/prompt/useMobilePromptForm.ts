import { computed, ref, watch } from 'vue'
import type { PromptWithRelations } from '@shared/types/database'
import { api } from '~/lib/api'
import { jinjaService } from '~/lib/utils/jinja.service'
import {
  createVariable,
  isVariableConfigured,
  parsePromptTemplate,
  reconcilePromptVariables,
  replaceVariableName,
  unwrapVariableOccurrences,
  type EditablePromptVariable,
} from '~/lib/utils/prompt-template'
import {
  createEditorForm,
  serializeVariablesForSave,
  snapshotEditorForm,
  type PromptEditorForm,
} from '~/lib/utils/prompt-editor'
import { writePromptHistory } from '~/lib/utils/prompt-history'
import { autoPromptTitle } from './prompt-meta'

export interface MobilePromptForm extends PromptEditorForm {
  isFavorite: boolean
}

export interface MobilePromptFormSeed {
  title?: string
  description?: string
  content?: string
  tags?: string[]
  categoryId?: number | null
}

const extractJinjaNames = (content: string): string[] => {
  try {
    return jinjaService.extractVariables(content)
  } catch {
    return []
  }
}

const variablesKey = (variables: EditablePromptVariable[]) => JSON.stringify(variables)

/**
 * 移动端新建 / 编辑页的表单状态，规则与桌面端编辑器一致（桌面端的 usePromptEditor 依赖
 * Naive UI 的消息组件，移动端不能直接用）：
 * - 正文变化时自动补齐或收起变量定义；用户建过、改过名或配置过的变量即使从正文里删掉，
 *   也保留在「未使用」里，换回来时设置还在；
 * - 只是自动补齐了变量、其他字段没动时不算未保存修改；
 * - 保存成功后写版本历史，新建时记 v1，和桌面端共用 writePromptHistory。
 */
export function useMobilePromptForm() {
  const source = ref<PromptWithRelations | null>(null)
  const form = ref<MobilePromptForm>({ ...createEditorForm(null), isFavorite: false })
  const cleanSnapshot = ref('')
  let cleanVariablelessSnapshot = ''
  let retainedNames = new Set<string>()
  let variableCache = new Map<string, EditablePromptVariable>()

  const snapshot = (includeVariables = true) => JSON.stringify([
    snapshotEditorForm(form.value, includeVariables),
    form.value.isFavorite,
  ])

  const markClean = () => {
    cleanSnapshot.value = snapshot()
    cleanVariablelessSnapshot = snapshot(false)
  }

  const dirty = computed(() => Boolean(cleanSnapshot.value) && snapshot() !== cleanSnapshot.value)

  const retainUnused = (variable: EditablePromptVariable) => retainedNames.has(variable.name) || isVariableConfigured(variable)

  // 正文变化后对齐变量定义
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
    if (snapshot(false) === cleanVariablelessSnapshot) markClean()
  }

  /**
   * 载入提示词（新建时传 null）。seed 是从 AI 生成页带过来的草稿：
   * 先按空表单记下「干净」状态，再填入草稿，这样没保存就离开时会提示。
   */
  const load = (prompt: PromptWithRelations | null, seed?: MobilePromptFormSeed | null) => {
    source.value = prompt
    form.value = { ...createEditorForm(prompt), isFavorite: Boolean(prompt?.isFavorite) }
    retainedNames = new Set(form.value.variables.map(variable => variable.name))
    variableCache = new Map(form.value.variables.map(variable => [variable.name, variable]))
    markClean()
    syncVariables()
    if (seed) {
      form.value = {
        ...form.value,
        title: seed.title ?? form.value.title,
        description: seed.description ?? form.value.description,
        content: seed.content ?? form.value.content,
        tags: seed.tags ? [...seed.tags] : form.value.tags,
        categoryId: seed.categoryId ?? form.value.categoryId,
      }
      syncVariables()
    }
  }

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

  /** 每个变量在正文里出现的次数 */
  const occurrences = computed<Record<string, number>>(() => {
    if (form.value.isJinjaTemplate) return {}
    const counts: Record<string, number> = {}
    parsePromptTemplate(form.value.content).occurrences.forEach((items, name) => { counts[name] = items.length })
    return counts
  })

  /** 新建一个变量定义（已存在就直接用），调用方负责把占位符插到光标处 */
  const addVariable = (name: string) => {
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
    form.value.variables = form.value.variables.map(item => (item.name === previousName ? variable : item))
    variableCache.delete(previousName)
    variableCache.set(variable.name, variable)
    retainedNames.delete(previousName)
    retainedNames.add(variable.name)
    if (variable.name === previousName) return
    if (form.value.isJinjaTemplate) {
      const escaped = previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const namePattern = new RegExp(`\\b${escaped}\\b`, 'g')
      form.value.content = form.value.content.replace(/({[{%][\s\S]*?[}%]})/g, tag => tag.replace(namePattern, variable.name))
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

  /**
   * 保存：成功后写版本历史，规则和桌面端相同（共用 writePromptHistory）：新建记 v1「创建」，
   * 修改时保存前的内容不在历史里就先补记一版。失败时抛出，由页面提示。没填标题时取正文第一行（去掉变量语法、截短）。
   * 版本说明由页面按界面语言传入。
   */
  const save = async (options: {
    changeDescription: string
    fallbackTitle: string
    /** 新建时 v1 的说明 */
    createdDescription: string
    /** 补记保存前内容那一版的说明 */
    beforeEditDescription: string
  }): Promise<PromptWithRelations> => {
    const existing = source.value
    const variables = serializeVariablesForSave(form.value)
    const data = {
      title: form.value.title.trim() || autoPromptTitle(form.value.content, options.fallbackTitle),
      description: form.value.description || undefined,
      content: form.value.content,
      categoryId: form.value.categoryId || undefined,
      tags: [...form.value.tags],
      isJinjaTemplate: form.value.isJinjaTemplate,
      variables,
      imageBlobs: [...form.value.imageBlobs],
      isFavorite: form.value.isFavorite,
      isActive: true,
    }

    let saved: PromptWithRelations
    if (existing?.id) {
      saved = await api.prompts.update.mutate({
        id: existing.id,
        data: { ...data, useCount: existing.useCount || 0 } as never,
      })
      await writePromptHistory({ ...existing, ...data } as PromptWithRelations, variables, options.changeDescription, {
        previous: existing,
        beforeEditDescription: options.beforeEditDescription,
      })
    } else {
      saved = await api.prompts.create.mutate({
        ...data,
        useCount: 0,
        uuid: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      } as never)
      // 和桌面端一样，新建时记下 v1，第一次修改之前的原文也能找回来
      await writePromptHistory({ ...data, id: saved.id } as PromptWithRelations, variables, options.createdDescription, {
        beforeEditDescription: options.beforeEditDescription,
      })
    }
    form.value.title = data.title
    source.value = saved
    markClean()
    return saved
  }

  return {
    source,
    form,
    dirty,
    activeVariables,
    unusedVariables,
    occurrences,
    load,
    markClean,
    addVariable,
    updateVariable,
    removeVariable,
    save,
  }
}
