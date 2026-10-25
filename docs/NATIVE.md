# Android and iOS apps (Capacitor)

The PWA is already structured for native shells:
- `apps/web/capacitor.config.ts` (appId `app.darsi.teachers`, `webDir: dist`)
- `@capacitor/core`, `@capacitor/filesystem`, `@capacitor/share` installed
- all device access goes through `apps/web/src/platform/` (`isNative()` switches implementations)
- the service worker is disabled inside native shells (the app bundle is already local)

## Android
Requirements: Android Studio, JDK 17+, Android SDK.
```bash
npm install -w @darsi/web @capacitor/android@8.5.3
npm run build
npm run cap:android        # cap add android → cap sync → opens Android Studio
```
Then run on a device or build an AAB for Google Play (Build → Generate Signed Bundle).

## iOS
Requirements: a Mac with Xcode, CocoaPods or Swift Package Manager.
```bash
npm install -w @darsi/web @capacitor/ios@8.5.3
npm run build
npm run cap:ios            # cap add ios → cap sync → opens Xcode
```

## After any web change
```bash
npm run cap:sync
```

## Native checklist
- App icons/splash: generate from `packages/design-system/assets/app-icons/app-icon-512.png` with `@capacitor/assets`.
- File downloads (kits) already use Filesystem + Share on native.
- Add `@capacitor/local-notifications` for the weekly reminder; ask permission only after the first lesson.
- Keep `android.allowMixedContent: false`; serve content over HTTPS.
- Commit the generated `android/` and `ios/` folders once created.
