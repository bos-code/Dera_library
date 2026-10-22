package expo.modules.deradocumentscanner

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore

/**
 * Tells JS when shared storage changes (downloads finishing, attachments saved, files moved by other apps),
 * so the library can rescan by itself while Dera is open. Bursts of changes are debounced into one signal.
 */
internal class StorageWatcher(private val context: Context, private val onChange: () -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private val notify = Runnable { onChange() }
  private var registered = false

  private val observer = object : ContentObserver(handler) {
    override fun onChange(selfChange: Boolean, uri: Uri?) {
      handler.removeCallbacks(notify)
      handler.postDelayed(notify, DEBOUNCE_MS)
    }
  }

  fun start() {
    if (registered) return
    try {
      context.contentResolver.registerContentObserver(MediaStore.Files.getContentUri("external"), true, observer)
      registered = true
    } catch (_: Exception) {
      // Without storage access there's nothing to watch; manual rescans still work.
    }
  }

  fun stop() {
    handler.removeCallbacks(notify)
    if (!registered) return
    context.contentResolver.unregisterContentObserver(observer)
    registered = false
  }

  private companion object {
    const val DEBOUNCE_MS = 4_000L
  }
}
