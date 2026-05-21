import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kryno.app',
  appName: 'KRYNO',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
