package expo.modules.deradocumentscanner

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.URLDecoder
import java.util.zip.ZipInputStream

/**
 * Renders and caches document covers:
 * - PDF: first page via the platform PdfRenderer
 * - EPUB: the cover image declared in the package (OPF) file
 * - DOCX/XLSX/PPTX: docProps/thumbnail.* when the authoring app saved one
 * - ODT/ODS/ODP: Thumbnails/thumbnail.png (LibreOffice always writes it)
 *
 * Results are JPEGs in the app cache, keyed by the caller (document id + size + mtime), so a changed file
 * gets a fresh cover. Android may clear the cache at any time; covers are simply re-rendered.
 */
internal class ThumbnailCache(private val context: Context) {
  private val dir: File by lazy { File(context.cacheDir, "dera-covers").apply { mkdirs() } }

  fun get(uri: String, extension: String, key: String, width: Int): String? {
    val safeKey = key.replace(Regex("[^A-Za-z0-9_.-]"), "_")
    val out = File(dir, "$safeKey-$width.jpg")
    if (out.exists()) return Uri.fromFile(out).toString()
    val none = File(dir, "$safeKey.none")
    if (none.exists()) return null

    val bitmap = try {
      when (extension) {
        "pdf" -> renderPdf(uri, width)
        "epub" -> epubCover(uri, width)
        "docx", "xlsx", "pptx" -> zipImage(uri, OFFICE_THUMBNAILS, width)
        "odt", "ods", "odp" -> zipImage(uri, ODF_THUMBNAILS, width)
        else -> null
      }
    } catch (_: SecurityException) {
      // Access problem, not a property of the file: don't remember it as coverless.
      return null
    } catch (_: Throwable) {
      // Encrypted, corrupt or unusual files simply have no cover. OutOfMemoryError included.
      null
    }

    if (bitmap == null) {
      runCatching { none.createNewFile() }
      return null
    }
    return try {
      out.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 82, it) }
      Uri.fromFile(out).toString()
    } finally {
      bitmap.recycle()
    }
  }

  fun clear(): Boolean {
    dir.listFiles()?.forEach { it.delete() }
    return true
  }

  // region Sources

  private fun renderPdf(uri: String, width: Int): Bitmap? {
    val pfd = openDescriptor(uri) ?: return null
    val renderer = try {
      PdfRenderer(pfd)
    } catch (e: Throwable) {
      pfd.close()
      throw e
    }
    try {
      if (renderer.pageCount == 0) return null
      val page = renderer.openPage(0)
      try {
        if (page.width <= 0 || page.height <= 0) return null
        val height = (width.toFloat() * page.height / page.width).toInt().coerceIn(1, width * 2)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        // Pages are transparent by default; documents expect paper.
        bitmap.eraseColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        return bitmap
      } finally {
        page.close()
      }
    } finally {
      renderer.close()
    }
  }

  private fun epubCover(uri: String, width: Int): Bitmap? {
    // Pass 1: the container points at the OPF, which names the cover image.
    val meta = readZipEntries(uri, MAX_META_BYTES) { it == "META-INF/container.xml" || it.endsWith(".opf", ignoreCase = true) }
    val container = meta["META-INF/container.xml"]?.toString(Charsets.UTF_8)
    val opfPath = container?.let { Regex("full-path\\s*=\\s*[\"']([^\"']+)[\"']").find(it)?.groupValues?.get(1) }
      ?: meta.keys.firstOrNull { it.endsWith(".opf", ignoreCase = true) }
      ?: return null
    val opf = meta[opfPath]?.toString(Charsets.UTF_8) ?: return null
    val href = findCoverHref(opf) ?: return null
    val coverPath = resolvePath(opfPath, href)
    // Pass 2: fetch just the image.
    val bytes = readZipEntries(uri, MAX_IMAGE_BYTES) { it == coverPath }[coverPath] ?: return null
    return decodeScaled(bytes, width)
  }

  private fun zipImage(uri: String, candidates: List<String>, width: Int): Bitmap? {
    val found = readZipEntries(uri, MAX_IMAGE_BYTES) { it in candidates }
    val bytes = candidates.firstNotNullOfOrNull { found[it] } ?: return null
    return decodeScaled(bytes, width)
  }

  // endregion

  // region EPUB package parsing

  private fun findCoverHref(opf: String): String? {
    val items = Regex("<(?:\\w+:)?item\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(opf).map { attributes(it.value) }.toList()
    // EPUB 3: <item properties="cover-image" .../>
    items.firstOrNull { it["properties"]?.split(' ')?.contains("cover-image") == true }?.get("href")?.let { return it }
    // EPUB 2: <meta name="cover" content="item-id"/>
    val coverId = Regex("<(?:\\w+:)?meta\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(opf)
      .map { attributes(it.value) }
      .firstOrNull { it["name"].equals("cover", ignoreCase = true) }
      ?.get("content")
    if (coverId != null) items.firstOrNull { it["id"] == coverId }?.get("href")?.let { return it }
    // Fallback: an image whose id or href mentions "cover".
    return items.firstOrNull {
      it["media-type"]?.startsWith("image/") == true &&
        ((it["id"] ?: "").contains("cover", true) || (it["href"] ?: "").contains("cover", true))
    }?.get("href")
  }

  private fun attributes(tag: String): Map<String, String> =
    Regex("([\\w:-]+)\\s*=\\s*(\"([^\"]*)\"|'([^']*)')").findAll(tag).associate { m ->
      m.groupValues[1].substringAfter(':').lowercase() to m.groupValues[3].ifEmpty { m.groupValues[4] }
    }

  private fun resolvePath(opfPath: String, href: String): String {
    val decoded = try {
      URLDecoder.decode(href.substringBefore('#').replace("+", "%2B"), "UTF-8")
    } catch (_: Exception) {
      href
    }
    val base = opfPath.substringBeforeLast('/', "")
    val parts = ArrayDeque<String>()
    (if (base.isEmpty()) decoded else "$base/$decoded").split('/').forEach { part ->
      when (part) {
        "", "." -> Unit
        ".." -> if (parts.isNotEmpty()) parts.removeLast()
        else -> parts.addLast(part)
      }
    }
    return parts.joinToString("/")
  }

  // endregion

  // region IO helpers

  private fun openDescriptor(uri: String): ParcelFileDescriptor? {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == ContentResolver.SCHEME_FILE) {
      ParcelFileDescriptor.open(File(parsed.path ?: return null), ParcelFileDescriptor.MODE_READ_ONLY)
    } else {
      context.contentResolver.openFileDescriptor(parsed, "r")
    }
  }

  private fun openStream(uri: String): InputStream? {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == ContentResolver.SCHEME_FILE) {
      FileInputStream(File(parsed.path ?: return null))
    } else {
      context.contentResolver.openInputStream(parsed)
    }
  }

  /** Streams the archive once and keeps the entries [wanted] selects, skipping any larger than [maxBytes]. */
  private fun readZipEntries(uri: String, maxBytes: Int, wanted: (String) -> Boolean): Map<String, ByteArray> {
    val out = mutableMapOf<String, ByteArray>()
    openStream(uri)?.use { raw ->
      ZipInputStream(BufferedInputStream(raw)).use { zip ->
        var entry = zip.nextEntry
        while (entry != null) {
          val name = entry.name
          if (!entry.isDirectory && wanted(name)) readCapped(zip, maxBytes)?.let { out[name] = it }
          entry = zip.nextEntry
        }
      }
    }
    return out
  }

  private fun readCapped(input: InputStream, maxBytes: Int): ByteArray? {
    val buffer = ByteArrayOutputStream()
    val chunk = ByteArray(16 * 1024)
    var total = 0
    while (true) {
      val n = input.read(chunk)
      if (n < 0) break
      total += n
      if (total > maxBytes) return null
      buffer.write(chunk, 0, n)
    }
    return buffer.toByteArray()
  }

  private fun decodeScaled(bytes: ByteArray, width: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width) sample *= 2
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: return null
    if (decoded.width <= width) return decoded
    val height = (width.toFloat() * decoded.height / decoded.width).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(decoded, width, height, true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
  }

  // endregion

  private companion object {
    const val MAX_META_BYTES = 1024 * 1024
    const val MAX_IMAGE_BYTES = 12 * 1024 * 1024
    val OFFICE_THUMBNAILS = listOf("docProps/thumbnail.jpeg", "docProps/thumbnail.jpg", "docProps/thumbnail.png")
    val ODF_THUMBNAILS = listOf("Thumbnails/thumbnail.png")
  }
}
