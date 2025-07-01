export default {
  // Main page
  mainPage: {
    title: 'AI Gist',
    menu: {
      prompts: 'AI Prompts',
      aiConfig: 'AI Config',
      settings: 'Settings'
    }
  },
  
  // Prompt management page
  promptManagement: {
    title: 'AI Prompts',
    subtitle: 'Manage and organize your AI prompt library',
    aiGenerate: 'AI Generate',
    createPrompt: 'Create Prompt',
    edit: 'Edit Prompt',
    create: 'Create Prompt',
    content: 'Prompt Content',
    contentPlaceholder: 'Enter prompt content, use {{variableName}} to define variables',
    promptTitle: 'Title',
    titlePlaceholder: 'Enter prompt title (optional)',
    description: 'Description',
    descriptionPlaceholder: 'Enter prompt description (optional)',
    category: 'Category',
    categoryPlaceholder: 'Select category',
    tags: 'Tags',
    tagsPlaceholder: 'Press Enter to add tags',
    variables: 'Detected Variables',
    addVariable: 'Add Manually',
    variableName: 'Variable Name',
    variableNamePlaceholder: 'Variable name',
    variableLabel: 'Display Name',
    variableLabelPlaceholder: 'Display name',
    variableType: 'Type',
    variableRequired: 'Required',
    variableDefault: 'Default Value',
    variableDefaultPlaceholder: 'Default value (optional)',
    variableOptions: 'Options',
    variableOptionsPlaceholder: 'Enter options',
    quickOptimization: 'Quick Optimize Prompt',
    stopGeneration: 'Stop Generation',
    manualAdjustment: 'Manual Adjustment',
    manualAdjustmentPlaceholder: 'Enter instructions on how to adjust the prompt, e.g., \'Add more details\', \'Simplify language\'...',
    manualAdjustmentTip: 'AI will adjust the current prompt content based on your instructions',
    cancelAdjustment: 'Cancel',
    confirmAdjustment: 'Confirm Adjustment',
    history: 'History',
    versionHistory: 'Version History',
    historyDescription: 'Version history, you can preview and rollback to previous versions',
    noHistory: 'No version history',
    preview: 'Preview',
    rollback: 'Rollback',
    changeDescription: 'Change Description',
    contentPreview: 'Content Preview',
    generating: 'Generating...',
    characters: 'characters',
    aiModelPlaceholder: 'Select AI model for optimization',
    manualAdjustmentTitle: 'Manual Adjustment Instructions'
  },
  
  // AI Config page
  aiConfig: {
    title: 'AI Configuration Management',
    subtitle: 'Manage and test your AI service connection configurations',
    optimizePrompt: 'Optimize Prompt',
    addConfig: 'Add Configuration',
    currentPreferredConfig: 'Current Global Preferred Configuration:',
    cancelPreferred: 'Cancel Preferred',
    multipleConfigsWarning: 'You have multiple enabled AI configurations, it is recommended to set a global preferred configuration',
    noConfigs: 'No AI configurations yet, come add the first one!',
    enabled: 'Enabled',
    disabled: 'Disabled',
    globalPreferred: 'Global Preferred',
    setAsPreferred: 'Set as Preferred',
    alreadyPreferred: 'Already Set as Preferred',
    baseURL: 'Base URL',
    defaultModel: 'Default Model',
    customModel: 'Custom Model',
    createdAt: 'Created At',
    edit: 'Edit',
    systemPrompt: 'System Prompt',
    connectionTest: 'Connection Test',
    requestTest: 'Request Test',
    delete: 'Delete'
  },
  
  // Settings page
  settings: {
    title: 'Application Settings',
    subtitle: 'Personalize your application preferences',
    autoSave: 'Settings auto-save',
    resetSettings: 'Reset to Default',
    menu: 'Settings Menu'
  },
  
  // About page
  about: {
    appName: 'AI Gist',
    appDescription: 'Local-first AI prompt management tool',
    appFeatures: 'Manage AI prompts + variable filling + category tags',
    versionInfo: 'Version Information',
    currentVersion: 'Current Version',
    latestVersion: 'Latest Version',
    hasUpdate: 'Update Available',
    isLatest: 'Up to Date',
    publishedAt: 'Published Date',
    updateCheck: 'Update Check',
    checkForUpdates: 'Check for Updates',
    newVersionAvailable: 'New Version Available',
    newVersionDesc: 'New version {version} has been released, it is recommended to update in time.',
    downloadNewVersion: 'Download New Version',
    viewReleaseNotes: 'View Release Notes',
    hideReleaseNotes: 'Hide Release Notes',
    releaseNotes: 'Release Notes',
    projectInfo: 'Project Information',
    developer: 'Developer',
    developerName: 'Yarin Zhang',
    github: 'GitHub',
    githubRepo: 'yarin-zhang/AI-Gist',
    license: 'License',
    licenseType: 'AGPL License',
    feedbackSupport: 'Feedback & Support',
    reportIssue: 'Report Issue',
    featureRequest: 'Feature Request'
  },
  
  // Common
  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    create: 'Create',
    update: 'Update',
    loading: 'Loading...',
    retry: 'Retry',
    hide: 'Hide'
  }
} 