package expo.modules.deradocumentscanner

import android.graphics.Bitmap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * On-device text recognition (ML Kit, bundled Latin model): scanned pages become searchable without
 * any network access. Must be called off the main thread; it blocks until the page is read.
 */
internal object OcrEngine {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  fun recognize(bitmap: Bitmap): String = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text
}
