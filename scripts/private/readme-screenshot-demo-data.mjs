// README / 商店截图用的演示数据（3.0）。
// 设定是一个普通用户的提示词库：学习、办公、生活、写作和生成图片，都是 AI 日常最常见的用法。
// 有普通变量、Jinja 模板、不带变量的纯文本，图片类提示词附上真实生成的图片（见 PROMPT_IMAGE_FILES）。
// 时间全部相对灌数据的那一刻计算，这样「今天用了 N 次」「3 天前」之类的显示才自然。

export const README_SCREENSHOT_SEQUENCE = [
  ['01', 'image-main.png', '主要截图（明暗对半）'],
  ['02', 'image-main-dark.png', '深色模式卡片视图'],
  ['03', 'image-ai-generator.png', 'AI 生成'],
  ['04', 'image-data-cloud-backup.png', '数据同步'],
  ['05', 'image-variable-fill.png', '变量填充'],
  ['06', 'image-edit-prompt.png', '编辑提示词'],
  ['07', 'image-jinja-template.png', 'Jinja 模板'],
  ['08', 'image-ai-config.png', 'AI 模型管理'],
  ['09', 'image-ai-add-config.png', '添加 AI 配置'],
  ['10', 'image-ai-quick-adjust.png', 'AI 快速调整'],
  ['11', 'image-filter.png', '筛选'],
  ['12', 'image-table-view.png', '表格视图'],
  ['13', 'image-folder-view.png', '文件夹视图'],
  ['14', 'image-category.png', '分类管理'],
  ['15', 'image-data-local-backup.png', '数据备份'],
  ['16', 'image-main-light.png', '明亮模式'],
];

/** 图片类提示词附带的图片，文件放在 scripts/private/demo-images/，灌数据时转成 data URL */
export const PROMPT_IMAGE_FILES = {
  'p-card': ['card-1.jpg', 'card-2.jpg'],
  'p-wallpaper': ['wallpaper-1.jpg', 'wallpaper-2.jpg'],
  'p-poster': ['poster-1.jpg', 'poster-2.jpg'],
  'p-avatar': ['avatar-1.jpg', 'avatar-2.jpg'],
};

const categoryRows = [
  ['c-study', '学习', '复习、作文和口语', '#06B57A'],
  ['c-work', '办公', '邮件、会议和汇报', '#3A86FF'],
  ['c-life', '生活', '旅行、做饭和家里的事', '#FFBE0B'],
  ['c-writing', '写作', '校对、翻译和社交媒体', '#8338EC'],
  ['c-image', '图片', '用来生成图片的提示词', '#FF006E'],
];

const v = (name, type, extra = {}) => ({ name, type, required: true, ...extra });

