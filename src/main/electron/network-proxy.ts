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
        
        console.log('✅ 已配置 Electron 使用系统代理');
      } else {
        console.log('未检测到系统代理，使用直连');
      }
    } catch (error) {
      console.error('配置网络代理时出错:', error);
      // 即使配置失败也不应该阻止应用启动
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
