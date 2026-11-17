import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.durvesh.financeiq",
  appName: "FinanceIQ",
  webDir: "out",
  server: {
    androidScheme: "https",
    cleartext: false,
    errorPath: "unsupported-webview.html",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    minWebViewVersion: 111,
  },
};

export default config;