// [uuid, 标题, 描述, 分类, 标签, 收藏, 使用次数, 是否 Jinja, 正文, 变量, 创建于几天前, 更新于几天前]
const promptRows = [
  // ---- 生活 ----
  ['p-trip', '旅行规划', '目的地、天数和预算，一次排好行程', 'c-life', ['旅行', '常用'], true, 23, false,
    `帮我规划一次去{{目的地}}的旅行，一共{{天数}}天，预算{{预算}}，{{同行}}出行。

我比较喜欢：{{偏好}}

请按天安排行程，写清楚每天去哪、怎么走、大概花多少钱。最后附一份预算明细，并标出需要提前预约的地方。`,
    [
      v('目的地', 'text', { placeholder: '城市或国家' }),
      v('天数', 'number', { defaultValue: '5' }),
      v('预算', 'text', { placeholder: '例如 8000 元' }),
      v('同行', 'select', { options: ['一个人', '两个人', '带孩子'], defaultValue: '两个人' }),
      v('偏好', 'text', { required: false, placeholder: '喜欢什么，不喜欢什么' }),
    ], 8, 1],

  ['p-dinner', '一周晚餐菜单', '七天的晚餐，外加一份买菜清单', 'c-life', ['做饭', '家庭', '常用'], true, 41, false,
    `帮我安排下周七天的晚餐，{{人数}}个人吃。

- 口味：{{口味}}
- 不吃的东西：{{忌口}}
- 一周买菜预算：{{预算}}
- 工作日每顿饭要在 30 分钟内做好，周末可以复杂一点

请按周一到周日列出每天的菜，再按超市区域（蔬菜、肉蛋、调料等）整理一份买菜清单，写上大概的用量。`,
    [
      v('人数', 'number', { defaultValue: '3' }),
      v('口味', 'select', { options: ['清淡', '家常', '偏辣'], defaultValue: '家常' }),
      v('忌口', 'text', { required: false, placeholder: '例如：不吃香菜' }),
      v('预算', 'text', { placeholder: '例如 400 元' }),
    ], 16, 3],

  ['p-party', '生日派对邀请', '填好时间地点，生成一条发群里的邀请', 'c-life', ['聚会', 'Jinja'], false, 6, true,
    `帮我写一条生日派对的邀请消息，发在{{ channel }}里。

寿星：{{ name }}
时间：{{ time }}
地点：{{ place }}
{% if things_to_bring %}
请大家帮忙带上：
{% for item in things_to_bring %}
- {{ item }}
{% endfor %}
{% endif %}
{% if kids_welcome %}
欢迎带小朋友一起来，现场有给孩子准备的零食和游戏。
{% endif %}

语气轻松一点，可以加一两个表情，不超过 120 字。`,
    [
      v('channel', 'str', { defaultValue: '朋友群' }),
      v('name', 'str', { placeholder: '寿星的名字' }),
      v('time', 'str', { placeholder: '例如 11 月 8 日下午 3 点' }),
      v('place', 'str'),
      v('things_to_bring', 'list', { required: false, placeholder: '每行一项' }),
      v('kids_welcome', 'bool', { required: false, defaultValue: 'true' }),
    ], 40, 12],

  ['p-story', '睡前故事', '五分钟讲完，主角由孩子决定', 'c-life', ['孩子', '家庭'], false, 18, false,
    `给一个{{年龄}}岁的孩子讲一个睡前故事，主角是{{主角}}。

- 五分钟能讲完，句子短一点，适合念出来
- 有一个小小的冒险，结尾安静、温暖，适合入睡
- 故事里藏一个关于{{道理}}的小道理，不要直接讲出来`,
    [
      v('年龄', 'number', { defaultValue: '6' }),
      v('主角', 'text', { placeholder: '例如：一只会飞的小企鹅' }),
      v('道理', 'text', { placeholder: '例如：分享' }),
    ], 70, 9],

  // ---- 办公 ----
  ['p-meeting', '会议纪要整理', '整理出结论、待办和负责人', 'c-work', ['会议', '常用'], true, 37, false,
    `下面是「{{会议主题}}」的会议记录，可能是语音转写，比较乱。请帮我整理成会议纪要：

1. 会议结论：已经确定的事，每条一句话
2. 待办事项：做什么、谁负责、什么时候完成，用表格列出
3. 待确认的问题：还没有结论、需要会后跟进的事

只根据记录整理，不要补充记录里没有的内容。

会议记录：
{{会议记录}}`,
    [
      v('会议主题', 'text'),
      v('会议记录', 'textarea', { placeholder: '粘贴会议记录或转写文字' }),
    ], 95, 4],

  ['p-email', '回复邮件', '读懂来信，按我的意思写回复', 'c-work', ['邮件', '常用'], true, 52, false,
    `帮我回复下面这封邮件。

来信：
{{来信}}

我想表达的意思：{{我的意思}}

要求：语气{{语气}}；先回应对方的问题，再说我的安排；不超过 200 字；结尾简单客气一句就好。`,
    [
      v('来信', 'textarea', { placeholder: '粘贴对方的邮件' }),
      v('我的意思', 'text', { placeholder: '一两句话说清楚你想怎么回' }),
      v('语气', 'select', { options: ['正式', '友好', '简短'], defaultValue: '友好' }),
    ], 120, 2],

  ['p-ppt', '汇报 PPT 大纲', '按时长排好每页的标题和要点', 'c-work', ['演示', 'Jinja'], false, 14, true,
    `我要做一个关于「{{ topic }}」的汇报，听众是{{ audience }}，时长 {{ minutes }} 分钟。

请帮我列出 PPT 大纲：每页一个标题，下面两三个要点，并标出这一页大概讲几分钟。
{% if sections %}
必须包含这几部分：
{% for section in sections %}
- {{ section }}
{% endfor %}
{% endif %}
{% if include_qa %}
最后留一页问答。
{% endif %}`,
    [
      v('topic', 'str'),
      v('audience', 'str', { defaultValue: '部门同事' }),
      v('minutes', 'int', { defaultValue: '15' }),
      v('sections', 'list', { required: false, placeholder: '每行一部分' }),
      v('include_qa', 'bool', { required: false, defaultValue: 'true' }),
    ], 60, 15],

  ['p-summary', '长文档摘要', '先给结论，再列要点', 'c-work', ['摘要', '常用'], false, 66, false,
    `接下来我会发给你一份较长的文档。请先用三句话告诉我这份文档最重要的结论，再按原文的结构列出要点，每条不超过一行。

如果文档里有需要我做决定或者处理的事，单独列在最后，写清楚截止时间。文档里没有提到的信息不要补充。`,
    [], 140, 6],

  ['p-excel', 'Excel 公式助手', '说清楚想算什么，给出能直接用的公式', 'c-work', ['Excel'], false, 29, false,
    `你是我的 Excel 助手。我会告诉你表格里有哪些列、每列放的是什么，以及我想算出什么结果。

请直接给出可以粘贴进单元格的公式，再用一两句话解释它是怎么算的。如果 WPS 和 Excel 的写法不一样，两种都写出来。如果用数据透视表更合适，告诉我怎么操作。`,
    [], 160, 20],

  // ---- 学习 ----
  ['p-exam', '考试复习计划', '按考试日期倒排，每天具体到章节', 'c-study', ['考试', 'Jinja'], true, 9, true,
    `我在 {{ exam_date }} 有期末考试，从今天开始复习，每天能学 {{ hours }} 小时。

要考的科目：
{% for subject in subjects %}
- {{ subject }}
{% endfor %}

请帮我做一份复习计划：按天列出每天复习哪一科、哪几章，前一半时间过知识点，后一半时间做真题和错题。
{% if weekend_rest %}
周日下午留出来休息，不排任务。
{% endif %}
最后两天只安排回顾和查漏补缺。`,
    [
      v('exam_date', 'str', { placeholder: '例如 1 月 10 日' }),
      v('hours', 'int', { defaultValue: '3' }),
      v('subjects', 'list', { placeholder: '每行一科' }),
      v('weekend_rest', 'bool', { required: false, defaultValue: 'true' }),
    ], 30, 10],

  ['p-concept', '讲懂一个概念', '打个比方讲清楚，再出两道小题', 'c-study', ['常用'], false, 33, false,
    `用我能听懂的方式给我讲讲「{{概念}}」。我是{{身份}}。

先打一个生活里的比方，再讲它准确的意思和一个具体的例子。最后出两道小题检验我是不是真的懂了，答案先不要给。`,
    [
      v('概念', 'text', { placeholder: '例如：边际效应' }),
      v('身份', 'select', { options: ['初中生', '高中生', '大学生', '已经工作了'], defaultValue: '大学生' }),
    ], 110, 8],

  ['p-essay', '英语作文批改', '指出问题，给出改好的版本', 'c-study', ['英语', '考试'], false, 21, false,
    `帮我批改这篇{{考试}}作文。

1. 先按{{考试}}的评分标准给一个预估分数
2. 逐条指出语法错误和用词问题，写出原句和改法
3. 最后给出一篇修改后的版本，保留我原来的思路，只改表达

作文：
{{作文}}`,
    [
      v('考试', 'select', { options: ['四六级', '雅思', '托福'], defaultValue: '雅思' }),
      v('作文', 'textarea', { placeholder: '粘贴你的作文' }),
    ], 85, 14],

  ['p-speaking', '英语口语陪练', '扮演外国人跟我对话，每轮纠正一个地方', 'c-study', ['英语', '口语'], false, 47, false,
    `我们来练英语口语。请你扮演一个说英语的当地人，场景由我来定，我说完一句你再接一句，不要一次说太多。

每一轮回复之后，用中文简单指出我刚才那句话里最值得改的一个地方，给出更地道的说法。如果我说得没问题，就直接继续对话。

我准备好了，先问我想练什么场景。`,
    [], 200, 5],

  // ---- 写作 ----
  ['p-proofread', '文字校对', '只改错字和病句，不改意思', 'c-writing', ['校对', '常用'], true, 88, false,
    `帮我校对接下来发给你的文字：改正错别字、标点和明显的病句，不改变原意，也不要改我的写作风格。

先给出改好的全文，再用列表列出改了哪些地方、为什么改。如果没有需要改的，直接告诉我「没有问题」。`,
    [], 220, 1],

  ['p-xhs', '小红书笔记', '标题、正文和话题标签一次写好', 'c-writing', ['社交媒体'], false, 25, false,
    `帮我写一篇小红书笔记，分享{{主题}}。

真实的亮点：
{{亮点}}

风格要{{风格}}，像普通人在分享自己的体验，不要像广告。请给出：
- 3 个备选标题，每个不超过 20 字
- 正文 300 字左右，分几段，可以用少量表情
- 5 个话题标签`,
    [
      v('主题', 'text', { placeholder: '例如：周末带孩子去的一家书店' }),
      v('亮点', 'textarea', { placeholder: '每行一个' }),
      v('风格', 'select', { options: ['轻松', '干货', '治愈'], defaultValue: '轻松' }),
    ], 50, 7],

  ['p-translate', '中英互译', '按场合翻译，正式或口语都行', 'c-writing', ['翻译', '英语', '常用'], true, 63, false,
    `把下面的内容翻译成{{目标语言}}，用在{{场合}}。

- 意思准确，读起来自然，不要逐字硬译
- 人名、地名和品牌名保持原样
- 拿不准的词，在译文后面单独列出来

原文：
{{原文}}`,
    [
      v('目标语言', 'select', { options: ['英文', '中文', '日文'], defaultValue: '英文' }),
      v('场合', 'select', { options: ['工作邮件', '日常聊天', '正式文件'], defaultValue: '工作邮件' }),
      v('原文', 'textarea'),
    ], 152, 9],

  // ---- 图片 ----
  ['p-card', '生日贺卡插画', '换个主角和画风，做一张专属贺卡', 'c-image', ['即梦', '插画'], true, 12, false,
    `一张生日贺卡插画，主角是{{主角}}，{{画风}}风格，{{配色}}配色。画面温馨，桌上有插着蜡烛的生日蛋糕，背景干净明亮，画面上方留出一块空白用来写祝福语，不要出现任何文字。`,
    [
      v('主角', 'text', { placeholder: '例如：戴派对帽的橘猫' }),
      v('画风', 'select', { options: ['水彩', '3D 黏土', '扁平插画'], defaultValue: '水彩' }),
      v('配色', 'text', { defaultValue: '奶油色和浅蓝色' }),
    ], 25, 2],

  ['p-wallpaper', '手机壁纸', '竖版构图，上方给时间留出空间', 'c-image', ['Midjourney', '壁纸'], false, 15, false,
    `{{画面}}, {{风格}}, {{色调}} color palette, calm and minimal composition, lots of empty space at the top for the clock, vertical phone wallpaper, no text --ar 9:16 --v 7`,
    [
      v('画面', 'text', { placeholder: 'a quiet street in Kyoto after rain' }),
      v('风格', 'select', { options: ['photography', 'minimal illustration', 'oil painting'], defaultValue: 'photography' }),
      v('色调', 'text', { defaultValue: 'muted green and warm grey' }),
    ], 65, 6],

  ['p-poster', '活动海报', '留出放标题的位置，后期直接加字', 'c-image', ['即梦', '海报'], false, 8, false,
    `为「{{活动名称}}」设计一张竖版海报画面，{{风格}}风格，主视觉是{{主视觉}}。画面上方三分之一保持干净的浅色背景，留给后期放标题，画面里不要出现任何文字、数字或 logo。比例 3:4。`,
    [
      v('活动名称', 'text'),
      v('风格', 'select', { options: ['手绘插画', '扁平几何', '胶片摄影'], defaultValue: '手绘插画' }),
      v('主视觉', 'text', { placeholder: '画面中间放什么' }),
    ], 45, 4],

  ['p-avatar', '3D 卡通头像', '上传一张照片，变成动画电影风格的头像', 'c-image', ['头像'], false, 19, false,
    `把我上传的照片变成一个 3D 卡通头像：动画电影风格，保留照片里人物的发型、脸型和眼镜等特点，表情自然微笑。柔和的摄影棚灯光，纯色背景，半身构图，正方形。`,
    [], 35, 3],
];

