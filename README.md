# Dera Library

An offline-first personal document library for Android. It finds the documents already on your phone and shows them as one
searchable, organized library. Files are never copied, moved, uploaded or changed.

```
Phone storage → Discovery → Local index (SQLite) → Library → Collections + Tags + Favorites + History
```

## How documents are found

| Route | What it sees | How the user grants it |
| --- | --- | --- |
| **All files access** (Android 11+) | Everything in shared storage and SD cards: Downloads, Documents, WhatsApp/Telegram folders, etc. | One toggle in system settings (`MANAGE_EXTERNAL_STORAGE`) |
| **Storage permission** (Android 10 and below) | All of shared storage | Runtime `READ_EXTERNAL_STORAGE` dialog |
| **Folders** (Storage Access Framework) | Any folder the user picks, including SD cards and document providers | System folder picker; access persists |
| **Files** (SAF) | Individual files, e.g. in the Download root, which Android won't share as a folder | System file picker |
| MediaStore fallback | Whatever Android exposes without the above | Nothing |

With all-files access the native module walks the storage tree directly (skipping hidden folders, `Android/data` and
`Android/obb`), so it also finds documents MediaStore never indexed. Files found this way are opened through a
`FileProvider` URI.

> **Google Play note:** Play only allows `MANAGE_EXTERNAL_STORAGE` for certain app categories and requires a declaration
> form. If Play rejects it, remove the permission from `modules/dera-document-scanner/android/src/main/AndroidManifest.xml`;
> the app then falls back to folders and files picked through SAF, with no other code changes. Sideloaded and F-Droid
> builds can keep it.

Supported formats: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, EPUB, CSV, ODT/ODS/ODP, RTF, Markdown.

## Data integrity

- Every document has a stable integer id. Collections, tags, favorites and history reference the id, not the URI.
- A rescan **never deletes** a document row. Documents that vanish are marked `missing`, or `revoked` when access was lost.
  They are hidden from the library but keep their organization, and they are listed under Settings → Missing documents.
- Moved or renamed files are **relinked** to their existing row: by path, then name + size (moved), then
  size + modified time + extension (renamed, only when the match is unique).
- The same file seen through two routes (e.g. the device scan and a picked folder) is deduplicated by filesystem path.
- If a scan suddenly can't see more than half of a scope's documents, or finds nothing, the missing-marking is held back
  (for example, SD card unmounted). "Full rescan" overrides this.
- Missing entries with no collections, tags or favorite are purged after 30 days.
- Schema changes go through versioned migrations (`PRAGMA user_version`). v0.1 data is carried forward.

The reconcile planner (`src/db/reconcile.ts`) is a pure function covered by `npm test`.

## Search

SQLite FTS5 with the trigram tokenizer over name and folder, so substrings like `phys` match
`Documents/School/Physics notes.pdf`. Terms shorter than three characters fall back to `LIKE`. Search combines with
type filters, favorites, recents, tags and collections, and results sort by modified date, name or size.
`documents_fts.body` and the `document_content` table are reserved for future full-text extraction from PDF, DOCX and EPUB.

## Organization

- **Collections** nest to any depth (School → Physics → Mechanics). A document can be in many collections. Deleting a
  collection removes only the collection and its sub-collections, never documents or files.
- **Tags**, **favorites** and **recent history** (last 1000 opens).
- Long-press any document to multi-select, then favorite, add to collections or tag.
- **Backup**: Settings → Export/Import writes the organization to a JSON file you choose. On import, entries reattach by
  URI, path or name + size; unmatched ones reconnect when a later scan finds them.

## Opening documents

Documents open in an installed app via `ACTION_VIEW` with a read grant. Before opening, the file is checked. Missing
files, revoked permissions, no compatible viewer and unsupported URIs each show a specific message and update the
document's status. None of them crash the app.

## Project layout

```
app/                      Expo Router screens: tabs (Library, Collections, Tags, Settings), document, collection, tag, onboarding
modules/dera-document-scanner/  Native Kotlin Expo module: scanning, SAF, access checks, opening, file I/O
src/db/                   SQLite: migrations, reconcile planner, repositories, backup
src/services/             Scan orchestration, access requests, opening
src/components/           Library UI (FlashList rows, sheets, pickers)
src/theme/                Light/dark palette and type scale
```

## Develop

Requires an Expo **development build**; Expo Go can't load the native module.

```bash
npm install
npm run typecheck
npm test
npx expo prebuild --platform android --clean
npm run android            # build, install and start with the dev client
```

EAS: `eas build --profile development --platform android` (dev client) or `--profile preview` (installable APK).

## Acceptance checklist

1. Fresh install → onboarding → "Allow access" → toggle All files access → back → Continue. The library fills from
   Downloads, Documents, WhatsApp Documents, etc.
2. Search `phys`, then filter PDF, then sort by size. Results update instantly.
3. Create School → Physics → Mechanics and put one document in two collections. Delete School: the documents are still in
   the library.
4. Tag, favorite and open documents. Restart the app: everything persists, and Recent is ordered.
5. Rename and move a file with a file manager, then pull to refresh: it keeps its collections and tags ("1 moved").
6. Delete a file: it moves to Missing documents with its organization intact.
7. Revoke All files access: documents show as unavailable, not deleted. Re-grant: they come back.
8. Open a type with no installed viewer: a clear message, no crash.
9. Export a backup, clear app data, import it, and scan: the organization is restored.
