package expo.modules.deradocumentscanner

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File

/**
 * Page images for Dera's built-in PDF reader. One document is open at a time; PdfRenderer allows only one
 * open page and isn't thread-safe, so everything goes through a mutex. Pages are rendered on demand at the
 * requested width and cached as JPEGs for the open document only.
 */
internal class PdfPages(private val context: Context) {
  private val lock = Mutex()
  private var openUri: String? = null
  private var descriptor: ParcelFileDescriptor? = null
  private var renderer: PdfRenderer? = null
  private val dir: File by lazy { File(context.cacheDir, "dera-pages").apply { mkdirs() } }

  /** Opens the PDF and returns the page count and every page's size (points), for layout before rendering. */
  suspend fun open(uri: String): Map<String, Any?> =
    lock.withLock {
      val r = ensureOpen(uri)
      val sizes = (0 until r.pageCount).map { i ->
        val page = r.openPage(i)
        try {
          listOf(page.width.toDouble(), page.height.toDouble())
        } finally {
          page.close()
        }
      }
      mapOf("pageCount" to r.pageCount, "sizes" to sizes)
    }

  suspend fun render(uri: String, index: Int, width: Int): String? =
    lock.withLock {
      val r = ensureOpen(uri)
      if (index < 0 || index >= r.pageCount) return@withLock null
      val out = File(dir, "p$index-w$width.jpg")
      if (out.exists()) return@withLock Uri.fromFile(out).toString()
      val page = r.openPage(index)
      val bitmap = try {
        val height = (width.toFloat() * page.height / page.width).toInt().coerceIn(1, width * 4)
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also {
          it.eraseColor(Color.WHITE)
          page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        }
      } finally {
        page.close()
      }
      try {
        out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
      } finally {
        bitmap.recycle()
      }
      Uri.fromFile(out).toString()
    }

  suspend fun close() = lock.withLock { closeLocked() }

  private fun ensureOpen(uri: String): PdfRenderer {
    if (uri == openUri) renderer?.let { return it }
    closeLocked()
    dir.listFiles()?.forEach { it.delete() } // Page images belong to the previously open document.
    val parsed = Uri.parse(uri)
    val pfd = if (parsed.scheme == ContentResolver.SCHEME_FILE) {
      ParcelFileDescriptor.open(File(parsed.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
    } else {
      context.contentResolver.openFileDescriptor(parsed, "r") ?: throw IllegalStateException("Can't open the document")
    }
    val r = try {
      PdfRenderer(pfd)
    } catch (e: Throwable) {
      pfd.close()
      throw e
    }
    descriptor = pfd
    renderer = r
    openUri = uri
    return r
  }

  private fun closeLocked() {
    try {
      renderer?.close()
    } catch (_: Exception) {
    }
    try {
      descriptor?.close()
    } catch (_: Exception) {
    }
    renderer = null
    descriptor = null
    openUri = null
  }
}