// 上次复制时的填写值：打开提示词时会预填，同时出现在「使用记录」里
// [提示词, 几小时前, 填写值]
const usageRows = [
  ['p-trip', 26, { 目的地: '京都', 天数: '5', 预算: '8000 元', 同行: '两个人', 偏好: '寺庙和老街，想吃一次怀石料理，不想太赶' }],
  ['p-trip', 500, { 目的地: '成都', 天数: '3', 预算: '3000 元', 同行: '带孩子', 偏好: '大熊猫基地和地道小吃，孩子 6 岁' }],
  ['p-dinner', 5, { 人数: '3', 口味: '家常', 忌口: '孩子不吃辣，老公不吃香菜', 预算: '400 元' }],
  ['p-dinner', 170, { 人数: '2', 口味: '清淡', 忌口: '', 预算: '300 元' }],
  ['p-party', 30, { channel: '朋友群', name: '小雨', time: '11 月 8 日（周六）下午 3 点', place: '我家，星河湾 6 栋 1202', things_to_bring: '一个桌游或小游戏\n一样你最爱吃的零食', kids_welcome: 'true' }],
  ['p-story', 28, { 年龄: '6', 主角: '一只怕黑的小刺猬', 道理: '勇敢' }],
  ['p-meeting', 50, { 会议主题: '双十一活动复盘', 会议记录: '（周会转写，约 40 分钟）' }],
  ['p-email', 3, { 来信: 'Hi，上次说的报价单这周能发我吗？我们周五要和老板过一遍。', 我的意思: '周四下午前发，部分价格还在等供应商确认', 语气: '友好' }],
  ['p-email', 120, { 来信: '王老师您好，下周三下午的家长会改到周四晚上 7 点，请问您方便参加吗？不方便的话可以线上参加。', 我的意思: '可以参加，但可能会晚到 15 分钟', 语气: '正式' }],
  ['p-ppt', 75, { topic: '第三季度用户增长', audience: '部门负责人', minutes: '15', sections: '本季度数据\n做得好的地方\n遇到的问题\n下季度计划', include_qa: 'true' }],
  ['p-exam', 100, { exam_date: '1 月 10 日', hours: '3', subjects: '高等数学（第 1–6 章）\n大学英语\n线性代数（第 1–4 章）', weekend_rest: 'true' }],
  ['p-concept', 12, { 概念: '边际效应', 身份: '大学生' }],
  ['p-essay', 60, { 考试: '雅思', 作文: 'Some people believe that university students should study whatever they like, while others think they should only study subjects that are useful for their future careers...' }],
  ['p-xhs', 20, { 主题: '京都五天四晚的行程和花费', 亮点: '两个人一共花了 8000 元左右\n住在四条附近，去哪都方便\n清水寺早上 7 点去几乎没人\n锦市场的玉子烧一定要吃', 风格: '干货' }],
  ['p-translate', 7, { 目标语言: '英文', 场合: '工作邮件', 原文: '您好，附件是我们第三季度的合作报价，请您查收。如果采购数量有调整，价格还可以再商量。' }],
  ['p-card', 40, { 主角: '戴着波点派对帽的橘猫', 画风: '水彩', 配色: '奶油色和浅蓝色' }],
  ['p-card', 200, { 主角: '抱着彩色气球的小柯基', 画风: '3D 黏土', 配色: '粉色和薄荷绿' }],
  ['p-wallpaper', 90, { 画面: 'a quiet street in Kyoto just after rain, wet stone path and paper lanterns', 风格: 'photography', 色调: 'muted green and warm grey' }],
  ['p-poster', 120, { 活动名称: '社区周末市集', 风格: '手绘插画', 主视觉: '摆满新鲜蔬果、鲜花和面包的木头小摊' }],
  ['p-poster', 300, { 活动名称: '周末读书会', 风格: '扁平几何', 主视觉: '一摞书、一杯热咖啡和一盏台灯' }],
];

