import { session } from 'electron';

/**
 * 网络代理管理器
 * 负责配置 Electron 应用的网络代理设置
 */
export class NetworkProxyManager {
  
  /**
   * 配置网络代理设置
   * 让 Electron 应用自动使用系统代理
   */
  static async configure(): Promise<void> {
    try {
      console.log('开始配置网络代理...');
      
      // 获取系统代理配置
      const proxyConfig = await session.defaultSession.resolveProxy('https://www.google.com');
      console.log('系统代理配置:', proxyConfig);
      
      // 如果检测到代理，配置 session 使用系统代理
      if (proxyConfig && proxyConfig !== 'DIRECT') {
        console.log('检测到系统代理，配置 Electron 使用系统代理设置');
        
        // 设置 Electron 使用系统代理
        await session.defaultSession.setProxy({
          mode: 'system'
        });
        
        // 为 LangChain 等 Node.js 模块设置代理环境变量
        await this.configureNodeProxyEnvironment(proxyConfig);
        
        console.log('✅ 已配置 Electron 和 Node.js 使用系统代理');
      } else {
        console.log('未检测到系统代理，使用直连');
      }
    } catch (error) {
      console.error('配置网络代理时出错:', error);
      // 即使配置失败也不应该阻止应用启动
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
   * 重置代理配置为直连
   */
  static async resetToDirectConnection(): Promise<void> {
    try {
      await session.defaultSession.setProxy({
        mode: 'direct'
      });
      console.log('✅ 已重置为直连模式');
    } catch (error) {
      console.error('重置代理配置失败:', error);
    }
  }

  /**
   * 设置自定义代理
   */
  static async setCustomProxy(proxyRules: string): Promise<void> {
    try {
      await session.defaultSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: proxyRules
      });
      console.log(`✅ 已设置自定义代理: ${proxyRules}`);
    } catch (error) {
      console.error('设置自定义代理失败:', error);
    }
  }
}
