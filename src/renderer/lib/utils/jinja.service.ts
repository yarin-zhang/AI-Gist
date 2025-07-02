import * as nunjucks from 'nunjucks';

/**
 * Jinja 模板服务
 * 提供模板渲染、语法检查等功能
 */
export class JinjaService {
  private env: nunjucks.Environment;

  constructor() {
    // 创建 Nunjucks 环境，使用默认配置
    this.env = new nunjucks.Environment();

    // 添加自定义过滤器
    this.addCustomFilters();
  }

  /**
   * 渲染模板
   * @param template 模板内容
   * @param context 上下文数据
   * @returns 渲染结果
   */
  render(template: string, context: Record<string, any> = {}): string {
    try {
      return this.env.renderString(template, context);
    } catch (error) {
      console.error('Jinja 模板渲染错误:', error);
      throw new Error(`模板渲染失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 验证模板语法
   * @param template 模板内容
   * @returns 验证结果
   */
  validateTemplate(template: string): { isValid: boolean; error?: string } {
    try {
      // 尝试渲染模板来验证语法
      this.env.renderString(template, {});
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 提取模板中的变量
   * @param template 模板内容
   * @returns 变量名列表
   */
  extractVariables(template: string): string[] {
    const variables = new Set<string>();
    const loopVariables = new Set<string>(); // 存储循环中定义的变量
    
    // 首先提取循环中定义的变量，这些不应该被识别为用户需要填写的变量
    const forLoopRegex = /\{%\s*for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*%\}/g;
    let match;
    
    while ((match = forLoopRegex.exec(template)) !== null) {
      loopVariables.add(match[1]); // 循环变量（如 item）
      variables.add(match[2]); // 循环列表（如 items）
    }

    // 匹配 {% if condition %} 中的条件变量
    const ifConditionRegex = /\{%\s*if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*%\}/g;
    
    while ((match = ifConditionRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    // 匹配 {{ variable }} 格式的变量，但排除循环变量
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    
    while ((match = variableRegex.exec(template)) !== null) {
      const varName = match[1];
      // 只添加不在循环变量中的变量
      if (!loopVariables.has(varName)) {
        variables.add(varName);
      }
    }

    return Array.from(variables);
  }

  /**
   * 获取模板预览（使用示例数据）
   * @param template 模板内容
   * @returns 预览结果
   */
  getPreview(template: string): { content: string; variables: string[] } {
    const variables = this.extractVariables(template);
    
    // 生成示例数据
    const sampleContext: Record<string, any> = {};
    variables.forEach(variable => {
      sampleContext[variable] = `[${variable}]`;
    });

    try {
      const content = this.render(template, sampleContext);
      return { content, variables };
    } catch (error) {
      return {
        content: `模板渲染错误: ${error instanceof Error ? error.message : String(error)}`,
        variables
      };
    }
  }

  /**
   * 添加自定义过滤器
   */
  private addCustomFilters(): void {
    // 大写过滤器
    this.env.addFilter('upper', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    // 小写过滤器
    this.env.addFilter('lower', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    // 首字母大写过滤器
    this.env.addFilter('title', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
    });

    // 截断过滤器
    this.env.addFilter('truncate', (str: string, length: number = 50) => {
      if (!str) return '';
      return str.length > length ? str.substring(0, length) + '...' : str;
    });

    // 默认值过滤器
    this.env.addFilter('default', (value: any, defaultValue: any) => {
      return value !== undefined && value !== null && value !== '' ? value : defaultValue;
    });

    // 列表连接过滤器
    this.env.addFilter('join', (list: any[], separator: string = ', ') => {
      return Array.isArray(list) ? list.join(separator) : String(list);
    });

    // 数字格式化过滤器
    this.env.addFilter('number', (num: number, precision: number = 2) => {
      return typeof num === 'number' ? num.toFixed(precision) : String(num);
    });

    // 日期格式化过滤器
    this.env.addFilter('date', (date: Date | string, format: string = 'YYYY-MM-DD') => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      
      // 简单的日期格式化
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      
      return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day);
    });
  }

  /**
   * 获取语法帮助信息
   */
  getSyntaxHelp(): Record<string, string[]> {
    return {
      variables: [
        '{{ variable_name }} - 输出变量值',
        '{{ variable_name | upper }} - 转换为大写',
        '{{ variable_name | lower }} - 转换为小写',
        '{{ variable_name | title }} - 首字母大写',
        '{{ variable_name | truncate(50) }} - 截断到指定长度',
        '{{ variable_name | default("默认值") }} - 设置默认值'
      ],
      conditionals: [
        '{% if condition %}内容{% endif %} - 条件判断',
        '{% if condition %}内容{% else %}其他内容{% endif %} - 条件判断带else',
        '{% if variable %}变量存在{% endif %} - 检查变量是否存在',
        '{% if variable == "value" %}值相等{% endif %} - 值比较'
      ],
      loops: [
        '{% for item in items %}{{ item }}{% endfor %} - 循环遍历',
        '{% for item in items %}{{ loop.index }}. {{ item }}{% endfor %} - 带索引的循环',
        '{% for item in items %}{{ item }}{% if not loop.last %}, {% endif %}{% endfor %} - 循环分隔符'
      ],
      filters: [
        '{{ variable | upper }} - 大写',
        '{{ variable | lower }} - 小写',
        '{{ variable | title }} - 首字母大写',
        '{{ variable | truncate(50) }} - 截断',
        '{{ variable | default("默认值") }} - 默认值',
        '{{ list | join(", ") }} - 列表连接',
        '{{ number | number(2) }} - 数字格式化',
        '{{ date | date("YYYY-MM-DD") }} - 日期格式化'
      ]
    };
  }
}

// 创建单例实例
export const jinjaService = new JinjaService(); 