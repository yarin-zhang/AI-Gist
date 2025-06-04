import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 获取应用图标路径
 * 尝试多个可能的图标位置，返回第一个存在的图标文件路径
 * @returns 图标文件路径，如果未找到则返回空字符串
 */
export function getAppIconPath(): string {
  // 尝试多个可能的图标路径
  const possiblePaths = [
    join(__dirname, '..', 'assets', 'icon.png'),
    join(__dirname, '..', 'assets', 'app.png'),
    join(__dirname, '..', 'assets', 'tray.png'),
    join(process.cwd(), 'assets', 'icon.png'),
    join(process.cwd(), 'src', 'assets', 'icon.png')
  ];

  for (const iconPath of possiblePaths) {
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  // 如果没有找到图标文件，返回空字符串
  console.warn('未找到图标文件，使用系统默认图标');
  return '';
}