// 历史版本：[提示词, 版本号, 几天前, 修改说明, 正文]
const historyRows = [
  ['p-trip', 1, 8, '初版', '帮我规划一次去{{目的地}}的旅行，一共{{天数}}天，预算{{预算}}。请按天安排行程。'],
  ['p-trip', 2, 3, '加上同行人和偏好',
    '帮我规划一次去{{目的地}}的旅行，一共{{天数}}天，预算{{预算}}，{{同行}}出行。\n\n我比较喜欢：{{偏好}}\n\n请按天安排行程，写清楚每天去哪、怎么走、大概花多少钱。'],
  ['p-meeting', 1, 95, '初版', '把下面的会议记录整理成会议纪要。\n\n{{会议记录}}'],
  ['p-meeting', 2, 30, '加上待办表格和负责人',
    '下面是「{{会议主题}}」的会议记录，请帮我整理成会议纪要：会议结论、待办事项（谁负责、什么时候完成）、待确认的问题。\n\n{{会议记录}}'],
  ['p-email', 1, 120, '初版', '帮我回复下面这封邮件，语气{{语气}}。\n\n{{来信}}'],
  ['p-proofread', 1, 220, '初版', '帮我检查下面这段话有没有错别字。'],
  ['p-card', 1, 25, '初版', '一张生日贺卡插画，主角是{{主角}}，{{画风}}风格，背景干净，不要出现任何文字。'],
];

