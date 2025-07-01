export default {
  // 主页面
  mainPage: {
    title: 'AI Gist',
    menu: {
      prompts: 'AI 提示词',
      aiConfig: 'AI 配置',
      settings: '设置'
    }
  },
  
  // 提示词管理页面
  promptManagement: {
    title: 'AI 提示词',
    subtitle: '管理和组织你的 AI 提示词库',
    aiGenerate: 'AI 生成',
    createPrompt: '新建提示词',
    edit: '编辑提示词',
    create: '创建提示词',
    content: '提示词内容',
    contentPlaceholder: '请输入提示词内容，使用 {{变量名}} 来定义变量',
    promptTitle: '标题',
    titlePlaceholder: '请输入提示词标题（可选）',
    description: '描述',
    descriptionPlaceholder: '请输入提示词描述（可选）',
    category: '分类',
    categoryPlaceholder: '选择分类',
    tags: '标签',
    tagsPlaceholder: '按回车添加标签',
    variables: '检测到的变量',
    addVariable: '手动添加',
    variableName: '变量名',
    variableNamePlaceholder: '变量名',
    variableLabel: '显示名',
    variableLabelPlaceholder: '显示名称',
    variableType: '类型',
    variableRequired: '必填',
    variableDefault: '默认值',
    variableDefaultPlaceholder: '默认值（可选）',
    variableOptions: '选项',
    variableOptionsPlaceholder: '请输入选项',
    quickOptimization: '快速优化提示词',
    stopGeneration: '停止生成',
    manualAdjustment: '手动调整',
    manualAdjustmentPlaceholder: '请输入您希望如何调整提示词的指令，例如：\'添加更多细节\'、\'简化语言表达\'等...',
    manualAdjustmentTip: 'AI 将根据您的指令调整当前提示词内容',
    cancelAdjustment: '取消',
    confirmAdjustment: '确定调整',
    history: '历史记录',
    versionHistory: '版本历史',
    historyDescription: '版本历史记录，可以预览和回滚到之前的版本',
    noHistory: '暂无版本历史',
    preview: '预览',
    rollback: '回滚',
    changeDescription: '变更说明',
    contentPreview: '内容预览',
    generating: '正在生成...',
    characters: '字符',
    aiModelPlaceholder: '选择AI模型进行优化',
    manualAdjustmentTitle: '手动调整指令'
  },
  
  // 设置页面
  settings: {
    title: '应用设置',
    subtitle: '个性化配置您的应用偏好',
    autoSave: '设置会自动保存',
    resetSettings: '恢复默认设置',
    menu: '设置菜单'
  },
  
  // 通用
  common: {
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    edit: '编辑',
    delete: '删除',
    create: '创建',
    update: '更新',
    loading: '加载中...',
    retry: '重试',
    hide: '隐藏'
  }
} 