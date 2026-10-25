import type { CapacitorConfig } from "@capacitor/cli";

// Native shells (Android/iOS) wrap the same web build in dist/. See docs/NATIVE.md.
const config: CapacitorConfig = {
  appId: "app.darsi.teachers",
  appName: "Darsi",
  webDir: "dist",
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
  plugins: {
    SplashScreen: { backgroundColor: "#f2f2f2", launchShowDuration: 600 },
  },
};
export default config;
