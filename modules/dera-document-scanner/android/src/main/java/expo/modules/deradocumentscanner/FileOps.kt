package expo.modules.deradocumentscanner

import android.content.Context
import android.media.MediaScannerConnection
import android.os.Environment
import org.json.JSONObject
import java.io.File

/**
 * Real file operations for "Manage files", on shared storage (needs All files access, or legacy storage on
 * Android 10 and below). Built to never lose data:
 * - deleting moves the file to a hidden per-volume trash (restorable; emptied after 30 days)
 * - moves across volumes copy, verify the size, then remove the original
 * - name clashes fail unless the caller asks to keep both or replace (the replaced file goes to trash)
 * - only paths inside shared storage are touched, never Android/data or Android/obb
 */
internal class FileOps(
  private val context: Context?,
  /** Fixed roots (path to label) instead of the device's volumes; used by tests. */
  private val fixedRoots: List<Pair<String, String>>? = null,
) {

  data class Result(val status: String, val path: String? = null, val message: String? = null) {
    fun toMap(): Map<String, Any?> = mapOf("status" to status, "path" to path, "message" to message)
  }

  // region Locations

  fun roots(): List<Map<String, Any?>> {
    fixedRoots?.let { roots -> return roots.map { (path, label) -> mapOf("path" to File(path).canonicalPath, "label" to label) } }
    val context = context ?: return emptyList()
    @Suppress("DEPRECATION")
    val primary = Environment.getExternalStorageDirectory().canonicalFile
    val out = linkedMapOf<String, String>(primary.path to "Internal storage")
    context.getExternalFilesDirs(null).filterNotNull().forEach { dir ->
      val idx = dir.path.indexOf("/Android/data/")
      if (idx > 0) {
        val root = File(dir.path.substring(0, idx)).canonicalFile
        if (root.path != primary.path && root.canRead()) out[root.path] = "SD card"
      }
    }
    return out.map { (path, label) -> mapOf("path" to path, "label" to label) }
  }

  private fun rootOf(file: File): File? = roots().map { File(it["path"] as String) }.firstOrNull { file.path == it.path || file.path.startsWith(it.path + "/") }

  /** Inside shared storage and not in app-private or trash areas. */
  private fun allowed(file: File, allowTrash: Boolean = false): Boolean {
    val f = file.canonicalFile
    val root = rootOf(f) ?: return false
    val rel = f.path.removePrefix(root.path).trimStart('/')
    if (rel.startsWith("Android/data") || rel.startsWith("Android/obb")) return false
    if (!allowTrash && (rel == TRASH_DIR || rel.startsWith("$TRASH_DIR/"))) return false
    return true
  }

  fun listDirectories(path: String): List<Map<String, Any?>> {
    val dir = File(path)
    if (!allowed(dir)) return emptyList()
    return (dir.listFiles() ?: emptyArray())
      .filter { it.isDirectory && !it.name.startsWith(".") && allowed(it) }
      .sortedBy { it.name.lowercase() }
      .map { mapOf("name" to it.name, "path" to it.path) }
  }

  /** Library metadata for a file after an operation (folder is relative to its storage root, like the scan). */
  fun describe(path: String): Map<String, Any?>? {
    val file = File(path)
    if (!file.isFile) return null
    val root = rootOf(file.canonicalFile)
    val ext = file.name.substringAfterLast('.', "").lowercase()
    return mapOf(
      "uri" to android.net.Uri.fromFile(file).toString(),
      "path" to file.path,
      "name" to file.name,
      "extension" to ext,
      "size" to file.length().toDouble(),
      "modifiedAt" to file.lastModified().toDouble(),
      "folder" to (file.parentFile?.canonicalPath?.removePrefix(root?.path ?: "")?.trim('/') ?: "")
    )
  }

  // endregion

  // region Operations

  fun rename(path: String, newName: String, conflict: String): Result {
    val src = File(path)
    val clean = newName.trim()
    if (clean.isEmpty() || clean.contains('/') || clean.startsWith(".")) return Result("invalid", message = "That name can't be used")
    if (!src.exists()) return Result("missing")
    if (!allowed(src)) return Result("forbidden")
    if (clean == src.name) return Result("ok", src.path)
    val dst = resolve(File(src.parentFile, clean), conflict) ?: return Result("exists", File(src.parentFile, clean).path)
    if (!src.renameTo(dst)) return Result("error", message = "Android refused to rename the file")
    rescan(src, dst)
    return Result("ok", dst.path)
  }

  fun move(path: String, destDir: String, conflict: String): Result {
    val src = File(path)
    val dir = File(destDir)
    if (!src.exists()) return Result("missing")
    if (!allowed(src) || !allowed(dir) || !dir.isDirectory) return Result("forbidden")
    if (src.parentFile?.canonicalPath == dir.canonicalPath) return Result("ok", src.path)
    val dst = resolve(File(dir, src.name), conflict) ?: return Result("exists", File(dir, src.name).path)
    if (!moveFile(src, dst)) return Result("error", message = "The file couldn't be moved")
    rescan(src, dst)
    return Result("ok", dst.path)
  }

  fun createFolder(parent: String, name: String): Result {
    val clean = name.trim()
    if (clean.isEmpty() || clean.contains('/') || clean.startsWith(".")) return Result("invalid", message = "That name can't be used")
    val dir = File(parent, clean)
    if (!allowed(File(parent))) return Result("forbidden")
    if (dir.exists()) return Result("exists", dir.path)
    return if (dir.mkdirs()) Result("ok", dir.path) else Result("error", message = "The folder couldn't be created")
  }

  /** Moves the file into the hidden trash on its own volume, with a note of where it came from. */
  fun trash(path: String): Result {
    val src = File(path)
    if (!src.exists()) return Result("missing")
    if (!allowed(src)) return Result("forbidden")
    val root = rootOf(src.canonicalFile) ?: return Result("forbidden")
    val trashDir = File(root, TRASH_DIR).apply { mkdirs() }
    File(trashDir, ".nomedia").takeIf { !it.exists() }?.createNewFile()
    val now = System.currentTimeMillis()
    val dst = File(trashDir, "${now}__${src.name}")
    if (!moveFile(src, dst)) return Result("error", message = "The file couldn't be moved to trash")
    File(trashDir, dst.name + META_SUFFIX).writeText(
      JSONObject().put("originalPath", src.path).put("trashedAt", now).toString()
    )
    rescan(src, null)
    return Result("ok", dst.path)
  }

  fun listTrash(): List<Map<String, Any?>> =
    roots().flatMap { root ->
      val dir = File(root["path"] as String, TRASH_DIR)
      (dir.listFiles() ?: emptyArray())
        .filter { it.isFile && !it.name.endsWith(META_SUFFIX) && it.name != ".nomedia" }
        .map { file ->
          val meta = readMeta(file)
          mapOf(
            "path" to file.path,
            "name" to file.name.substringAfter("__"),
            "originalPath" to meta?.optString("originalPath"),
            "trashedAt" to (meta?.optLong("trashedAt") ?: file.lastModified()).toDouble(),
            "size" to file.length().toDouble()
          )
        }
    }.sortedByDescending { it["trashedAt"] as Double }

  fun restore(trashPath: String, conflict: String): Result {
    val src = File(trashPath)
    if (!src.exists() || !allowed(src, allowTrash = true)) return Result("missing")
    val original = readMeta(src)?.optString("originalPath")?.takeIf { it.isNotEmpty() }?.let { File(it) }
      ?: return Result("error", message = "The original location is unknown")
    original.parentFile?.mkdirs()
    val dst = resolve(original, conflict) ?: return Result("exists", original.path)
    if (!moveFile(src, dst)) return Result("error", message = "The file couldn't be restored")
    File(src.path + META_SUFFIX).delete()
    rescan(null, dst)
    return Result("ok", dst.path)
  }

  fun deletePermanently(trashPath: String): Result {
    val file = File(trashPath)
    val root = rootOf(file.canonicalFile) ?: return Result("forbidden")
    // Only files already in the trash can be deleted for good.
    if (file.parentFile?.canonicalPath != File(root, TRASH_DIR).canonicalPath) return Result("forbidden")
    File(file.path + META_SUFFIX).delete()
    return if (!file.exists() || file.delete()) Result("ok") else Result("error")
  }

  /** Permanently removes trash older than [olderThanMs]. Returns how many files were removed. */
  fun emptyTrash(olderThanMs: Long): Int {
    val cutoff = System.currentTimeMillis() - olderThanMs
    var removed = 0
    for (item in listTrash()) {
      if ((item["trashedAt"] as Double) <= cutoff && deletePermanently(item["path"] as String).status == "ok") removed++
    }
    return removed
  }

  // endregion

  // region Helpers

  /** Applies the conflict policy; null when the target exists and the policy is "fail". */
  private fun resolve(target: File, conflict: String): File? {
    if (!target.exists()) return target
    return when (conflict) {
      "rename" -> {
        val base = target.nameWithoutExtension
        val ext = target.extension.let { if (it.isEmpty()) "" else ".$it" }
        (2..999).asSequence().map { File(target.parentFile, "$base ($it)$ext") }.firstOrNull { !it.exists() }
      }
      // The replaced file goes to trash rather than disappearing.
      "replace" -> if (trash(target.path).status == "ok") target else null
      else -> null
    }
  }

  private fun moveFile(src: File, dst: File): Boolean {
    if (src.renameTo(dst)) return true
    // Different volume: copy, verify, then remove the original.
    return try {
      src.inputStream().use { input -> dst.outputStream().use { output -> input.copyTo(output) } }
      if (dst.length() != src.length()) {
        dst.delete()
        false
      } else {
        dst.setLastModified(src.lastModified())
        src.delete() || run {
          dst.delete()
          false
        }
      }
    } catch (_: Exception) {
      dst.delete()
      false
    }
  }

  private fun readMeta(file: File): JSONObject? =
    try {
      JSONObject(File(file.path + META_SUFFIX).readText())
    } catch (_: Exception) {
      null
    }

  /** Keeps MediaStore (and so other apps) in sync with the change. */
  private fun rescan(old: File?, new: File?) {
    val paths = listOfNotNull(old?.path, new?.path).toTypedArray()
    if (paths.isNotEmpty() && context != null) MediaScannerConnection.scanFile(context, paths, null, null)
  }

  // endregion

  companion object {
    const val TRASH_DIR = ".DeraTrash"
    private const val META_SUFFIX = ".dera.json"
  }
}
