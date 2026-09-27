package expo.modules.deradocumentscanner

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException

private const val REQUEST_PICK_FOLDER = 48101
private const val REQUEST_PICK_FILES = 48102
private const val REQUEST_CREATE_FILE = 48103
private const val REQUEST_OPEN_FILE = 48104

private val SUPPORTED_EXTENSIONS = setOf(
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub", "csv",
  "odt", "ods", "odp", "rtf", "md", "markdown"
)

private val MIME_FALLBACKS = mapOf(
  "pdf" to "application/pdf",
  "doc" to "application/msword",
  "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "xls" to "application/vnd.ms-excel",
  "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "ppt" to "application/vnd.ms-powerpoint",
  "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "txt" to "text/plain",
  "epub" to "application/epub+zip",
  "csv" to "text/csv",
  "odt" to "application/vnd.oasis.opendocument.text",
  "ods" to "application/vnd.oasis.opendocument.spreadsheet",
  "odp" to "application/vnd.oasis.opendocument.presentation",
  "rtf" to "application/rtf",
  "md" to "text/markdown",
  "markdown" to "text/markdown"
)

/** Folders under a storage root that are never worth walking (inaccessible or app-private). */
private val SKIPPED_RELATIVE_DIRS = setOf("Android/data", "Android/obb")

class DeraDocumentScannerModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingRequest = 0

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)

  override fun definition() = ModuleDefinition {
    Name("DeraDocumentScanner")

    Events("onScanProgress")

    Function("getStorageAccess") {
      val sdk = Build.VERSION.SDK_INT
      val readGranted = sdk <= Build.VERSION_CODES.S_V2 &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
      val allFiles = if (sdk >= Build.VERSION_CODES.R) Environment.isExternalStorageManager() else readGranted
      mapOf(
        "sdk" to sdk,
        "allFilesAccess" to allFiles,
        "canRequestAllFilesAccess" to (sdk >= Build.VERSION_CODES.R),
        "needsReadPermission" to (sdk <= Build.VERSION_CODES.S_V2),
        "readPermissionGranted" to readGranted
      )
    }

    Function("openAllFilesAccessSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
      val ctx = context
      val specific = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${ctx.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        ctx.startActivity(specific)
      } catch (_: ActivityNotFoundException) {
        ctx.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    }

    /**
     * Scans shared storage. With "All files access" (or legacy read access on Android 10 and below) the whole
     * storage tree is walked, so documents MediaStore does not index are found too. Without it, only what
     * MediaStore exposes to this app is returned.
     */
    AsyncFunction("scanDevice") {
      val sdk = Build.VERSION.SDK_INT
      val fullAccess = if (sdk >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
      }
      val items = if (fullAccess) walkStorage() else queryMediaStore()
      mapOf("mode" to if (fullAccess) "all-files" else "mediastore", "items" to items)
    }

    AsyncFunction("scanTree") { treeUri: String ->
      val uri = Uri.parse(treeUri)
      if (!hasPersistedPermission(uri)) {
        return@AsyncFunction mapOf("status" to "revoked", "items" to emptyList<Map<String, Any?>>())
      }
      try {
        mapOf("status" to "ok", "items" to walkTree(uri))
      } catch (_: SecurityException) {
        mapOf("status" to "revoked", "items" to emptyList<Map<String, Any?>>())
      } catch (_: FileNotFoundException) {
        mapOf("status" to "missing", "items" to emptyList<Map<String, Any?>>())
      }
    }

    AsyncFunction("describeUris") { uris: List<String> ->
      uris.mapNotNull { describeSingleDocument(Uri.parse(it)) }
    }

    AsyncFunction("pickFolder") { promise: Promise ->
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
      )
      launchForResult(intent, REQUEST_PICK_FOLDER, promise)
    }

    AsyncFunction("pickFiles") { promise: Promise ->
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, MIME_FALLBACKS.values.distinct().toTypedArray() + "application/octet-stream")
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      launchForResult(intent, REQUEST_PICK_FILES, promise)
    }

    AsyncFunction("releaseUri") { uri: String ->
      try {
        context.contentResolver.releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION)
      } catch (_: SecurityException) {
        // Already released.
      }
      true
    }

    AsyncFunction("checkDocument") { uri: String -> checkAccess(uri) }

    AsyncFunction("openDocument") { uri: String, mimeType: String ->
      val access = checkAccess(uri)
      if (access != "ok") return@AsyncFunction access
      val ctx = context
      val target = try {
        viewableUri(ctx, uri)
      } catch (_: IllegalArgumentException) {
        return@AsyncFunction "unsupported"
      }
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(target, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        ctx.startActivity(intent)
        "opened"
      } catch (_: ActivityNotFoundException) {
        "no_viewer"
      } catch (_: SecurityException) {
        "revoked"
      }
    }

    AsyncFunction("createExportFile") { fileName: String, promise: Promise ->
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "application/json"
        putExtra(Intent.EXTRA_TITLE, fileName)
      }
      launchForResult(intent, REQUEST_CREATE_FILE, promise)
    }

    AsyncFunction("pickImportFile") { promise: Promise ->
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
      }
      launchForResult(intent, REQUEST_OPEN_FILE, promise)
    }

    AsyncFunction("writeText") { uri: String, text: String ->
      context.contentResolver.openOutputStream(Uri.parse(uri), "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        ?: throw CodedException("ERR_WRITE", "Could not open the file for writing", null)
      true
    }

    AsyncFunction("readText") { uri: String ->
      context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes().toString(Charsets.UTF_8) }
        ?: throw CodedException("ERR_READ", "Could not open the file for reading", null)
    }

    OnActivityResult { _, payload ->
      val promise = pendingPromise ?: return@OnActivityResult
      if (payload.requestCode != pendingRequest) return@OnActivityResult
      pendingPromise = null
      pendingRequest = 0
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        when (payload.requestCode) {
          REQUEST_PICK_FOLDER -> {
            val tree = data.data ?: return@OnActivityResult promise.resolve(null)
            context.contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            promise.resolve(mapOf("uri" to tree.toString(), "label" to treeLabel(tree)))
          }
          REQUEST_PICK_FILES -> {
            val uris = mutableListOf<Uri>()
            data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
            if (uris.isEmpty()) data.data?.let { uris.add(it) }
            uris.forEach { uri ->
              try {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
              } catch (_: SecurityException) {
                // Provider does not offer persistable grants; the file will be marked revoked later.
              }
            }
            promise.resolve(uris.map { it.toString() })
          }
          else -> promise.resolve(data.data?.toString())
        }
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_PICK", e.message ?: "Could not use the selected item", e))
      }
    }
  }

  private fun launchForResult(intent: Intent, requestCode: Int, promise: Promise) {
    val activity = appContext.currentActivity
    if (activity == null) {
      promise.reject(CodedException("ERR_NO_ACTIVITY", "No foreground activity", null))
      return
    }
    pendingPromise?.resolve(null)
    pendingPromise = promise
    pendingRequest = requestCode
    activity.runOnUiThread {
      try {
        activity.startActivityForResult(intent, requestCode)
      } catch (_: ActivityNotFoundException) {
        pendingPromise = null
        pendingRequest = 0
        promise.reject(CodedException("ERR_NO_PICKER", "No system file picker is available", null))
      }
    }
  }

  // region Device scan

  private fun storageRoots(): List<File> {
    val roots = linkedSetOf<File>()
    @Suppress("DEPRECATION")
    roots.add(Environment.getExternalStorageDirectory())
    context.getExternalFilesDirs(null).filterNotNull().forEach { dir ->
      val path = dir.absolutePath
      val idx = path.indexOf("/Android/data/")
      if (idx > 0) roots.add(File(path.substring(0, idx)))
    }
    return roots.filter { it.exists() && it.canRead() }
  }

  private fun walkStorage(): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    var visitedDirs = 0
    for (root in storageRoots()) {
      val rootPath = root.absolutePath
      val stack = ArrayDeque<Pair<File, Int>>()
      stack.addLast(root to 0)
      while (stack.isNotEmpty()) {
        val (dir, depth) = stack.removeLast()
        val children = dir.listFiles() ?: continue
        visitedDirs++
        if (visitedDirs % 250 == 0) {
          sendEvent("onScanProgress", mapOf("found" to out.size, "folder" to dir.absolutePath.removePrefix(rootPath)))
        }
        for (child in children) {
          val name = child.name
          if (name.startsWith(".")) continue
          if (child.isDirectory) {
            val relative = child.absolutePath.removePrefix("$rootPath/")
            if (depth < 24 && relative !in SKIPPED_RELATIVE_DIRS) stack.addLast(child to depth + 1)
            continue
          }
          val ext = extensionOf(name)
          if (ext !in SUPPORTED_EXTENSIONS) continue
          val relativeFolder = dir.absolutePath.removePrefix(rootPath).trim('/')
          out.add(
            mapOf(
              "uri" to Uri.fromFile(child).toString(),
              "path" to child.absolutePath,
              "name" to name,
              "extension" to ext,
              "mimeType" to mimeFor(ext, null),
              "size" to child.length().toDouble(),
              "modifiedAt" to child.lastModified().toDouble(),
              "folder" to relativeFolder
            )
          )
        }
      }
    }
    sendEvent("onScanProgress", mapOf("found" to out.size, "folder" to null))
    return out
  }

  private fun queryMediaStore(): List<Map<String, Any?>> {
    val resolver = context.contentResolver
    val collection = MediaStore.Files.getContentUri("external")
    val projection = mutableListOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.MIME_TYPE,
      MediaStore.Files.FileColumns.SIZE,
      MediaStore.Files.FileColumns.DATE_MODIFIED,
      @Suppress("DEPRECATION") MediaStore.Files.FileColumns.DATA
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) projection.add(MediaStore.Files.FileColumns.RELATIVE_PATH)
    // Filter by extension in SQL so large media libraries are not streamed across.
    val likes = SUPPORTED_EXTENSIONS.map { "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ?" }
    val selection = likes.joinToString(" OR ")
    val args = SUPPORTED_EXTENSIONS.map { "%.$it" }.toTypedArray()
    val out = mutableListOf<Map<String, Any?>>()
    try {
      resolver.query(collection, projection.toTypedArray(), selection, args, null)?.use { c ->
        val idCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
        val nameCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        val mimeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
        val sizeCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
        val modCol = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
        @Suppress("DEPRECATION")
        val dataCol = c.getColumnIndex(MediaStore.Files.FileColumns.DATA)
        val relCol = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) c.getColumnIndex(MediaStore.Files.FileColumns.RELATIVE_PATH) else -1
        while (c.moveToNext()) {
          val name = c.getString(nameCol) ?: continue
          val ext = extensionOf(name)
          if (ext !in SUPPORTED_EXTENSIONS) continue
          val path = if (dataCol >= 0) c.getString(dataCol) else null
          val folder = when {
            relCol >= 0 -> c.getString(relCol)?.trim('/')
            path != null -> File(path).parent?.substringAfter("/storage/emulated/0")?.trim('/')
            else -> null
          }
          out.add(
            mapOf(
              "uri" to ContentUris.withAppendedId(collection, c.getLong(idCol)).toString(),
              "path" to path,
              "name" to name,
              "extension" to ext,
              "mimeType" to mimeFor(ext, c.getString(mimeCol)),
              "size" to c.getLong(sizeCol).toDouble(),
              "modifiedAt" to (c.getLong(modCol) * 1000).toDouble(),
              "folder" to folder
            )
          )
        }
      }
    } catch (_: SecurityException) {
      // No read access: nothing visible.
    }
    return out
  }

  // endregion

  // region Storage Access Framework

  private fun hasPersistedPermission(uri: Uri): Boolean =
    context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }

  private fun walkTree(treeUri: Uri): List<Map<String, Any?>> {
    val resolver = context.contentResolver
    val out = mutableListOf<Map<String, Any?>>()
    val rootId = DocumentsContract.getTreeDocumentId(treeUri)
    val rootLabel = treeLabel(treeUri)
    val stack = ArrayDeque<Pair<String, String>>()
    stack.addLast(rootId to rootLabel)
    val projection = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED
    )
    var visited = 0
    while (stack.isNotEmpty()) {
      val (docId, folder) = stack.removeLast()
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
      resolver.query(childrenUri, projection, null, null, null)?.use { c ->
        while (c.moveToNext()) {
          val childId = c.getString(0) ?: continue
          val name = c.getString(1) ?: continue
          val mime = c.getString(2)
          if (name.startsWith(".")) continue
          if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
            stack.addLast(childId to "$folder/$name")
            continue
          }
          val ext = extensionOf(name)
          if (ext !in SUPPORTED_EXTENSIONS) continue
          out.add(
            mapOf(
              "uri" to DocumentsContract.buildDocumentUriUsingTree(treeUri, childId).toString(),
              "path" to externalStoragePath(treeUri.authority, childId),
              "name" to name,
              "extension" to ext,
              "mimeType" to mimeFor(ext, mime),
              "size" to (if (c.isNull(3)) 0L else c.getLong(3)).toDouble(),
              "modifiedAt" to (if (c.isNull(4)) 0L else c.getLong(4)).toDouble(),
              "folder" to folder
            )
          )
        }
      }
      visited++
      if (visited % 50 == 0) sendEvent("onScanProgress", mapOf("found" to out.size, "folder" to folder))
    }
    return out
  }

  private fun describeSingleDocument(uri: Uri): Map<String, Any?>? {
    return try {
      val projection = arrayOf(
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED
      )
      context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
        if (!c.moveToFirst()) return null
        val name = c.getString(0) ?: return null
        val ext = extensionOf(name)
        val docId = if (DocumentsContract.isDocumentUri(context, uri)) DocumentsContract.getDocumentId(uri) else null
        mapOf(
          "uri" to uri.toString(),
          "path" to docId?.let { externalStoragePath(uri.authority, it) },
          "name" to name,
          "extension" to ext,
          "mimeType" to mimeFor(ext, c.getString(1)),
          "size" to (if (c.isNull(2)) 0L else c.getLong(2)).toDouble(),
          "modifiedAt" to (if (c.isNull(3)) 0L else c.getLong(3)).toDouble(),
          "folder" to "Picked files"
        )
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun treeLabel(treeUri: Uri): String {
    val id = try {
      DocumentsContract.getTreeDocumentId(treeUri)
    } catch (_: IllegalArgumentException) {
      return treeUri.lastPathSegment ?: "Folder"
    }
    val rel = id.substringAfter(':', "")
    return rel.ifEmpty { id.substringBefore(':').let { if (it == "primary") "Internal storage" else it } }
  }

  /** Maps an ExternalStorageProvider document id ("primary:Documents/a.pdf") to a filesystem path, so SAF and device scans dedupe. */
  private fun externalStoragePath(authority: String?, docId: String): String? {
    if (authority != "com.android.externalstorage.documents") return null
    val volume = docId.substringBefore(':', "")
    val rel = docId.substringAfter(':', "")
    if (volume.isEmpty()) return null
    val base = if (volume == "primary") "/storage/emulated/0" else "/storage/$volume"
    return if (rel.isEmpty()) base else "$base/$rel"
  }

  // endregion

  // region Access checks and opening

  private fun checkAccess(uriString: String): String {
    val uri = Uri.parse(uriString)
    if (uri.scheme == ContentResolver.SCHEME_FILE) {
      val file = File(uri.path ?: return "missing")
      if (!file.exists()) {
        // Without storage access, File.exists() is false for files that are still there.
        return if (hasFullStorageAccess()) "missing" else "revoked"
      }
      return if (file.canRead()) "ok" else "revoked"
    }
    return try {
      context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { } ?: return "missing"
      "ok"
    } catch (_: FileNotFoundException) {
      "missing"
    } catch (_: SecurityException) {
      "revoked"
    } catch (_: IllegalArgumentException) {
      "missing"
    } catch (_: Exception) {
      "missing"
    }
  }

  private fun hasFullStorageAccess(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

  private fun viewableUri(ctx: Context, uriString: String): Uri {
    val uri = Uri.parse(uriString)
    if (uri.scheme != ContentResolver.SCHEME_FILE) return uri
    return FileProvider.getUriForFile(ctx, "${ctx.packageName}.dera.fileprovider", File(uri.path!!))
  }

  // endregion

  private fun extensionOf(name: String): String = name.substringAfterLast('.', "").lowercase()

  private fun mimeFor(ext: String, reported: String?): String {
    if (!reported.isNullOrBlank() && reported != "application/octet-stream") return reported
    return MIME_FALLBACKS[ext]
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
      ?: "application/octet-stream"
  }
}
