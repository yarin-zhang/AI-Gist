// README / 商店截图用的演示数据（3.0）。
// 设定是一个真实用户用了一年左右的提示词库：写代码、改稿、跟人沟通、读书、做饭、带孩子、画图都有，
// 使用次数、收藏、历史版本和上次填写的值都按日常使用的样子摆。
// 时间全部相对灌数据的那一刻计算，这样「今天用了 N 次」「3 天前」之类的显示才自然。

export const README_SCREENSHOT_SEQUENCE = [
  ['01', 'image-main.png', '主要截图（明暗对半）'],
  ['02', 'image-main-dark.png', '深色模式工作台'],
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

const categoryRows = [
  ['c-code', '写代码', 'commit、review、查报错', '#3A86FF'],
  ['c-writing', '写东西', '改稿、起标题、翻译', '#8338EC'],
  ['c-people', '跟人打交道', '回消息、写邮件、拒绝人', '#FB5607'],
  ['c-learn', '学点东西', '读书、弄懂一个概念', '#06B57A'],
  ['c-life', '过日子', '做饭、出门、孩子、咖啡', '#FFBE0B'],
  ['c-image', '画图', 'Midjourney 和即梦用的', '#FF006E'],
];

const v = (name, type, extra = {}) => ({ name, type, required: true, ...extra });

// [uuid, 标题, 描述, 分类, 标签, 收藏, 使用次数, 是否 Jinja, 正文, 变量, 创建于几天前, 更新于几天前]
const promptRows = [
  ['p-de-ai', '去掉 AI 味', '专治「值得注意的是」', 'c-writing', ['改稿', '每天用'], true, 156, false,
    `下面这段是 AI 写的初稿，帮我改得像人写的：
- 删掉「值得注意的是」「总而言之」「赋能」「助力」这一类词
- 不要排比，不要三段式，不要每段都用一句总结收尾
- 能用短句就别用长句，能举具体例子就别讲道理
- 原文里的事实和数字一个都不要动，也不要加新内容

原文：
{{原文}}`,
    [v('原文', 'textarea', { placeholder: '粘贴初稿' })], 30, 0],

  ['p-commit', '写 commit message', '贴 diff，出一条能直接用的', 'c-code', ['Git', '每天用', '工作'], true, 214, false,
    `根据下面的 diff 写一条 commit message。

- 用 Conventional Commits，type 从 feat / fix / refactor / docs / chore 里选
- 标题用{{语言}}，不超过 50 个字符，结尾不加句号
- 正文只写为什么改，diff 里看得出来的不用复述
- 如果这其实是两件事，直接告诉我该拆成两个 commit

{{diff}}`,
    [v('语言', 'select', { options: ['中文', 'English'], defaultValue: '中文' }), v('diff', 'textarea', { placeholder: 'git diff --staged 的输出' })], 212, 1],

  ['p-decline', '体面地拒绝', '不找借口，也不过度道歉', 'c-people', ['微信', '拒绝'], true, 52, false,
    `帮我拒绝一件事，对方是{{对方}}。

事情：{{事情}}
我的真实原因：{{原因}}（不一定要说出来）

不编借口，不过度道歉，语气{{语气}}一点。
给我两个版本：一个短的，可以直接发微信；一个稍微长一点，留点余地。`,
    [
      v('对方', 'select', { options: ['同事', '朋友', '亲戚', '客户', '前同事'] }),
      v('事情', 'text', { placeholder: '对方想让你做什么' }),
      v('原因', 'text', { placeholder: '真实原因，AI 会决定说不说' }),
      v('语气', 'select', { options: ['温和', '干脆'], defaultValue: '温和' }),
    ], 41, 2],

  ['p-fridge', '冰箱里有什么就做什么', '下班前问一下，回家直接做', 'c-life', ['做饭', '家里'], true, 39, false,
    `冰箱里现在有：{{食材}}
今晚 {{人数}} 个人吃，{{时间}} 分钟内要做完，{{忌口}}。

给我两个方案，每个写清楚：
- 用掉哪些食材，还缺什么（缺的最好楼下便利店能买到）
- 步骤不超过 6 步
- 哪一步最容易翻车`,
    [
      v('食材', 'textarea', { placeholder: '想到什么写什么' }),
      v('人数', 'number', { defaultValue: '2' }),
      v('时间', 'number', { defaultValue: '30' }),
      v('忌口', 'text', { required: false, placeholder: '比如：不吃香菜' }),
    ], 12, 3],

  ['p-review', 'Code Review：只挑会出事的', '风格建议一律不要', 'c-code', ['Review', '工作'], true, 87, false,
    `帮我 review 下面这段 {{语言}} 代码。
只指出上线后可能出事故的问题：数据丢失、竞态、空值、权限、资源泄漏。
命名、格式、「可以写得更优雅」之类的意见一律不要。

每个问题按这个格式：
- 位置：文件和行号
- 会发生什么：一句话，写用户会看到的现象
- 怎么改：给最小的改动

没发现问题就回答「没问题」，不要硬凑。

{{代码}}`,
    [v('语言', 'select', { options: ['TypeScript', 'Swift', 'Python', 'Go', 'SQL'], defaultValue: 'TypeScript' }), v('代码', 'textarea', { placeholder: '粘贴代码或 diff' })], 55, 4],

  ['p-release', '写发版更新说明', '一份改动清单，按平台出两种格式', 'c-writing', ['Jinja', '发版', '工作'], true, 24, true,
    `把下面的改动整理成 {{ app_name }} {{ version }} 的更新说明，发在 {{ platform }}。

{% if highlights %}
这次的重点：
{% for item in highlights %}
- {{ item }}
{% endfor %}
{% endif %}
{% if fixes %}
修了这些问题（合成一句话就行，不用逐条列）：
{% for fix in fixes %}
- {{ fix }}
{% endfor %}
{% endif %}
{% if platform == "App Store" %}
开头第一句说清楚最大的变化，整体不超过 600 字，不用 Markdown。
{% else %}
用 Markdown，按「新增 / 改进 / 修复」分组，每条一行。
{% endif %}`,
    [
      v('app_name', 'str', { defaultValue: '潮汐番茄钟' }),
      v('version', 'str', { placeholder: '2.4.0' }),
      v('platform', 'str', { defaultValue: 'App Store' }),
      v('highlights', 'list', { required: false, placeholder: '每行一条' }),
      v('fixes', 'list', { required: false, placeholder: '每行一条' }),
    ], 70, 5],

  ['p-shell', '一句话变成 shell 命令', '能一行就一行，危险命令先 dry-run', 'c-code', ['终端', '每天用'], true, 128, false,
    `把下面这件事变成一条 {{shell}} 命令，能一行就别写脚本。
如果命令会删除或覆盖文件，先给一个只打印、不执行的版本。

要做的事：{{描述}}`,
    [v('shell', 'select', { options: ['zsh', 'bash', 'PowerShell'], defaultValue: 'zsh' }), v('描述', 'text', { placeholder: '比如：把这个目录下所有 HEIC 转成 JPG' })], 86, 6],

  ['p-group-chat', '群里的长消息压成三行', '结论、谁做什么、还没定的', 'c-people', ['群聊', '工作', '每天用'], false, 71, false,
    `下面是一段群聊记录，帮我压成三行：
第一行：结论，定了什么
第二行：谁要做什么，什么时候之前
第三行：还没定的事
哪一行没有内容就写「无」。不要加评论，不要加客套话。

{{聊天记录}}`,
    [v('聊天记录', 'textarea', { placeholder: '直接粘贴，带不带时间都行' })], 104, 7],

  ['p-translate', '中译英：按钮名和代码不翻', '读者不同，语气跟着变', 'c-writing', ['翻译', '英文', '工作'], false, 63, false,
    `把下面的中文翻成英文，读者是{{读者}}。
- 产品名、按钮名、代码保持原样
- 语气跟原文一致，原文口语就口语
- 拿不准的术语，在译文后面用括号列出来，我自己决定

{{原文}}`,
    [v('读者', 'select', { options: ['海外用户', '开发者', 'App Store 审核'], defaultValue: '海外用户' }), v('原文', 'textarea')], 152, 9],

  ['p-error', '先看懂这条报错', '先弄清楚它在说什么，再动手改', 'c-code', ['排查', '工作'], false, 46, false,
    `我在 {{环境}} 上遇到这个报错。先别急着给方案，先告诉我：
1. 这条报错字面上在说什么
2. 最可能的三个原因，按可能性排序
3. 每个原因怎么用一条命令或一行日志确认

报错原文：
{{报错}}

我刚才做了什么：{{操作}}`,
    [
      v('环境', 'text', { defaultValue: 'macOS 26 / Node 22' }),
      v('报错', 'textarea'),
      v('操作', 'text', { required: false, placeholder: '比如：刚把 Electron 升到 32' }),
    ], 118, 10],

  ['p-coffee', '手冲参数调整', '一次只改一个变量', 'c-life', ['咖啡'], false, 22, false,
    `今天这杯{{豆子}}（{{烘焙度}}）喝起来{{问题}}。
现在的参数：{{参数}}

一次只建议我改一个变量，说明为什么先改它，以及改完大概会喝到什么变化。`,
    [
      v('豆子', 'text', { placeholder: '产区 / 处理法' }),
      v('烘焙度', 'select', { options: ['浅烘', '中烘', '深烘'], defaultValue: '浅烘' }),
      v('问题', 'select', { options: ['太酸', '太苦', '寡淡', '发涩'] }),
      v('参数', 'text', { defaultValue: '15g 粉 / 240ml / 92°C / 2:30' }),
    ], 95, 12],

  ['p-title', '起标题：给 10 个，别太标题党', '要能点进去，但别骗人点进去', 'c-writing', ['标题', '公众号'], false, 41, false,
    `给这篇文章起 10 个标题，发在{{平台}}。
- 不用「震惊」「干货」「一文读懂」
- 每个不超过 {{字数}} 个字
- 至少 3 个是平铺直叙的陈述句，不带问号和感叹号

文章大意：
{{摘要}}`,
    [
      v('平台', 'select', { options: ['公众号', '小红书', '少数派', 'V2EX'], defaultValue: '公众号' }),
      v('字数', 'number', { defaultValue: '22' }),
      v('摘要', 'textarea'),
    ], 131, 13],

  ['p-icon', 'App 图标（Midjourney）', 'v7，换个主体就能出一套', 'c-image', ['Midjourney', '图标'], false, 18, false,
    `{{主体}} app icon, {{风格}}, centered on a soft {{主色}} gradient background, rounded square, subtle glass highlights, no text, studio lighting --ar 1:1 --v 7 --style raw`,
    [
      v('主体', 'text', { placeholder: 'a paper lighthouse' }),
      v('风格', 'select', { options: ['isometric 3D', 'claymorphism', 'flat vector', 'skeuomorphic'], defaultValue: 'isometric 3D' }),
      v('主色', 'text', { defaultValue: 'teal' }),
    ], 78, 15],

  ['p-kid', '回答孩子的「为什么」', '说真话，再让他自己想一想', 'c-life', ['孩子', '家里'], false, 17, false,
    `我家孩子 {{年龄}} 岁，今天问我：「{{问题}}」

帮我想一个回答：
- 说真话，不糊弄，但只用他听得懂的词
- 最好能在家里做个小实验，或者指给他看
- 最后反问他一个问题，让他自己想`,
    [v('年龄', 'number', { defaultValue: '6' }), v('问题', 'text')], 63, 16],

  ['p-reading', '读书笔记：用自己的话复述', '复述一遍才知道自己懂没懂', 'c-learn', ['读书'], false, 28, false,
    `我刚读完《{{书名}}》的{{章节}}，下面是我的笔记。请：
1. 指出我理解错的地方，或者漏掉的关键点
2. 用不超过 200 字复述这一章，像讲给一个没读过的朋友
3. 问我两个问题，检验我是不是真懂了（先别给答案）

我的笔记：
{{笔记}}`,
    [v('书名', 'text'), v('章节', 'text', { placeholder: '第 3 章' }), v('笔记', 'textarea')], 165, 18],

  ['p-concept', '一个概念讲三遍', '一句话版、高中生版、从业者版', 'c-learn', ['概念'], false, 37, false,
    `用三个层次给我解释「{{概念}}」：
1. 一句话版
2. 讲给高中生的版本
3. 讲给从业者的版本

每个版本都带一个具体的例子。最后告诉我，大家最常见的一个误解是什么。`,
    [v('概念', 'text', { placeholder: '比如：向量数据库' })], 140, 20],

  ['p-regex', '正则：写一个，再解释一遍', '顺手给出测试样例', 'c-code', ['正则'], false, 33, false,
    `写一个 {{风格}} 正则。
要匹配：{{要匹配的}}
不能匹配：{{不能匹配的}}

写完逐段解释，最后各给 5 个应该匹配和不应该匹配的例子，我要直接贴进测试里。`,
    [
      v('风格', 'select', { options: ['JavaScript', 'PCRE', 'POSIX'], defaultValue: 'JavaScript' }),
      v('要匹配的', 'text'),
      v('不能匹配的', 'text', { required: false }),
    ], 262, 22],

  ['p-testcase', '需求翻成测试用例', '从需求文档里把边界条件挖出来', 'c-code', ['测试', '工作'], false, 19, false,
    `把下面这段需求翻成测试用例，表格三列：场景 / 操作 / 期望结果。
正常流程只写一条，重点放在边界：空值、超长、重复提交、断网、没权限、时区。
需求里没说清楚的地方，单独列在最后，写成要问产品的问题。

{{需求}}`,
    [v('需求', 'textarea')], 190, 25],

  ['p-trip', '不赶路的行程', '每天两个地方，下午留空', 'c-life', ['旅行'], false, 14, false,
    `帮我排 {{城市}} {{天数}} 天的行程，{{月份}}去。
- 每天最多两个主要地点，下午留一段空白
- 标出需要提前预约或者买票的地方
- 每天给一个下雨时的备选
- 我{{偏好}}`,
    [
      v('城市', 'text'),
      v('天数', 'number', { defaultValue: '3' }),
      v('月份', 'text'),
      v('偏好', 'text', { required: false, placeholder: '喜欢什么，不喜欢什么' }),
    ], 178, 28],

  ['p-parents', '给爸妈解释一个新东西', '三句话讲清楚，用菜市场打比方', 'c-learn', ['家里', '微信'], false, 12, false,
    `我爸妈问我：「{{问题}}」
帮我想一个能讲给他们听的说法：
- 他们 {{年龄}} 岁左右，会用智能手机，但不懂技术名词
- 用他们熟悉的东西打比方，比如银行、菜市场、电视
- 三句话以内，再补一个他们可能会追问的问题和回答`,
    [v('问题', 'text'), v('年龄', 'number', { defaultValue: '65' })], 226, 33],

  ['p-cover', '公众号头图（即梦）', '左边留白放标题', 'c-image', ['即梦', '公众号'], false, 11, false,
    `{{主题}}，扁平插画，{{配色}}配色，画面右侧三分之二是主体，左侧三分之一留空用来放标题，构图简洁，不要文字，比例 2.35:1`,
    [v('主题', 'text'), v('配色', 'text', { defaultValue: '米白和墨绿' })], 240, 37],

  ['p-invoice', '催款邮件（英文）', '客气，但让对方知道不能再拖', 'c-people', ['邮件', '英文', '工作'], false, 9, false,
    `帮我写一封英文邮件，催 {{客户}} 付 {{发票号}} 这张发票，金额 {{金额}}，已经逾期 {{逾期天数}} 天。
- 这是第 {{第几次}} 次提醒，语气随次数递进，但不威胁
- 附上付款方式：{{付款方式}}
- 结尾给一个明确的日期，问对方能否在那之前付款
- 不超过 150 个词`,
    [
      v('客户', 'text'),
      v('发票号', 'text'),
      v('金额', 'text'),
      v('逾期天数', 'number', { defaultValue: '14' }),
      v('第几次', 'number', { defaultValue: '2' }),
      v('付款方式', 'text', { defaultValue: 'Wise / PayPal' }),
    ], 285, 41],
];

// 上次复制时的填写值：打开提示词时会预填，同时出现在「使用记录」里
// [提示词, 几小时前, 填写值]
const usageRows = [
  ['p-decline', 47, { 对方: '亲戚', 事情: '周六去表弟家帮他装电脑，顺便看看新买的显卡为什么不亮', 原因: '周六要带孩子去医院复查，而且我对显卡真的不熟', 语气: '温和' }],
  ['p-decline', 220, { 对方: '同事', 事情: '周五晚上替他顶一次线上值班', 原因: '那天是结婚纪念日，餐厅一个月前就订好了', 语气: '干脆' }],
  ['p-decline', 530, { 对方: '前同事', 事情: '帮他公司的新产品在朋友圈转发一下', 原因: '产品我没用过，不想替它背书', 语气: '温和' }],
  ['p-fridge', 2, { 食材: '半颗包菜、4 个鸡蛋、一盒嫩豆腐、昨天剩的米饭、半根胡萝卜、两根葱', 人数: '2', 时间: '25', 忌口: '一个人不吃香菜' }],
  ['p-fridge', 75, { 食材: '两个西红柿、一块牛腩（冻着）、土豆、半袋挂面', 人数: '3', 时间: '40', 忌口: '' }],
  ['p-commit', 1, { 语言: '中文', diff: `diff --git a/src/upload/retry.ts b/src/upload/retry.ts
@@ -18,9 +18,14 @@ export async function uploadWithRetry(file: File) {
-  for (let i = 0; i < 3; i++) {
+  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
     try {
       return await upload(file)
     } catch (error) {
-      await sleep(1000)
+      if (!isRetryable(error)) throw error
+      await sleep(backoff(attempt))
     }
   }` }],
  ['p-commit', 6, { 语言: 'English', diff: '(省略)' }],
  ['p-de-ai', 3, { 原文: '在当今快速发展的数字化时代，值得注意的是，手冲咖啡不仅仅是一种饮品，更是一种生活态度的体现。' }],
  ['p-shell', 5, { shell: 'zsh', 描述: '把 Downloads 里所有 HEIC 照片转成 JPG，放到桌面一个新文件夹里' }],
  ['p-release', 28, { app_name: '潮汐番茄钟', version: '2.4.0', platform: 'App Store', highlights: '专注时可以把手机翻过来自动开始计时\n统计页可以按周看了\n支持 iPad 分屏', fixes: '锁屏后计时偶尔慢几秒\n深色模式下设置页的分割线看不见\n导出 CSV 时日期变成了数字' }],
  ['p-coffee', 26, { 豆子: '埃塞俄比亚 耶加雪菲 G1 水洗', 烘焙度: '浅烘', 问题: '太酸', 参数: '15g 粉 / 240ml / 92°C / C40 24 格 / 2:10' }],
  ['p-kid', 52, { 年龄: '6', 问题: '为什么月亮会跟着我们的车走？' }],
  ['p-group-chat', 8, { 聊天记录: '（周会群，126 条）' }],
  ['p-review', 30, { 语言: 'TypeScript', 代码: '(粘贴的 diff)' }],
  ['p-trip', 340, { 城市: '泉州', 天数: '3', 月份: '11 月', 偏好: '喜欢老街和寺庙，不爱排队，能吃辣' }],
  ['p-parents', 400, { 问题: '你说的那个云备份，是不是别人也能看到我手机里的照片？', 年龄: '65' }],
  ['p-icon', 360, { 主体: 'a tiny lighthouse made of folded paper', 风格: 'isometric 3D', 主色: 'teal' }],
];

// 历史版本：[提示词, 版本号, 几天前, 修改说明, 正文]
const historyRows = [
  ['p-commit', 1, 212, '初版', '根据下面的 diff 写一条 commit message，用 Conventional Commits 格式。\n\n{{diff}}'],
  ['p-commit', 2, 150, '标题限制从 72 改成 50 个字符',
    '根据下面的 diff 写一条 commit message。\n\n- 用 Conventional Commits\n- 标题不超过 50 个字符\n- 正文只写为什么改\n\n{{diff}}'],
  ['p-commit', 3, 41, '加上中英文选项',
    '根据下面的 diff 写一条 commit message。\n\n- 用 Conventional Commits，type 从 feat / fix / refactor / docs / chore 里选\n- 标题用{{语言}}，不超过 50 个字符，结尾不加句号\n- 正文只写为什么改，diff 里看得出来的不用复述\n\n{{diff}}'],
  ['p-de-ai', 1, 30, '初版', '把下面这段改得像人写的，不要太书面。\n\n{{原文}}'],
  ['p-de-ai', 2, 11, '列出具体要删的词',
    '下面这段是 AI 写的初稿，帮我改得像人写的：\n- 删掉「值得注意的是」「总而言之」这一类词\n- 不要排比\n- 不要加新内容\n\n原文：\n{{原文}}'],
  ['p-review', 1, 55, '初版', '帮我 review 下面这段代码，列出所有问题。\n\n{{代码}}'],
  ['p-release', 1, 70, '初版', '把下面的改动整理成 {{ app_name }} {{ version }} 的更新说明。\n\n{% for item in highlights %}\n- {{ item }}\n{% endfor %}'],
];

const aiConfigRows = [
  {
    configId: 'lmstudio-local', name: 'LM Studio', type: 'lmstudio', baseURL: 'http://127.0.0.1:1234/v1',
    models: ['qwen/qwen3.5-9b', 'qwen/qwen3.8-27b'], defaultModel: 'qwen/qwen3.5-9b',
    enabled: true, isPreferred: true, temperature: 0.6, maxTokens: 4096, created: 287, updated: 2,
    systemPrompt: `帮我写一条以后能反复用的提示词。
- 直接写给 AI 的指令，用「你」或者祈使句，口语一点
- 不要用「# Role」「你是一位资深……」开头，也不要 Markdown 标题和加粗
- 每次会变的内容用 {{变量名}} 标出来，变量名用简短的中文
- 能用 5 条说清楚就别写 10 条
只输出提示词本身，不要解释。`,
  },
  {
    configId: 'deepseek', name: 'DeepSeek', type: 'deepseek', baseURL: 'https://api.deepseek.com/v1',
    apiKey: 'sk-demo-0000-not-a-real-key-7f3a', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat',
    enabled: true, isPreferred: false, temperature: 0.7, maxTokens: 4096, created: 280, updated: 20,
  },
  {
    configId: 'nas-ollama', name: '家里 NAS 上的 Ollama', type: 'ollama', baseURL: 'http://192.168.31.20:11434',
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
  ['说人话', '去掉套话和书面腔，改成平时说话的样子', '把下面的提示词改得口语一点：去掉套话、书面腔和不必要的修饰，意思和要求一条都不能少。只输出改写后的提示词，不要解释。\n\n{{content}}', true],
  ['更专业', '让提示词更专业、正式，适合商业或学术场景', '请把下面的提示词改写得更专业、正式，适合商业或学术场景使用。只输出改写后的提示词，不要解释。\n\n{{content}}', false],
];

const aiHistoryRows = [
  ['把每周的家庭开支流水整理成一张表，标出超预算的几项', 'lmstudio-local', 'qwen/qwen3.5-9b', 4,
    '下面是我们家这周的开支流水（微信和支付宝导出的，格式可能很乱）：\n{{流水}}\n\n每月预算：{{预算}}\n\n请整理成一张表：日期 / 花在哪 / 金额 / 归类（吃饭、买菜、交通、孩子、其他）。\n表格下面单独列出这周超出预算的类别，每类说一句可能的原因。不用给省钱建议。'],
  ['面试前帮我模拟追问，岗位是前端，三年经验', 'deepseek', 'deepseek-chat', 11,
    '你是一个 {{公司类型}} 的前端面试官，我面的是 {{职级}}。\n我先讲一个项目，你根据我说的内容连续追问三层，每次只问一个问题。\n问到我答不上来就停下，告诉我这个点应该怎么准备。\n\n我的项目：{{项目介绍}}'],
  ['给 6 岁小孩讲睡前故事，主角是家里那只橘猫', 'lmstudio-local', 'qwen/qwen3.5-9b', 23,
    '给一个 {{年龄}} 岁的孩子讲一个睡前故事，主角是我们家的橘猫「{{猫的名字}}」。\n- 五分钟能讲完\n- 有一个小小的冒险，但结尾安静，适合睡觉\n- 故事里藏一个关于{{主题}}的道理，不要直接说出来'],
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
