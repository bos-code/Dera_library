package expo.modules.deradocumentscanner

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Dera on the home screen: app-icon shortcuts (long-press the icon) and a small widget with today's reading
 * and recent documents. JS pushes the data; everything opens Dera through its deralibrary:// links.
 */
internal object HomeScreen {
  private const val PREFS = "dera_home_screen"
  private const val KEY_WIDGET = "widget"
  private val DOC_VIEWS = intArrayOf(R.id.dera_widget_doc1, R.id.dera_widget_doc2, R.id.dera_widget_doc3)

  /** Replaces the dynamic shortcuts. Each item: id, label, url, icon ("search" | "book" | "inbox" | "doc"). */
  fun setShortcuts(context: Context, items: List<Map<String, Any?>>): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return false
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return false
    val shortcuts = items.take(manager.maxShortcutCountPerActivity.coerceAtMost(4)).mapNotNull { item ->
      val id = item["id"] as? String ?: return@mapNotNull null
      val label = (item["label"] as? String)?.take(25) ?: return@mapNotNull null
      val url = item["url"] as? String ?: return@mapNotNull null
      ShortcutInfo.Builder(context, id)
        .setShortLabel(label)
        .setLongLabel((item["longLabel"] as? String ?: label).take(40))
        .setIcon(Icon.createWithResource(context, iconFor(item["icon"] as? String)))
        .setIntent(viewIntent(context, url))
        .build()
    }
    return try {
      manager.dynamicShortcuts = shortcuts
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun iconFor(name: String?) =
    when (name) {
      "search" -> R.drawable.dera_ic_search
      "inbox" -> R.drawable.dera_ic_inbox
      "doc" -> R.drawable.dera_ic_doc
      else -> R.drawable.dera_ic_book
    }

  /** Stores the widget data (JSON from JS) and redraws every placed widget. */
  fun updateWidget(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_WIDGET, json).apply()
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, DeraWidgetProvider::class.java))
    if (ids.isNotEmpty()) render(context, manager, ids)
  }

  fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = try {
      JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_WIDGET, null) ?: "{}")
    } catch (_: Exception) {
      JSONObject()
    }
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.dera_widget)
      views.setTextViewText(R.id.dera_widget_today, data.optString("headline", "Dera Library"))
      views.setOnClickPendingIntent(R.id.dera_widget_today, pending(context, "deralibrary:///reading", 0))
      val docs = data.optJSONArray("docs")
      val count = docs?.length() ?: 0
      DOC_VIEWS.forEachIndexed { i, viewId ->
        val doc = if (i < count) docs!!.optJSONObject(i) else null
        if (doc == null) {
          views.setViewVisibility(viewId, View.GONE)
        } else {
          views.setViewVisibility(viewId, View.VISIBLE)
          views.setTextViewText(viewId, "•  " + doc.optString("title"))
          views.setOnClickPendingIntent(viewId, pending(context, "deralibrary:///document/${doc.optLong("id")}", i + 1))
        }
      }
      views.setViewVisibility(R.id.dera_widget_empty, if (count == 0) View.VISIBLE else View.GONE)
      views.setOnClickPendingIntent(R.id.dera_widget_root, pending(context, "deralibrary:///", 9))
      manager.updateAppWidget(id, views)
    }
  }

  private fun viewIntent(context: Context, url: String) =
    Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  private fun pending(context: Context, url: String, request: Int): PendingIntent =
    PendingIntent.getActivity(context, 4900 + request, viewIntent(context, url), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

/** Home-screen widget; content is pushed by the app via [HomeScreen.updateWidget]. */
class DeraWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    HomeScreen.render(context, appWidgetManager, appWidgetIds)
  }
}
