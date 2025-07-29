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
      
      // 获取系统代理配置
      const proxyConfig = await session.defaultSession.resolveProxy('https://www.google.com');
      console.log('系统代理配置:', proxyConfig);
      
      // 设置 Electron 使用系统代理
      await session.defaultSession.setProxy({
        mode: 'system'
      });
      
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
      
      const proxyRules: string[] = [];
      
      if (config.httpProxy) {
        proxyRules.push(`http=${config.httpProxy}`);
      }
      
      if (config.httpsProxy) {
        proxyRules.push(`https=${config.httpsProxy}`);
      }
      
      if (config.noProxy) {
        proxyRules.push(`bypass-list=${config.noProxy}`);
      }
      
      await session.defaultSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: proxyRules.join(';')
      });
      
      // 设置环境变量
      if (config.httpProxy) {
        process.env.HTTP_PROXY = `http://${config.httpProxy}`;
        process.env.http_proxy = `http://${config.httpProxy}`;
      }
      
      if (config.httpsProxy) {
        process.env.HTTPS_PROXY = `http://${config.httpsProxy}`;
        process.env.https_proxy = `http://${config.httpsProxy}`;
      }
      
      if (config.noProxy) {
        process.env.NO_PROXY = config.noProxy;
        process.env.no_proxy = config.noProxy;
      }
      
      console.log('✅ 已配置手动代理');
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
      return await session.defaultSession.resolveProxy(url);
    } catch (error) {
      console.error('获取代理信息失败:', error);
      return 'DIRECT';
    }
  }

  /**
   * 测试代理连接（实时版本）
   */
  static async testProxyConnectionRealTime(onProgress: (result: {
    name: string;
    url: string;
    description: string;
    success: boolean;
    responseTime?: number;
    error?: string;
  }) => void): Promise<{
    overall: {
      success: boolean;
      totalSites: number;
      successSites: number;
      failedSites: number;
    };
  }> {
    try {
      console.log('开始测试代理连接...');
      
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
        
        const request = net.request({
          method: method,
          protocol: urlObj.protocol as 'http:' | 'https:',
          hostname: urlObj.hostname,
          port: urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search
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
}
