package expo.modules.deradocumentscanner

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

/**
 * Camera document scanner (ML Kit, delivered by Google Play services): edge detection, cropping, clean-up and
 * multi-page capture, returned as one PDF. Needs Play services; the scanner module downloads once on first use.
 */
internal object DocScanner {
  private val options by lazy {
    GmsDocumentScannerOptions.Builder()
      .setGalleryImportAllowed(true)
      .setPageLimit(50)
      .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
      .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
      .build()
  }

  fun start(activity: Activity, requestCode: Int, onError: (Exception) -> Unit) {
    GmsDocumentScanning.getClient(options)
      .getStartScanIntent(activity)
      .addOnSuccessListener { sender: IntentSender ->
        try {
          activity.startIntentSenderForResult(sender, requestCode, null, 0, 0, 0)
        } catch (e: Exception) {
          onError(e)
        }
      }
      .addOnFailureListener { e -> onError(e) }
  }

  /** The scanned PDF's URI and page count, or null if the user cancelled. */
  fun result(data: Intent?): Pair<String, Int>? {
    val pdf = GmsDocumentScanningResult.fromActivityResultIntent(data)?.getPdf() ?: return null
    return pdf.getUri().toString() to pdf.getPageCount()
  }
}
