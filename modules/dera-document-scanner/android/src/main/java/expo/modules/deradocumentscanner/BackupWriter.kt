package expo.modules.deradocumentscanner

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract

/**
 * Writes automatic backups into a folder the user granted through the system picker, keeping only the
 * newest [keep] files with the backup prefix so the folder doesn't fill up.
 */
internal class BackupWriter(private val context: Context) {

  fun write(treeUri: String, fileName: String, text: String, keep: Int): String {
    val tree = Uri.parse(treeUri)
    val resolver = context.contentResolver
    if (resolver.persistedUriPermissions.none { it.uri == tree && it.isWritePermission }) return "revoked"
    return try {
      val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
      val target = DocumentsContract.createDocument(resolver, parent, "application/json", fileName) ?: return "error"
      resolver.openOutputStream(target, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) } ?: return "error"
      prune(tree, keep)
      "ok"
    } catch (_: SecurityException) {
      "revoked"
    } catch (_: Exception) {
      "error"
    }
  }

  private fun prune(tree: Uri, keep: Int) {
    val resolver = context.contentResolver
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    val backups = mutableListOf<Pair<String, Long>>()
    resolver.query(
      children,
      arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_LAST_MODIFIED),
      null,
      null,
      null
    )?.use { c ->
      while (c.moveToNext()) {
        val name = c.getString(1) ?: continue
        if (name.startsWith(PREFIX) && name.endsWith(".json")) backups.add(c.getString(0) to (if (c.isNull(2)) 0L else c.getLong(2)))
      }
    }
    backups.sortedByDescending { it.second }.drop(keep).forEach { (id, _) ->
      try {
        DocumentsContract.deleteDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, id))
      } catch (_: Exception) {
        // Leave it; the next backup tries again.
      }
    }
  }

  companion object {
    const val PREFIX = "dera-library-"
  }
}
