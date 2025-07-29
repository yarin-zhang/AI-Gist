import { session, net } from 'electron';

/**
 * 网络代理管理器
 * 负责配置 Electron 应用的网络代理设置
 */
export class NetworkProxyManager {
  
  /**
   * 代理配置类型
   */
  static readonly PROXY_MODES = {
    DIRECT: 'direct',           // 直连
    SYSTEM: 'system',           // 系统代理
    MANUAL: 'manual',           // 手动配置
  } as const;

  /**
   * 测试网站配置
   */
  static readonly TEST_SITES = [
    {
      name: '百度',
      url: 'https://www.baidu.com',
      description: '国内网站'
    },
    {
      name: 'GitHub',
      url: 'https://github.com',
      description: '海外代码托管平台'
    },
    {
      name: 'Google',
      url: 'https://www.google.com',
      description: '海外搜索引擎'
    },
    {
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/models',
      description: '海外 AI 服务'
    }
  ];

  /**
   * 初始化网络代理配置
   * 根据用户设置配置代理
   */
  static async initialize(proxyConfig?: {
    mode: 'direct' | 'system' | 'manual';
    manualConfig?: {
      httpProxy?: string;
      httpsProxy?: string;
      noProxy?: string;
    };
  }): Promise<void> {
    try {
      console.log('开始初始化网络代理配置...');
      
      if (!proxyConfig) {
        // 如果没有配置，使用系统代理
        await this.configureSystemProxy();
        return;
      }

      switch (proxyConfig.mode) {
        case this.PROXY_MODES.DIRECT:
          await this.setDirectConnection();
          break;
        case this.PROXY_MODES.SYSTEM:
          await this.configureSystemProxy();
          break;
        case this.PROXY_MODES.MANUAL:
          if (proxyConfig.manualConfig) {
            await this.setManualProxy(proxyConfig.manualConfig);
          }
          break;
        default:
          await this.configureSystemProxy();
      }
      
      console.log('✅ 网络代理配置完成');
    } catch (error) {
      console.error('初始化网络代理配置时出错:', error);
      // 即使配置失败也不应该阻止应用启动
    }
  }

  /**
   * 配置系统代理
   */
  private static async configureSystemProxy(): Promise<void> {
    try {
      console.log('配置使用系统代理...');
      
      // 设置 Electron 使用系统代理
      await session.defaultSession.setProxy({
        mode: 'system'
      });
      
      // 等待一下确保代理配置生效
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 获取系统代理配置
      const proxyConfig = await session.defaultSession.resolveProxy('https://www.google.com');
      console.log('系统代理配置:', proxyConfig);
      
      // 为 Node.js 模块设置代理环境变量
      if (proxyConfig && proxyConfig !== 'DIRECT') {
        await this.configureNodeProxyEnvironment(proxyConfig);
      }
      
      console.log('✅ 已配置使用系统代理');
    } catch (error) {
      console.error('配置系统代理失败:', error);
      throw error;
    }
  }

  /**
   * 设置直连模式
   */
  private static async setDirectConnection(): Promise<void> {
    try {
      console.log('配置直连模式...');
      
      await session.defaultSession.setProxy({
        mode: 'direct'
      });
      
      // 清除环境变量
      this.clearProxyEnvironment();
      
      console.log('✅ 已配置直连模式');
    } catch (error) {
      console.error('配置直连模式失败:', error);
      throw error;
    }
  }

