import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getaigist.app',
  appName: 'AI Gist',
  webDir: 'build/renderer',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,   // 由代码手动调用 SplashScreen.hide() 控制隐藏时机
      fadeOutDuration: 300,
      // 不设底色：启动图本身分浅色 / 深色两套（Android drawable-night、iOS dark appearance），跟随系统主题
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
