# Dera Library

Android-first, offline document library built with Expo/React Native and a small Kotlin Expo module.

## Implemented through Stage 5
- Expo Router + TypeScript foundation
- SQLite document index
- Android MediaStore scanner module
- Library list + rescan
- Filename search, type filters and sorting

## Development
```bash
npm install
npx expo prebuild --platform android
npm run android
npm run typecheck
```

The MediaStore scanner is native Android code, so scanning must be validated in a development build on Android.