  /**
   * 设置手动代理配置
   */
  private static async setManualProxy(config: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: string;
  }): Promise<void> {
    try {
      console.log('配置手动代理:', config);
      
      // 确定要使用的代理地址
      // 如果只配置了 httpProxy，则 https 也使用相同的代理
      const httpProxy = config.httpProxy;
      const httpsProxy = config.httpsProxy || config.httpProxy;
      
      if (!httpProxy && !httpsProxy) {
        throw new Error('至少需要配置 HTTP 或 HTTPS 代理');
      }
      
      const proxyRules: string[] = [];
      
      if (httpProxy) {
        proxyRules.push(`http=${httpProxy}`);
      }
      
      if (httpsProxy) {
        proxyRules.push(`https=${httpsProxy}`);
      }
      
      if (config.noProxy) {
        proxyRules.push(`bypass-list=${config.noProxy}`);
      }
      
      const proxyRulesString = proxyRules.join(';');
      console.log('代理规则:', proxyRulesString);
      
      // 确保至少有一个代理规则
      if (proxyRules.length === 0) {
        throw new Error('没有配置有效的代理规则');
      }
      
      // 设置代理配置
      await session.defaultSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: proxyRulesString
      });
      
      console.log('✅ 代理配置已设置');
      
      // 等待一下确保代理配置生效
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证代理配置是否生效
      const validation = await this.validateProxyConfiguration();
      console.log('代理配置验证结果:', validation);
      
      if (!validation.isValid) {
        console.warn('代理配置可能未正确应用:', validation.error);
      }
      
      // 设置环境变量
      if (httpProxy) {
        process.env.HTTP_PROXY = `http://${httpProxy}`;
        process.env.http_proxy = `http://${httpProxy}`;
      }
      
      if (httpsProxy) {
        process.env.HTTPS_PROXY = `http://${httpsProxy}`;
        process.env.https_proxy = `http://${httpsProxy}`;
      }
      
      if (config.noProxy) {
        process.env.NO_PROXY = config.noProxy;
        process.env.no_proxy = config.noProxy;
      }
      
      console.log('✅ 已配置手动代理');
      console.log('环境变量:', {
        HTTP_PROXY: process.env.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        NO_PROXY: process.env.NO_PROXY
      });
    } catch (error) {
      console.error('配置手动代理失败:', error);
      throw error;
    }
  }

  /**
   * 为 Node.js 模块配置代理环境变量
   */
  private static async configureNodeProxyEnvironment(proxyConfig: string): Promise<void> {
    try {
      // 解析代理配置
      if (proxyConfig.includes('PROXY')) {
        // 提取代理地址，格式通常是 "PROXY 127.0.0.1:7890"
        const proxyMatch = proxyConfig.match(/PROXY\s+([^;]+)/);
        if (proxyMatch) {
          const proxyAddress = proxyMatch[1].trim();
          const proxyUrl = `http://${proxyAddress}`;
          
          // 设置环境变量
          process.env.HTTP_PROXY = proxyUrl;
          process.env.HTTPS_PROXY = proxyUrl;
          process.env.http_proxy = proxyUrl;
          process.env.https_proxy = proxyUrl;
          
          console.log(`✅ 已设置 Node.js 代理环境变量: ${proxyUrl}`);
        }
      }
    } catch (error) {
      console.error('配置 Node.js 代理环境变量失败:', error);
    }
  }

  /**
   * 清除代理环境变量
   */
  private static clearProxyEnvironment(): void {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    
    console.log('✅ 已清除代理环境变量');
  }

  /**
   * 获取当前代理配置信息
   */
  static async getProxyInfo(url: string = 'https://www.google.com'): Promise<string> {
    try {
      const proxyInfo = await session.defaultSession.resolveProxy(url);
      console.log(`获取代理信息 (${url}):`, proxyInfo);
      return proxyInfo;
    } catch (error) {
      console.error('获取代理信息失败:', error);
      return 'DIRECT';
    }
  }

  /**
   * 验证代理配置是否正确应用
   */
  static async validateProxyConfiguration(): Promise<{
    isValid: boolean;
    proxyInfo: string;
    error?: string;
  }> {
    try {
      const proxyInfo = await this.getProxyInfo();
      console.log('当前代理配置验证:', proxyInfo);
      
      // 检查代理配置是否有效
      if (proxyInfo === 'DIRECT') {
        return {
          isValid: true,
          proxyInfo,
          error: '使用直连模式'
        };
      }
      
      if (proxyInfo.includes('PROXY')) {
        return {
          isValid: true,
          proxyInfo
        };
      }
      
      // 对于手动配置的代理，可能不会显示 PROXY 前缀
      // 检查是否有代理相关的配置
      if (proxyInfo && proxyInfo !== 'DIRECT') {
        return {
          isValid: true,
          proxyInfo
        };
      }
      
      return {
        isValid: false,
        proxyInfo,
        error: '代理配置格式无效'
      };
    } catch (error) {
      return {
        isValid: false,
        proxyInfo: 'UNKNOWN',
        error: error instanceof Error ? error.message : '验证失败'
      };
    }
  }

  /**
   * 测试代理连接（实时版本）
   */
  static async testProxyConnectionRealTime(
    onProgress: (result: {
      name: string;
      url: string;
      description: string;
      success: boolean;
      responseTime?: number;
      error?: string;
    }) => void,
    proxyConfig?: {
      mode: 'direct' | 'system' | 'manual';
      manualConfig?: {
        httpProxy?: string;
        httpsProxy?: string;
        noProxy?: string;
      };
    }
  ): Promise<{
    overall: {
      success: boolean;
      totalSites: number;
      successSites: number;
      failedSites: number;
    };
  }> {
    try {
      console.log('开始测试代理连接...');
      
      // 如果提供了代理配置，先应用它
      if (proxyConfig) {
        console.log('应用代理配置进行测试:', proxyConfig);
        await this.initialize(proxyConfig);
      }
      
      // 验证当前代理配置
      const validation = await this.validateProxyConfiguration();
      console.log('代理配置验证结果:', validation);
      
      if (!validation.isValid) {
        console.warn('代理配置验证失败:', validation.error);
      }
      
      let successCount = 0;
      let failedCount = 0;
      
      for (const site of this.TEST_SITES) {
        try {
          console.log(`测试连接: ${site.name} (${site.url})`);
          const startTime = Date.now();
          
          // 使用 Electron 的 net 模块进行连接测试
          const result = await this.testSiteWithNet(site.url);
          const responseTime = Date.now() - startTime;
          
          if (result.success) {
            console.log(`✅ ${site.name} 连接成功，响应时间: ${responseTime}ms`);
            successCount++;
            onProgress({
              name: site.name,
              url: site.url,
              description: site.description,
              success: true,
              responseTime
            });
          } else {
            console.log(`❌ ${site.name} 连接失败: ${result.error}`);
            failedCount++;
            onProgress({
              name: site.name,
              url: site.url,
              description: site.description,
              success: false,
              error: result.error
            });
          }
        } catch (error) {
          console.error(`${site.name} 连接测试失败:`, error);
          failedCount++;
          onProgress({
            name: site.name,
            url: site.url,
            description: site.description,
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          });
        }
      }
      
      const overall = {
        success: successCount >= Math.ceil(this.TEST_SITES.length / 2), // 至少一半网站成功才算成功
        totalSites: this.TEST_SITES.length,
        successSites: successCount,
        failedSites: failedCount
      };
      
      console.log(`✅ 代理连接测试完成，成功: ${successCount}/${this.TEST_SITES.length}`);
      
      return {
        overall
      };
    } catch (error) {
      console.error('代理连接测试失败:', error);
      return {
        overall: {
          success: false,
          totalSites: this.TEST_SITES.length,
          successSites: 0,
          failedSites: this.TEST_SITES.length
        }
      };
    }
  }

  /**
   * 使用 Electron net 模块测试单个网站连接
   */
  private static async testSiteWithNet(url: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        
        // 根据不同的网站使用不同的测试方法
        const isApiEndpoint = url.includes('/v1/') || url.includes('/api/');
        const method = isApiEndpoint ? 'GET' : 'HEAD';
        
        // 确保使用正确的 session（已配置代理的 session）
        const request = net.request({
          method: method,
          protocol: urlObj.protocol as 'http:' | 'https:',
          hostname: urlObj.hostname,
          port: urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          session: session.defaultSession // 明确指定使用 defaultSession
        });

        // 添加 User-Agent 头，避免被某些网站拒绝
        request.setHeader('User-Agent', 'AI-Gist/1.0 (Electron)');

        // 设置超时
        const timeout = setTimeout(() => {
          request.abort();
          resolve({
            success: false,
            error: '连接超时'
          });
        }, 5000);

        request.on('response', (response) => {
          clearTimeout(timeout);
          
          // 对于 API 端点，401/403 也认为是连接成功（说明网络可达，只是需要认证）
          if (response.statusCode && (
            response.statusCode >= 200 && response.statusCode < 400 ||
            (isApiEndpoint && (response.statusCode === 401 || response.statusCode === 403))
          )) {
            resolve({
              success: true
            });
          } else {
            resolve({
              success: false,
              error: `HTTP ${response.statusCode}`
            });
          }
        });

        request.on('error', (error) => {
          clearTimeout(timeout);
          console.error(`网络请求错误 (${url}):`, error);
          resolve({
            success: false,
            error: error.message || '网络错误'
          });
        });

        request.on('abort', () => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: '连接被中断'
          });
        });

        request.end();
      } catch (error) {
        console.error(`URL 解析错误 (${url}):`, error);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'URL 解析错误'
        });
      }
    });
  }

  /**
   * 获取系统代理信息
   */
  static async getSystemProxyInfo(): Promise<{
    hasProxy: boolean;
    proxyConfig?: string;
    proxyAddress?: string;
  }> {
    try {
      const proxyConfig = await this.getProxyInfo();
      
      if (proxyConfig && proxyConfig !== 'DIRECT') {
        const proxyMatch = proxyConfig.match(/PROXY\s+([^;]+)/);
        const proxyAddress = proxyMatch ? proxyMatch[1].trim() : undefined;
        
        return {
          hasProxy: true,
          proxyConfig,
          proxyAddress
        };
      }
      
      return {
        hasProxy: false
      };
    } catch (error) {
      console.error('获取系统代理信息失败:', error);
      return {
        hasProxy: false
      };
    }
  }

  /**
   * 刷新系统代理信息
   */
  static async refreshSystemProxyInfo(): Promise<{
    hasProxy: boolean;
    proxyConfig?: string;
    proxyAddress?: string;
    lastRefreshTime: string;
  }> {
    try {
      console.log('刷新系统代理信息...');
      
      // 先设置系统代理模式
      await session.defaultSession.setProxy({
        mode: 'system'
      });
      
      // 等待一下确保代理配置生效
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 获取最新的系统代理信息
      const proxyConfig = await this.getProxyInfo();
      console.log('刷新后的系统代理配置:', proxyConfig);
      
      if (proxyConfig && proxyConfig !== 'DIRECT') {
        const proxyMatch = proxyConfig.match(/PROXY\s+([^;]+)/);
        const proxyAddress = proxyMatch ? proxyMatch[1].trim() : undefined;
        
        return {
          hasProxy: true,
          proxyConfig,
          proxyAddress,
          lastRefreshTime: new Date().toLocaleString()
        };
      }
      
      return {
        hasProxy: false,
        lastRefreshTime: new Date().toLocaleString()
      };
    } catch (error) {
      console.error('刷新系统代理信息失败:', error);
      return {
        hasProxy: false,
        lastRefreshTime: new Date().toLocaleString()
      };
    }
  }
}
