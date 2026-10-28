import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getaigist.app',
  appName: 'AI Gist',
  webDir: 'build/renderer',
  android: {
    // 原生底栏（@rdlabo/capacitor-native-ui + 折叠屏状态）只在 iOS 上加载（见
    // src/renderer/lib/mobile/native-tab-bar.ts），Android 端不投影任何控件，却会给工程
    // 带进 Jetpack Compose。这里显式列出 Android 需要的插件，新增插件时记得一起加上。
    includePlugins: [
      '@capacitor/app',
      '@capacitor/camera',
      '@capacitor/filesystem',
      '@capacitor/preferences',
      '@capacitor/share',
      '@capacitor/splash-screen',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,   // 由代码手动调用 SplashScreen.hide() 控制隐藏时机
      fadeOutDuration: 300,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
