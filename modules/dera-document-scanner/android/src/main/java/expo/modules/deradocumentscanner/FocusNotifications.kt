package expo.modules.deradocumentscanner

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * The focus timer's presence outside the app: an ongoing notification with a live chronometer (counting
 * down to the planned end, or up for open-ended sessions), and a "time's up" alert when the session ends.
 * Dera itself is in the background while the user reads in another app, so this is what keeps the timer
 * visible. Tapping either notification brings Dera back to stop and save the session.
 */
internal object FocusNotifications {
  private const val CHANNEL_TIMER = "dera_focus_timer"
  private const val CHANNEL_ALERT = "dera_focus_alert"
  private const val ID_TIMER = 48110
  private const val ID_DONE = 48111
  private const val REQUEST_ALARM = 48112
  private const val REQUEST_OPEN = 48113
  const val EXTRA_TITLE = "title"

  fun start(context: Context, title: String, startedAt: Long, endsAt: Long?) {
    ensureChannels(context)
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.cancel(ID_DONE)
    val builder = builder(context, CHANNEL_TIMER)
      .setSmallIcon(R.drawable.dera_ic_focus)
      .setContentTitle(if (endsAt != null) "Focus session" else "Focus session · no time limit")
      .setContentText(title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setWhen(endsAt ?: startedAt)
      .setContentIntent(openAppIntent(context))
      .setCategory(Notification.CATEGORY_PROGRESS)
    if (endsAt != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(true)
    manager.notify(ID_TIMER, builder.build())

    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = alarmIntent(context, title)
    alarms.cancel(pending)
    // Inexact-but-allowed-while-idle: needs no exact-alarm permission and fires within moments while the
    // phone is in use (which it is: the user is reading).
    if (endsAt != null) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pending)
  }

  fun stop(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.apply {
      cancel(ID_TIMER)
      cancel(ID_DONE)
    }
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context, ""))
  }

  fun timeUp(context: Context, title: String) {
    ensureChannels(context)
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.cancel(ID_TIMER)
    val notification = builder(context, CHANNEL_ALERT)
      .setSmallIcon(R.drawable.dera_ic_focus)
      .setContentTitle("Time's up")
      .setContentText(if (title.isBlank()) "Your focus session is complete." else "$title: session complete. Tap to save it.")
      .setAutoCancel(true)
      .setContentIntent(openAppIntent(context))
      .setCategory(Notification.CATEGORY_REMINDER)
      .build()
    manager.notify(ID_DONE, notification)
  }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_TIMER, "Focus timer", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows the running focus session"
        setShowBadge(false)
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ALERT, "Focus session finished", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Alerts you when a focus session reaches its planned length"
      }
    )
  }

  @Suppress("DEPRECATION")
  private fun builder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel) else Notification.Builder(context)

  private fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return null
    return PendingIntent.getActivity(context, REQUEST_OPEN, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun alarmIntent(context: Context, title: String): PendingIntent {
    val intent = Intent(context, FocusAlarmReceiver::class.java).putExtra(EXTRA_TITLE, title)
    return PendingIntent.getBroadcast(context, REQUEST_ALARM, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}

/** Fires at the planned end of a focus session. */
class FocusAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    FocusNotifications.timeUp(context, intent.getStringExtra(FocusNotifications.EXTRA_TITLE) ?: "")
  }
}