const aiConfigRows = [
  {
    configId: 'lmstudio-local', name: 'LM Studio', type: 'lmstudio', baseURL: 'http://127.0.0.1:1234/v1',
    models: ['qwen/qwen3.5-9b', 'qwen/qwen3.8-27b'], defaultModel: 'qwen/qwen3.5-9b',
    enabled: true, isPreferred: true, temperature: 0.6, maxTokens: 4096, created: 287, updated: 2,
    systemPrompt: `帮我写一条以后能反复用的提示词。
- 直接写给 AI 的要求，语气自然，不要套「你是一位资深……」这样的模板
- 每次会变的内容用 {{变量名}} 标出来，变量名用简短的中文
- 要求写具体，但不要太长
只输出提示词本身，不要解释。`,
  },
  {
    configId: 'deepseek', name: 'DeepSeek', type: 'deepseek', baseURL: 'https://api.deepseek.com/v1',
    apiKey: 'sk-demo-0000-not-a-real-key-7f3a', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat',
    enabled: true, isPreferred: false, temperature: 0.7, maxTokens: 4096, created: 280, updated: 20,
  },
  {
    configId: 'nas-ollama', name: 'Ollama', type: 'ollama', baseURL: 'http://192.168.31.20:11434',
    models: ['qwen3:8b', 'gemma3:12b'], defaultModel: 'qwen3:8b',
    enabled: true, isPreferred: false, temperature: 0.5, maxTokens: 4096, created: 200, updated: 45,
  },
  {
    configId: 'siliconflow', name: '硅基流动', type: 'siliconflow', baseURL: 'https://api.siliconflow.cn/v1',
    apiKey: 'sk-demo-0000-not-a-real-key-91c2', models: ['Qwen/Qwen3-32B', 'deepseek-ai/DeepSeek-V3'], defaultModel: 'Qwen/Qwen3-32B',
    enabled: true, isPreferred: false, temperature: 0.7, maxTokens: 4096, created: 160, updated: 60,
  },
  {
    configId: 'openai', name: 'OpenAI', type: 'openai', baseURL: 'https://api.openai.com/v1',
    apiKey: '', models: ['gpt-5-mini', 'gpt-5'], defaultModel: 'gpt-5-mini',
    enabled: false, isPreferred: false, temperature: 0.7, maxTokens: 4096, created: 330, updated: 90,
  },
];

