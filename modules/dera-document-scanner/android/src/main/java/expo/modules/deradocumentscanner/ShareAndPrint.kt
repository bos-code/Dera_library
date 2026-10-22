package expo.modules.deradocumentscanner

import android.app.Activity
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/** Sharing documents out, receiving documents shared in, and printing PDFs. */
internal class ShareAndPrint(private val context: Context) {

  // region Share out

  fun share(activity: Activity?, uris: List<String>, mimeTypes: List<String>): String {
    if (uris.isEmpty()) return "empty"
    val shareable = ArrayList(uris.map { toShareable(it) })
    val mime = mimeTypes.distinct().singleOrNull() ?: "*/*"
    val intent = if (shareable.size == 1) {
      Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, shareable[0])
    } else {
      Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, shareable)
    }.apply {
      type = mime
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(intent, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    if (activity != null) activity.startActivity(chooser) else context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return "ok"
  }

  private fun toShareable(uri: String): Uri {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != ContentResolver.SCHEME_FILE) return parsed
    return FileProvider.getUriForFile(context, "${context.packageName}.dera.fileprovider", File(parsed.path!!))
  }

  // endregion

  // region Share in

  /** Documents another app shared to Dera (from the launching intent); each intent is consumed once. */
  fun takeSharedUris(activity: Activity?): List<String> {
    val intent = activity?.intent ?: return emptyList()
    val uris = when (intent.action) {
      Intent.ACTION_SEND -> listOfNotNull(streamExtra(intent))
      Intent.ACTION_SEND_MULTIPLE -> streamListExtra(intent)
      else -> emptyList()
    }
    if (uris.isNotEmpty()) {
      // Mark consumed so a configuration change or app restore doesn't import it twice.
      intent.action = Intent.ACTION_MAIN
      intent.removeExtra(Intent.EXTRA_STREAM)
    }
    return uris.map { it.toString() }
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM))
      ?: emptyList()

  /**
   * Shared URIs are only readable for a moment, so the document is saved to "Documents/Dera Library" on the
   * phone (a real file, visible to other apps) and the library points at that copy.
   */
  fun saveShared(uri: String): Map<String, Any?>? {
    val source = Uri.parse(uri)
    val name = displayName(source) ?: "Shared document"
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveViaMediaStore(source, name) else saveToFile(source, name)
    } catch (_: Exception) {
      null
    }
  }

  private fun saveViaMediaStore(source: Uri, name: String): Map<String, Any?>? {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOCUMENTS}/$FOLDER")
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val target = resolver.insert(collection, values) ?: return null
    try {
      resolver.openInputStream(source)?.use { input -> resolver.openOutputStream(target)?.use { input.copyTo(it) } } ?: throw IllegalStateException()
      resolver.update(target, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    } catch (e: Exception) {
      resolver.delete(target, null, null)
      throw e
    }
    @Suppress("DEPRECATION")
    val projection = arrayOf(MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.DATA)
    resolver.query(target, projection, null, null, null)?.use { c ->
      if (!c.moveToFirst()) return null
      val finalName = c.getString(0) ?: name
      return item(target.toString(), c.getString(3), finalName, c.getLong(1), c.getLong(2) * 1000)
    }
    return null
  }

  private fun saveToFile(source: Uri, name: String): Map<String, Any?>? {
    @Suppress("DEPRECATION")
    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), FOLDER).apply { mkdirs() }
    var target = File(dir, name)
    var n = 2
    while (target.exists()) target = File(dir, "${name.substringBeforeLast('.')} (${n++})${name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }}")
    context.contentResolver.openInputStream(source)?.use { input -> FileOutputStream(target).use { input.copyTo(it) } } ?: return null
    return item(Uri.fromFile(target).toString(), target.path, target.name, target.length(), target.lastModified())
  }

  private fun item(uri: String, path: String?, name: String, size: Long, modified: Long): Map<String, Any?> {
    val ext = name.substringAfterLast('.', "").lowercase()
    return mapOf(
      "uri" to uri,
      "path" to path,
      "name" to name,
      "extension" to ext,
      "mimeType" to (android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"),
      "size" to size.toDouble(),
      "modifiedAt" to modified.toDouble(),
      "folder" to "${Environment.DIRECTORY_DOCUMENTS}/$FOLDER"
    )
  }

  private fun displayName(uri: Uri): String? =
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
      }
    } catch (_: Exception) {
      null
    } ?: uri.lastPathSegment?.substringAfterLast('/')

  // endregion

  // region Print

  /** Hands a PDF to Android's print system (printers, "Save as PDF"). Other formats print from their own apps. */
  fun printPdf(activity: Activity?, uri: String, jobName: String): String {
    if (activity == null) return "unavailable"
    val manager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return "unavailable"
    manager.print(jobName, PdfAdapter(uri, jobName), PrintAttributes.Builder().build())
    return "ok"
  }

  private inner class PdfAdapter(private val uri: String, private val name: String) : PrintDocumentAdapter() {
    override fun onLayout(
      oldAttributes: PrintAttributes?,
      newAttributes: PrintAttributes,
      cancellationSignal: CancellationSignal?,
      callback: LayoutResultCallback,
      extras: Bundle?
    ) {
      if (cancellationSignal?.isCanceled == true) return callback.onLayoutCancelled()
      callback.onLayoutFinished(PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true)
    }

    override fun onWrite(
      pages: Array<out PageRange>,
      destination: ParcelFileDescriptor,
      cancellationSignal: CancellationSignal?,
      callback: WriteResultCallback
    ) {
      try {
        val parsed = Uri.parse(uri)
        val input = if (parsed.scheme == ContentResolver.SCHEME_FILE) FileInputStream(File(parsed.path!!)) else context.contentResolver.openInputStream(parsed)
        input?.use { inp -> FileOutputStream(destination.fileDescriptor).use { inp.copyTo(it) } } ?: return callback.onWriteFailed("Can't read the document")
        callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
      } catch (e: Exception) {
        callback.onWriteFailed(e.message)
      }
    }
  }

  // endregion

  private companion object {
    const val FOLDER = "Dera Library"
  }
}
