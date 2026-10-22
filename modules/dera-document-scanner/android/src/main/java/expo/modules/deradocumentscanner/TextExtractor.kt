package expo.modules.deradocumentscanner

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * Pulls plain text out of documents for search-inside-documents. Everything runs on the device.
 *
 * - TXT/MD/CSV: read directly; RTF: control words stripped
 * - DOCX/PPTX/XLSX and ODT/ODS/ODP: text from their XML parts
 * - EPUB: text from the XHTML chapters
 * - PDF: the text layer via PdfRenderer (Android 15 SDK extension 13+); scanned pages without a text layer
 *   fall back to on-device text recognition (ML Kit) for the first [ocrPages] pages
 */
internal class TextExtractor(private val context: Context) {

  data class Result(val status: String, val text: String, val pages: Int?, val ocr: Boolean = false)

  fun extract(uri: String, extension: String, maxChars: Int, ocrPages: Int): Result {
    return try {
      when (extension) {
        "txt", "md", "markdown", "csv" -> ok(readCapped(uri, maxChars)?.let { decode(it) } ?: "", null)
        "rtf" -> ok(TextParsing.stripRtf(decode(readCapped(uri, maxChars * 4) ?: ByteArray(0))).take(maxChars), null)
        "docx" -> zipText(uri, maxChars, { it == "word/document.xml" || it.matches(Regex("word/(header|footer|footnotes)\\d*\\.xml")) })
        "pptx" -> zipText(uri, maxChars, { it.matches(Regex("ppt/slides/slide\\d+\\.xml")) }, countPages = { it.matches(Regex("ppt/slides/slide\\d+\\.xml")) })
        "xlsx" -> zipText(uri, maxChars, { it == "xl/sharedStrings.xml" || it.matches(Regex("xl/worksheets/sheet\\d+\\.xml")) })
        "odt", "ods", "odp" -> zipText(uri, maxChars, { it == "content.xml" })
        "epub" -> zipText(uri, maxChars, { it.endsWith(".xhtml", true) || it.endsWith(".html", true) || it.endsWith(".htm", true) })
        "pdf" -> pdf(uri, maxChars, ocrPages)
        else -> Result("unsupported", "", null)
      }
    } catch (e: SecurityException) {
      Result("error", "", null)
    } catch (e: Throwable) {
      // Corrupt, encrypted or exotic files: no text, but never a crash.
      Result("error", "", null)
    }
  }

  private fun ok(text: String, pages: Int?, ocr: Boolean = false): Result {
    val clean = text.replace(Regex("[ \\t\\x0B\\f\\r]+"), " ").replace(Regex("\\n\\s*\\n+"), "\n").trim()
    return Result(if (clean.isEmpty()) "empty" else "ok", clean, pages, ocr && clean.isNotEmpty())
  }

  // region Archives (Office Open XML, OpenDocument, EPUB)

  private fun zipText(uri: String, maxChars: Int, wanted: (String) -> Boolean, countPages: ((String) -> Boolean)? = null): Result {
    val out = StringBuilder()
    var pages = 0
    openStream(uri)?.use { raw ->
      ZipInputStream(BufferedInputStream(raw)).use { zip ->
        var entry = zip.nextEntry
        while (entry != null && out.length < maxChars) {
          val name = entry.name
          if (!entry.isDirectory && countPages?.invoke(name) == true) pages++
          if (!entry.isDirectory && wanted(name)) {
            readCapped(zip, MAX_PART_BYTES)?.let { bytes ->
              out.append(TextParsing.xmlToText(decode(bytes))).append('\n')
            }
          }
          entry = zip.nextEntry
        }
      }
    }
    return ok(out.take(maxChars).toString(), if (countPages != null) pages else null)
  }

  // endregion

  // region PDF

  private fun pdf(uri: String, maxChars: Int, ocrPages: Int): Result {
    val pfd = openDescriptor(uri) ?: return Result("error", "", null)
    val renderer = try {
      PdfRenderer(pfd)
    } catch (e: Throwable) {
      pfd.close()
      throw e
    }
    try {
      val pages = renderer.pageCount
      val out = StringBuilder()
      if (pdfTextSupported()) {
        for (i in 0 until pages) {
          if (out.length >= maxChars) break
          val page = renderer.openPage(i)
          try {
            out.append(pageText(page)).append('\n')
          } finally {
            page.close()
          }
        }
      }
      // A PDF made of scans has (almost) no text layer: read the first pages with text recognition instead.
      var usedOcr = false
      if (out.trim().length < 20 * minOf(pages, 3) && ocrPages > 0) {
        out.setLength(0)
        usedOcr = true
        for (i in 0 until minOf(pages, ocrPages)) {
          if (out.length >= maxChars) break
          val page = renderer.openPage(i)
          val bitmap = try {
            render(page, OCR_WIDTH)
          } finally {
            page.close()
          }
          try {
            out.append(OcrEngine.recognize(bitmap)).append('\n')
          } catch (_: Throwable) {
            break // Recognizer unavailable on this device; keep what we have.
          } finally {
            bitmap.recycle()
          }
        }
      }
      return ok(out.take(maxChars).toString(), pages, usedOcr)
    } finally {
      renderer.close()
    }
  }