const quickOptimizationRows = [
  ['更简短', '让提示词更简短精炼：保留核心要求，去掉多余内容', '请把下面的提示词改写得更简短精炼：保留核心要求，去掉多余内容。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['更丰富', '给提示词补充更具体的要求和细节，但不过度复杂', '请把下面的提示词改写得更丰富、详细一些，补充更具体的要求和细节，但不要过于复杂。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['更通用', '让提示词适用于更多场景和用途', '请把下面的提示词改写得更通用，适用于更多场景和用途，但不要过于复杂。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['提取变量', '把提示词里会变化的部分提取成变量', '请分析下面的提示词，把其中会变化、最有价值的 3～5 个部分提取成变量，用 {{变量名}} 的格式标记，已有的变量保持不变。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['更口语', '去掉书面腔，读起来像平时说话', '把下面的提示词改得口语一点：去掉书面腔和不必要的修饰，意思和要求一条都不能少。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['更专业', '让提示词更专业、正式，适合商业或学术场景', '请把下面的提示词改写得更专业、正式，适合商业或学术场景使用。只输出改写后的提示词，不要解释。\n\n{{content}}', false],
];

const aiHistoryRows = [
  ['装修预算清单：我会告诉你房子面积、总预算和想要的风格', 'lmstudio-local', 'qwen/qwen3.5-9b', 4,
    '我家房子{{面积}}平方米，装修总预算{{预算}}，想要{{风格}}风格。\n\n请帮我列一份装修预算清单：按硬装、软装、家电分类，每一项写上建议花多少钱。最后标出哪些地方最容易超支，哪些可以省。'],
  ['面试模拟：我会告诉你岗位和我的经历，你来连续追问', 'deepseek', 'deepseek-chat', 11,
    '你是{{公司}}的面试官，我应聘的是{{岗位}}。\n\n我先介绍一段经历，你根据我说的内容连续追问三层，每次只问一个问题。问到我答不上来就停下，告诉我这个点应该怎么准备。\n\n我的经历：{{经历}}'],
  ['把每周的家庭开支整理成表格，标出超预算的项目', 'lmstudio-local', 'qwen/qwen3.5-9b', 23,
    '下面是我们家这周的开支记录：\n{{开支记录}}\n\n每月预算：{{预算}}\n\n请整理成表格：日期、用途、金额、分类（吃饭、买菜、交通、孩子、其他）。表格下面列出这周超出预算的分类。'],
];

const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (now, days, hour = 10, minute = 20) => {
  const date = new Date(now.getTime() - days * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const hoursAgo = (now, hours) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

/** 把 {{变量}} 替换成填写值，生成使用记录里保存的正文（Jinja 模板只做简单替换，记录里看个大概就行） */
const fillContent = (content, values) =>
  content.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, name) => (name in values ? String(values[name]) : match));

export function createReadmeDemoData(now = new Date()) {
  const categories = categoryRows.map((row, index) => ({
    id: index + 1,
    uuid: row[0],
    name: row[1],
    description: row[2],
    color: row[3],
    isActive: true,
    sortOrder: index + 1,
    createdAt: daysAgo(now, 330 - index * 20),
    updatedAt: daysAgo(now, 60 - index * 5),
  }));
  const categoryId = uuid => categories.findIndex(category => category.uuid === uuid) + 1;

  const historyCount = uuid => historyRows.filter(row => row[0] === uuid).length;

  const prompts = promptRows.map((row, index) => ({
    id: index + 1,
    uuid: row[0],
    title: row[1],
    description: row[2],
    categoryId: categoryId(row[3]),
    categoryUuid: row[3],
    tags: row[4],
    isFavorite: row[5],
    useCount: row[6],
    isJinjaTemplate: row[7],
    content: row[8],
    version: historyCount(row[0]) + 1,
    isActive: true,
    createdAt: daysAgo(now, row[10], 21, 40),
    updatedAt: daysAgo(now, row[11], 9 + (index % 9), (index * 17) % 60),
  }));
  const promptByUuid = uuid => prompts.find(prompt => prompt.uuid === uuid);

  const promptVariables = promptRows.flatMap(row => row[9].map(variable => ({ ...variable, promptUuid: row[0] })))
    .map((variable, index) => {
      const prompt = promptByUuid(variable.promptUuid);
      return {
        id: index + 1,
        uuid: `v-${String(index + 1).padStart(3, '0')}`,
        promptId: prompt.id,
        promptUuid: prompt.uuid,
        name: variable.name,
        type: variable.type,
        placeholder: variable.placeholder,
        defaultValue: variable.defaultValue,
        required: variable.required,
        options: variable.options,
        sortOrder: index + 1,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      };
    });

  const promptHistories = historyRows.map((row, index) => {
    const prompt = promptByUuid(row[0]);
    return {
      id: index + 1,
      uuid: `h-${row[0]}-${row[1]}`,
      promptId: prompt.id,
      promptUuid: prompt.uuid,
      title: prompt.title,
      content: row[4],
      description: prompt.description,
      categoryId: prompt.categoryId,
      categoryUuid: prompt.categoryUuid,
      tags: JSON.stringify(prompt.tags),
      variables: JSON.stringify(promptVariables.filter(variable => variable.promptUuid === prompt.uuid)),
      isJinjaTemplate: prompt.isJinjaTemplate,
      version: row[1],
      changeDescription: row[3],
      createdAt: daysAgo(now, row[2], 22, 5),
    };
  });

  const aiConfigs = aiConfigRows.map((row, index) => {
    const { created, updated, ...config } = row;
    return {
      id: index + 1,
      uuid: `ai-${row.configId}`,
      ...config,
      createdAt: daysAgo(now, created),
      updatedAt: daysAgo(now, updated),
    };
  });

  const quickOptimizationConfigs = quickOptimizationRows.map((row, index) => ({
    id: index + 1,
    uuid: `qo-${index + 1}`,
    name: row[0],
    description: row[1],
    prompt: row[2],
    enabled: row[3],
    sortOrder: index + 1,
    createdAt: daysAgo(now, 300),
    updatedAt: daysAgo(now, index === 4 ? 30 : 300),
  }));

  const aiHistory = aiHistoryRows.map((row, index) => ({
    id: index + 1,
    uuid: `aih-${index + 1}`,
    historyId: `history-${index + 1}`,
    topic: row[0],
    configId: row[1],
    model: row[2],
    generatedPrompt: row[4],
    temperature: 0.6,
    maxTokens: 4096,
    status: 'success',
    createdAt: daysAgo(now, row[3], 20, 30),
  }));

  // 使用记录按提示词 uuid 分组，灌数据时再换成新 id 写进 localStorage
  const usageByPromptUuid = {};
  for (const [uuid, hours, values] of usageRows) {
    const prompt = promptByUuid(uuid);
    (usageByPromptUuid[uuid] ||= []).push({
      date: hoursAgo(now, hours),
      content: fillContent(prompt.content, values),
      variables: values,
    });
  }
  for (const records of Object.values(usageByPromptUuid)) {
    records.sort((a, b) => b.date.localeCompare(a.date));
  }

  return {
    data: {
      categories,
      prompts,
      promptVariables,
      promptHistories,
      aiConfigs,
      quickOptimizationConfigs,
      aiHistory,
      settings: [],
      syncTombstones: [],
    },
    usageByPromptUuid,
    localStorage: {
      locale: 'zh-CN',
      'locale-source': 'user',
      'ai-gist:quick-optimization-defaults-seeded': '1',
    },
  };
}
