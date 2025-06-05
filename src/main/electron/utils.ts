import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 获取应用图标路径
 * 根据不同平台尝试多个可能的图标位置，返回第一个存在的图标文件路径
 * @returns 图标文件路径，如果未找到则返回空字符串
 */
export function getAppIconPath(): string {
  // 根据平台确定首选的图标格式和文件名
  let preferredIcons: string[] = [];
  
  if (process.platform === 'win32') {
    // Windows 平台优先使用 .ico 格式
    preferredIcons = [
      'windows.ico',
      'tray.ico', 
      'icon.ico',
      'tray.png',
      'icon.png'
    ];
  } else if (process.platform === 'darwin') {
    // macOS 平台优先使用 .icns 和高分辨率 PNG
    preferredIcons = [
      'macos.icns',
      'tray@2x.png',
      'icon@2x.png',
      'tray.png',
      'icon.png'
    ];
  } else {
    // Linux 和其他平台使用 PNG
    preferredIcons = [
      'linux.png',
      'tray.png',
      'icon.png'
    ];
  }

  // 尝试多个可能的基础路径
  const basePaths = [
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
  ];

  // 遍历所有基础路径和图标文件名组合
  for (const basePath of basePaths) {
    for (const iconName of preferredIcons) {
      const iconPath = join(basePath, iconName);
      if (existsSync(iconPath)) {
        console.log(`找到图标文件: ${iconPath}`);
        return iconPath;
      }
    }
  }

  // 如果没有找到图标文件，返回空字符串
  console.warn('未找到图标文件，使用系统默认图标');
  console.warn('尝试的路径:', basePaths.map(base => 
    preferredIcons.map(icon => join(base, icon))
  ).flat());
  return '';
}
