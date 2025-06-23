/**
 * WebDAV 密码处理工具类
 * 处理密码的加密和解密，避免IPC调用问题
 */

export class WebDAVPasswordManager {
    private static instance: WebDAVPasswordManager;
    
    static getInstance(): WebDAVPasswordManager {
        if (!WebDAVPasswordManager.instance) {
            WebDAVPasswordManager.instance = new WebDAVPasswordManager();
        }
        return WebDAVPasswordManager.instance;
    }
    
    /**
     * 检查密码是否是占位符
     */
    isPlaceholderPassword(password: string): boolean {
        return password === '••••••••' || password === '********';
    }
    
    /**
     * 生成占位符密码
     */
    generatePlaceholder(): string {
        return '••••••••';
    }
    
    /**
     * 检查是否有存储的密码配置
     */
    hasStoredPassword(webdavConfig: any): boolean {
        return !!(webdavConfig && webdavConfig.password && 
                 typeof webdavConfig.password === 'object' && 
                 webdavConfig.password.encrypted);
    }
    
    /**
     * 清理配置对象，确保可序列化
     * 在测试连接时，如果密码是占位符，我们需要让后端知道使用存储的密码
     */
    cleanConfig(config: any): any {
        if (!config) return {};
        
        const cleanedConfig = {
            enabled: Boolean(config.enabled || false),
            serverUrl: String(config.serverUrl || ''),
            username: String(config.username || ''),
            password: String(config.password || ''),
            autoSync: Boolean(config.autoSync || false),
            syncInterval: Number(config.syncInterval || 30),
        };
        
        // 如果密码是占位符，设置为空字符串，让后端使用存储的密码
        if (this.isPlaceholderPassword(cleanedConfig.password)) {
            cleanedConfig.password = '';
        }
        
        return cleanedConfig;
    }
    
    /**
     * 验证配置完整性
     * @param config 配置对象
     * @param options 验证选项
     */
    validateConfig(
        config: any, 
        options: { skipPasswordValidation?: boolean } = {}
    ): { valid: boolean; message?: string } {
        if (!config) {
            return { valid: false, message: '配置为空' };
        }
        
        if (!config.serverUrl || config.serverUrl.trim() === '') {
            return { valid: false, message: '服务器地址不能为空' };
        }
        
        if (!config.username || config.username.trim() === '') {
            return { valid: false, message: '用户名不能为空' };
        }
        
        // 如果不跳过密码验证
        if (!options.skipPasswordValidation) {
            if (!config.password || config.password.trim() === '') {
                return { valid: false, message: '密码不能为空' };
            }
            
            // 只有当密码是占位符时才视为无效
            if (this.isPlaceholderPassword(config.password.trim())) {
                return { valid: false, message: '请输入密码' };
            }
        }
        
        return { valid: true };
    }
    
    /**
     * 验证同步所需的配置
     * @param config WebDAV配置
     * @param passwordState 密码状态
     */
    validateForSync(config: any, passwordState: any): { isValid: boolean; message?: string } {
        if (!config) {
            return { isValid: false, message: '配置为空' };
        }
        
        if (!config.enabled) {
            return { isValid: false, message: '请先启用WebDAV同步' };
        }
        
        if (!config.serverUrl || config.serverUrl.trim() === '') {
            return { isValid: false, message: '服务器地址不能为空' };
        }
        
        if (!config.username || config.username.trim() === '') {
            return { isValid: false, message: '用户名不能为空' };
        }
        
        // 检查密码状态
        if (!passwordState.hasStoredPassword) {
            // 没有存储的密码，需要当前输入的密码
            if (!config.password || config.password.trim() === '' || this.isPlaceholderPassword(config.password.trim())) {
                return { isValid: false, message: '请输入密码' };
            }
        }
        // 如果有存储的密码，不需要检查当前密码字段
        
        return { isValid: true };
    }
}

export const webdavPasswordManager = WebDAVPasswordManager.getInstance();