  /** PdfRenderer text extraction ships in Android 15's SDK extension 13; older phones skip straight to OCR. */
  private fun pdfTextSupported(): Boolean =
    Build.VERSION.SDK_INT >= 35 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
      SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) >= 13

  /** Called reflectively so the module compiles and lints cleanly regardless of the SDK it targets. */
  private fun pageText(page: PdfRenderer.Page): String {
    val contents = page.javaClass.getMethod("getTextContents").invoke(page) as? List<*> ?: return ""
    return contents.joinToString("\n") { item -> item?.javaClass?.getMethod("getText")?.invoke(item) as? String ?: "" }
  }

  private fun render(page: PdfRenderer.Page, width: Int): Bitmap {
    val height = (width.toFloat() * page.height / page.width).toInt().coerceIn(1, width * 3)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    bitmap.eraseColor(Color.WHITE)
    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
    return bitmap
  }

  // endregion

  // region IO

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

  private fun readCapped(uri: String, maxBytes: Int): ByteArray? = openStream(uri)?.use { readCapped(it, maxBytes, truncate = true) }

  /** Reads up to [maxBytes]; returns null if larger, unless [truncate] (then the first maxBytes). */
  private fun readCapped(input: InputStream, maxBytes: Int, truncate: Boolean = false): ByteArray? {
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(16 * 1024)
    while (true) {
      val n = input.read(chunk)
      if (n < 0) break
      val room = maxBytes - buffer.size()
      if (n > room) {
        if (!truncate) return null
        buffer.write(chunk, 0, room)
        break
      }
      buffer.write(chunk, 0, n)
    }
    return buffer.toByteArray()
  }

  private fun decode(bytes: ByteArray): String {
    // UTF-8 with BOM handling; Latin-1 fallback for legacy text files that aren't valid UTF-8.
    val start = if (bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte()) 3 else 0
    val utf8 = String(bytes, start, bytes.size - start, Charsets.UTF_8)
    return if (utf8.count { it == '�' } > bytes.size / 50) String(bytes, Charsets.ISO_8859_1) else utf8
  }

  // endregion

  private companion object {
    const val MAX_PART_BYTES = 24 * 1024 * 1024
    const val OCR_WIDTH = 1600
  }
}

/** Pure text clean-up used by [TextExtractor]; kept separate so it can be unit-tested on the JVM. */
internal object TextParsing {
  fun xmlToText(xml: String): String =
    decodeEntities(
      xml
        .replace(Regex("(?is)<head\\b.*?</head>"), " ")
        .replace(Regex("(?is)<(script|style)\\b.*?</\\1>"), " ")
        // Block ends become line breaks, tabs become spaces, so words don't run together.
        .replace(Regex("(?i)</(w:p|a:p|text:p|text:h|p|div|h[1-6]|li|tr|si|row)>|<br\\s*/?>"), "\n")
        .replace(Regex("(?i)<(w:tab|text:tab|text:s)\\b[^>]*/?>|</(w:t|t|c|td|a:t)>"), " ")
        .replace(Regex("<[^>]+>"), "")
    )

  fun decodeEntities(s: String): String =
    s.replace(Regex("&#(x?)([0-9a-fA-F]+);")) { m ->
      val code = if (m.groupValues[1].isNotEmpty()) m.groupValues[2].toIntOrNull(16) else m.groupValues[2].toIntOrNull()
      code?.let { String(Character.toChars(it)) } ?: ""
    }
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .replace("&quot;", "\"")
      .replace("&apos;", "'")
      .replace("&nbsp;", " ")
      .replace("&amp;", "&")

  fun stripRtf(rtf: String): String =
    removeGroups(rtf)
      // Escaped literals first, so they survive the brace and control-word removal below.
      .replace("\\\\", "\u0003")
      .replace("\\{", "\u0001")
      .replace("\\}", "\u0002")
      .replace(Regex("\\\\'([0-9a-fA-F]{2})")) { m -> m.groupValues[1].toInt(16).toChar().toString() }
      .replace(Regex("\\\\(par|line)\\b ?"), "\n")
      .replace(Regex("\\\\tab\\b ?"), " ")
      .replace(Regex("\\\\[a-zA-Z]+-?\\d* ?"), "")
      .replace(Regex("[{}]"), "")
      .replace('\u0001', '{')
      .replace('\u0002', '}')
      .replace('\u0003', '\\')

  /** Header groups (fonts, colours, styles, metadata, {\\* ...} destinations) hold no body text; braces nest. */
  private fun removeGroups(rtf: String): String {
    val skip = Regex("^\\{\\\\(\\*|fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|rsidtbl|generator)")
    val out = StringBuilder(rtf.length)
    var i = 0
    while (i < rtf.length) {
      if (rtf[i] == '{' && skip.containsMatchIn(rtf.substring(i, minOf(rtf.length, i + 24)))) {
        var depth = 0
        while (i < rtf.length) {
          when (rtf[i]) {
            '\\' -> i++ // escaped char, e.g. \{
            '{' -> depth++
            '}' -> if (--depth == 0) break
          }
          i++
        }
        i++
        out.append(' ') // A group delimits control words: "\\par{...}Next" must not become "\\parNext".
        continue
      }
      out.append(rtf[i])
      i++
    }
    return out.toString()
  }
}
