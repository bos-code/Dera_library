# Dera Library

Android-first offline document library.

## Current implementation — Stage 6
- Expo Router + TypeScript
- SQLite document index and reconciliation
- Android MediaStore native scanner
- Search, type filters and sorting
- Virtual collections stored separately from physical files
- A document can belong to multiple collections without duplication
- Nested collection schema is supported through `parent_id`

## Development
```bash
npm install
npx expo prebuild --platform android
npm run android
npm run typecheck
```

## Native validation
The scanner is an Android Expo module and must be validated in a development build on actual Android hardware. MediaStore visibility varies by Android version and storage source; Storage Access Framework support for user-selected extra folders remains a follow-up hardening item.
