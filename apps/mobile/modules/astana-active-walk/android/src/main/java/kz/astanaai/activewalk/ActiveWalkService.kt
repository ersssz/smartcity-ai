package kz.astanaai.activewalk

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class ActiveWalkService : Service() {
  internal var isForeground = false
    private set
  internal var isSubscribed = false
    private set
  private var generation: Long? = null
  private var listener: LocationListener? = null
  private val handler = Handler(Looper.getMainLooper())
  private val manager: LocationManager by lazy { getSystemService(LocationManager::class.java) }
  private val healthCheck = object : Runnable {
    override fun run() {
      val current = generation ?: return
      if (!ActiveWalkController.isCurrent(this@ActiveWalkService, current)) return
      val code = prerequisiteFailure()
      if (code != null) ActiveWalkController.fail(this@ActiveWalkService, code)
      else handler.postDelayed(this, 5_000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val accepted = ActiveWalkController.consumePermit(intent?.getStringExtra(ActiveWalkController.PERMIT_EXTRA))
    if (accepted == null) {
      // A duplicate/unknown intent cannot re-register or revive anything.
      if (generation == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    if (!ActiveWalkController.attachService(this, accepted)) {
      if (generation == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    generation = accepted
    try {
      prerequisiteFailure()?.let {
        ActiveWalkController.fail(this, it)
        return START_NOT_STICKY
      }
      ActiveWalkController.ensureChannel(this)
      val notification = notification()
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(ActiveWalkController.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(ActiveWalkController.NOTIFICATION_ID, notification)
      }
      isForeground = true
      val callback = object : LocationListener {
        override fun onLocationChanged(location: Location) {
          prerequisiteFailure()?.let {
            ActiveWalkController.fail(this@ActiveWalkService, it)
            return
          }
          ActiveWalkController.fix(this@ActiveWalkService, accepted, location)
        }
        override fun onProviderDisabled(provider: String) {
          if (ActiveWalkController.isCurrent(this@ActiveWalkService, accepted)) {
            prerequisiteFailure()?.let { ActiveWalkController.fail(this@ActiveWalkService, it) }
          }
        }
        override fun onProviderEnabled(provider: String) = Unit
        @Deprecated("Required for Android 7 compatibility")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
      }
      listener = callback
      for (provider in ActiveWalkController.compatibleProviders(this)) {
        manager.requestLocationUpdates(provider, 1_000L, 0f, callback, Looper.getMainLooper())
        isSubscribed = true
      }
      if (!ActiveWalkController.running(this, accepted)) {
        ActiveWalkController.fail(this, "SUBSCRIPTION_REJECTED")
      } else {
        handler.postDelayed(healthCheck, 5_000)
      }
    } catch (_: SecurityException) {
      ActiveWalkController.fail(this, "LOCATION_PERMISSION_REJECTED")
    } catch (_: RuntimeException) {
      ActiveWalkController.fail(this, "LOCATION_START_FAILED")
    }
    return START_NOT_STICKY
  }

  private fun prerequisiteFailure(): String? = when {
    ActiveWalkController.precision(this) == "denied" -> "PERMISSION_REVOKED"
    !ActiveWalkController.notificationsEnabled(this) -> "NOTIFICATIONS_DISABLED"
    ActiveWalkController.compatibleProviders(this).isEmpty() -> "PROVIDER_UNAVAILABLE"
    else -> null
  }

  private fun notification(): Notification {
    val stop = PendingIntent.getBroadcast(
      this, 0, Intent(this, StopReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, ActiveWalkController.CHANNEL_ID)
      else Notification.Builder(this)
    builder.setSmallIcon(R.drawable.ic_walk)
      .setContentTitle("AstGeo · прогулка активна")
      .setContentText("Геолокация включена. Остановить можно здесь.")
      .setDeleteIntent(stop)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(null, "Остановить", stop).build())
    if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return builder.build()
  }

  internal fun shutdown(): Boolean {
    handler.removeCallbacks(healthCheck)
    generation = null
    var cleaned = true
    listener?.let {
      try { manager.removeUpdates(it) } catch (_: RuntimeException) { cleaned = false }
    }
    if (cleaned) listener = null
    isSubscribed = !cleaned
    stopForeground(STOP_FOREGROUND_REMOVE)
    isForeground = false
    stopSelf()
    return cleaned
  }

  override fun onDestroy() {
    shutdown()
    ActiveWalkController.serviceDestroyed(this)
    super.onDestroy()
  }
}
