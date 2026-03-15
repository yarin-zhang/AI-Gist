const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 开始构建移动端应用...\n');

// 1. 构建渲染进程（使用移动端配置）
console.log('📦 步骤 1/3: 构建渲染进程...');
try {
  execSync('vite build --config vite.config.mobile.js', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ 渲染进程构建完成\n');
} catch (error) {
  console.error('❌ 渲染进程构建失败:', error.message);
  process.exit(1);
}

// 2. 复制 index.html 到构建目录（如果需要）
console.log('📋 步骤 2/3: 准备移动端资源...');
const buildDir = path.join(__dirname, '..', 'build', 'renderer');
if (!fs.existsSync(buildDir)) {
  console.error('❌ 构建目录不存在');
  process.exit(1);
}
console.log('✅ 移动端资源准备完成\n');

// 3. 同步到 Capacitor
console.log('🔄 步骤 3/3: 同步到 Capacitor...');
try {
  execSync('npx cap sync', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ Capacitor 同步完成\n');
} catch (error) {
  console.error('❌ Capacitor 同步失败:', error.message);
  process.exit(1);
}

console.log('🎉 移动端应用构建完成！');
console.log('\n下一步操作:');
console.log('  iOS:     yarn cap:ios');
console.log('  Android: yarn cap:android');
