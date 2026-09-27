package expo.modules.deradocumentscanner

import android.content.ContentUris
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeraDocumentScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeraDocumentScanner")
    AsyncFunction("scanDocuments") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val resolver = context.contentResolver
      val collection = MediaStore.Files.getContentUri("external")
      val projection = arrayOf(MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.DISPLAY_NAME, MediaStore.Files.FileColumns.MIME_TYPE, MediaStore.Files.FileColumns.SIZE, MediaStore.Files.FileColumns.DATE_MODIFIED, MediaStore.Files.FileColumns.RELATIVE_PATH)
      val allowed = setOf("pdf","doc","docx","odt","xls","xlsx","ods","csv","ppt","pptx","odp","txt","md","rtf","epub")
      val out = mutableListOf<Map<String, Any?>>()
      resolver.query(collection, projection, null, null, MediaStore.Files.FileColumns.DATE_MODIFIED + " DESC")?.use { c ->
        val id = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID); val name = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME); val mime = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE); val size = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE); val modified = c.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED); val path = c.getColumnIndex(MediaStore.Files.FileColumns.RELATIVE_PATH)
        while (c.moveToNext()) { val n = c.getString(name) ?: continue; val ext = n.substringAfterLast(".", "").lowercase(); if (ext !in allowed) continue; out.add(mapOf("uri" to ContentUris.withAppendedId(collection,c.getLong(id)).toString(),"name" to n,"extension" to ext,"mimeType" to (c.getString(mime) ?: "application/octet-stream"),"size" to c.getLong(size),"modifiedAt" to c.getLong(modified)*1000,"folder" to if(path>=0)c.getString(path) else null)) }
      }
      out
    }
  }
}
