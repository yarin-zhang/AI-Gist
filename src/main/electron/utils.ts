import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 平台特定的图标配置
 * 定义每个平台首选的图标文件名和格式
 */
const PLATFORM_ICONS = {
  win32: [
    'windows.ico',
    'tray.ico', 
    'icon.ico',
    'tray.png',
    'icon.png'
  ],
  darwin: [
    'macos.icns',
    'tray@2x.png',
    'icon@2x.png',
    'tray.png',
    'icon.png'
  ],
  default: [
    'linux.png',
    'tray.png',
    'icon.png'
  ]
} as const;

/**
 * 可能的图标文件基础路径
 * 按优先级排序：开发环境 -> 打包环境 -> 其他路径
 */
const ICON_BASE_PATHS = [
  // 开发环境路径
  join(process.cwd(), 'src', 'assets'),
  join(__dirname, '..', '..', 'assets'),
  join(__dirname, '..', 'assets'),
  // 打包后的路径
  join(process.resourcesPath, 'assets'),
  join(__dirname, 'assets'),
  // 其他可能的路径
  join(process.cwd(), 'assets'),
  join(process.cwd(), 'build', 'assets')
] as const;

/**
 * 获取当前平台的首选图标列表
 * @returns 当前平台的首选图标文件名数组
 */
function getPreferredIcons(): readonly string[] {
  const platform = process.platform as keyof typeof PLATFORM_ICONS;
  return PLATFORM_ICONS[platform] || PLATFORM_ICONS.default;
}

/**
 * 查找图标文件
 * @param preferredIcons 首选图标文件名列表
 * @returns 找到的图标文件路径，如果未找到则返回空字符串
 */
function findIconFile(preferredIcons: readonly string[]): string {
  for (const basePath of ICON_BASE_PATHS) {
    for (const iconName of preferredIcons) {
      const iconPath = join(basePath, iconName);
      if (existsSync(iconPath)) {
        console.log(`找到图标文件: ${iconPath}`);
        return iconPath;
      }
    }
  }
  return '';
}

/**
 * 记录未找到图标时的调试信息
 * @param preferredIcons 尝试的图标文件名列表
 */
function logIconSearchFailure(preferredIcons: readonly string[]): void {
  console.warn('未找到图标文件，使用系统默认图标');
  
  const attemptedPaths = ICON_BASE_PATHS.flatMap(basePath =>
    preferredIcons.map(iconName => join(basePath, iconName))
  );
  
  console.warn('尝试的路径:', attemptedPaths);
}

/**
 * 获取应用图标路径
 * 根据不同平台尝试多个可能的图标位置，返回第一个存在的图标文件路径
 * @returns 图标文件路径，如果未找到则返回空字符串
 */
export function getAppIconPath(): string {
  const preferredIcons = getPreferredIcons();
  const iconPath = findIconFile(preferredIcons);
  
  if (!iconPath) {
    logIconSearchFailure(preferredIcons);
  }
  
  return iconPath;
}
