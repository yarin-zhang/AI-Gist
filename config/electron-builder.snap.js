const baseConfig = require('./electron-builder.json');

module.exports = {
  ...baseConfig,
  linux: {
    ...baseConfig.linux,
    target: 'snap',
    category: 'Utility',
    synopsis: '隐私优先、本地存储的 AI 提示词管理工具。',
    description: [
      'AI Gist 是一款隐私优先的 AI 提示词管理工具，帮助你创建、整理、复用和持续优化自己的提示词。',
      '',
      '提示词库默认保存在本机。你可以使用变量和 Jinja 模板复用提示词，通过分类、标签、评分和收藏整理内容，并用历史记录回顾使用过程。AI Gist 支持 Ollama、LM Studio 等本地模型，也支持由你自行配置的在线 AI 服务。',
      '',
      '应用不包含广告、分析统计、遥测或崩溃上报。只有在你配置在线 AI 服务、使用 WebDAV 云端备份或主动打开外部支持链接等功能时，应用才会访问相应服务。'
    ].join('\n'),
    artifactName: 'AI-Gist-${version}-Linux-Snap-${arch}.${ext}'
  },
  snap: {
    title: 'AI Gist',
    summary: '隐私优先、本地存储的 AI 提示词管理工具。',
    grade: 'stable',
    confinement: 'strict'
  }
};
