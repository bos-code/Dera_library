# Dera Library
Android-first offline document library.

## v1 implementation
- Device document discovery through Android MediaStore
- SQLite indexing/reconciliation
- Search, file-type filters and sorting
- Virtual and nested collection data model
- Tags, favorites and recent-open history
- External Android document opening with read URI permission
- CI typecheck workflow
- EAS development APK, preview APK and production AAB profiles

## Build
```bash
npm install
npm run typecheck
npx expo prebuild --platform android
npm run android
```
For EAS: `eas build --profile preview --platform android`.

## Acceptance checklist
1. Install development/preview APK on Android.
2. Rescan and compare discovered files with known documents in Downloads/Documents.
3. Search/filter/sort a large library.
4. Create collections and put one document in multiple collections.
5. Add/remove tags and favorites; restart and confirm persistence.
6. Open PDF/DOCX/XLSX/PPTX/EPUB with installed viewers and confirm Recent ordering.
7. Add/delete/rename files outside Dera Library, rescan, and verify reconciliation.
8. Revoke/change storage access and verify graceful errors.

## Known platform boundary
MediaStore visibility differs across Android versions and storage providers. SAF folder grants are the next compatibility extension for documents MediaStore does not expose. A real-device run is required before calling the release hardware-validated.
