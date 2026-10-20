package kz.astanaai.activewalk

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

/**
 * One process-local owner. No binding, scheduler, persistent registration, or saved coordinate queue.
 * Main-looper mutations publish one immutable observation for the synchronous JS-thread getter.
 */
internal object ActiveWalkController {
  const val CHANNEL_ID = "astana_active_walk_v1"
  const val NOTIFICATION_ID = 7011
  const val PERMIT_EXTRA = "startPermit"
  const val FRESH_FIX_MS = 30_000L
  private val main = Handler(Looper.getMainLooper())
  private val session = WalkSession()
  private var service: ActiveWalkService? = null
  private var appContext: Context? = null
  private var foregroundUi = false
  private var lastFixElapsedMs: Long? = null
  private var lastFixTimestampMs: Long? = null
  private var lastAccuracy: Float? = null
  private var sampleCount = 0
  private val observers = linkedMapOf<Any, Observer>()
  private val pendingStarts = mutableListOf<(Map<String, Any?>) -> Unit>()

  private data class Fix(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Double,
    val timestampMs: Long,
    val elapsedMs: Long
  )
  private data class Observation(
    val generation: Long,
    val running: Boolean,
    val visible: Boolean,
    val fix: Fix?
  )
  private val observation = AtomicReference(Observation(0, false, false, null))

  interface Observer {
    fun stateChanged(state: Map<String, Any?>)
    fun locationAvailable(generation: Long)
  }

  fun onMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post(action)
  }

  fun attach(owner: Any, context: Context, observer: Observer, visible: () -> Boolean) = onMain {
    appContext = context.applicationContext
    observers[owner] = observer
    setVisible(visible())
  }

  fun detach(owner: Any) = onMain {
    observers.remove(owner)
    if (observers.isEmpty()) setVisible(false)
  }

  fun setVisible(visible: Boolean) {
    checkMain()
    foregroundUi = visible
    val old = observation.get()
    // Backgrounding discards the point; resume never replays an earlier fix.
    observation.set(old.copy(visible = visible, fix = if (visible) old.fix else null))
  }

  fun precision(context: Context): String = when {
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "fine"
    context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "coarse"
    else -> "denied"
  }

  fun compatibleProviders(context: Context): List<String> {
    if (precision(context) == "denied") return emptyList()
    val manager = context.getSystemService(LocationManager::class.java)
    return try {
      val permitted = if (precision(context) == "fine") {
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      } else {
        listOf(LocationManager.NETWORK_PROVIDER)
      }
      permitted.filter { manager.isProviderEnabled(it) }
    } catch (_: RuntimeException) {
      emptyList()
    }
  }

  fun notificationsEnabled(context: Context): Boolean {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return false
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = manager.getNotificationChannel(CHANNEL_ID)
      if (channel?.importance == NotificationManager.IMPORTANCE_NONE) return false
    }
    return true
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Активная прогулка", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Управление геолокацией явно запущенной прогулки"
        setShowBadge(false)
      }
    )
  }

  fun start(context: Context, activity: Activity?, resumed: Boolean, complete: (Map<String, Any?>) -> Unit) {
    checkMain()
    appContext = context.applicationContext
    try {
      ensureChannel(context)
    } catch (_: RuntimeException) {
      fail(context, "NOTIFICATION_SETUP_FAILED")
      complete(state(context))
      return
    }
    val blocked = when {
      activity == null || activity.isFinishing || activity.isDestroyed || !resumed -> "ACTIVITY_NOT_RESUMED"
      precision(context) == "denied" -> "PERMISSION_DENIED"
      !notificationsEnabled(context) -> "NOTIFICATIONS_DISABLED"
      compatibleProviders(context).isEmpty() -> "PROVIDER_UNAVAILABLE"
      session.status == "error" && service != null -> "STOP_CLEANUP_FAILED"
      else -> null
    }
    if (blocked != null) {
      fail(context, blocked)
      complete(state(context))
      return
    }
    setVisible(true)
    if (session.status == "running") {
      complete(state(context))
      return
    }
    pendingStarts += complete
    if (session.status == "starting") return
    clearFix()
    val token = session.beginStart(UUID.randomUUID().toString(), SystemClock.elapsedRealtime()) ?: return
    publish()
    val expectedGeneration = session.generation
    try {
      val intent = Intent(context, ActiveWalkService::class.java).putExtra(PERMIT_EXTRA, token)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      main.postDelayed({
        if (session.status == "starting" && session.generation == expectedGeneration) {
          fail(context, "START_TIMEOUT")
        }
      }, 10_000)
    } catch (_: SecurityException) {
      fail(context, "START_PERMISSION_REJECTED")
    } catch (_: RuntimeException) {
      fail(context, "START_REJECTED")
    }
  }

  fun consumePermit(candidate: String?): Long? {
    checkMain()
    val previous = session.status
    val generation = session.consumePermit(candidate, SystemClock.elapsedRealtime())
    if (previous != session.status) {
      publish()
      completeStarts()
    }
    return generation
  }

  fun attachService(candidate: ActiveWalkService, generation: Long): Boolean {
    checkMain()
    if (session.status != "starting" || session.generation != generation || service != null) return false
    service = candidate
    return true
  }

  fun running(candidate: ActiveWalkService, generation: Long): Boolean {
    checkMain()
    if (service !== candidate || !candidate.isForeground || !candidate.isSubscribed ||
      !session.markRunning(generation)
    ) return false
    publish()
    completeStarts()
    return true
  }

  fun isCurrent(candidate: ActiveWalkService, generation: Long): Boolean =
    service === candidate && session.acceptsFix(generation)

  fun fix(candidate: ActiveWalkService, generation: Long, location: Location) {
    checkMain()
    if (!isCurrent(candidate, generation)) return
    val ageMs = (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000
    if (ageMs < 0 || ageMs > FRESH_FIX_MS || !location.hasAccuracy() ||
      !location.accuracy.isFinite() || location.accuracy < 0 ||
      !location.latitude.isFinite() || !location.longitude.isFinite() ||
      location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0
    ) return
    lastFixElapsedMs = location.elapsedRealtimeNanos / 1_000_000
    lastFixTimestampMs = location.time
    lastAccuracy = location.accuracy
    sampleCount += 1
    val point = if (foregroundUi) Fix(
      location.latitude, location.longitude, location.accuracy.toDouble(), location.time,
      location.elapsedRealtimeNanos / 1_000_000
    ) else null
    observation.set(Observation(generation, true, foregroundUi, point))
    publish(clearPoint = false)
    if (point != null) notifyObservers { it.locationAvailable(generation) }
  }

  /** Synchronous read on the JS thread; never waits for the main looper. */
  fun currentFix(expectedGeneration: Long): Map<String, Any?>? {
    val snapshot = observation.get()
    val point = snapshot.fix ?: return null
    if (!snapshot.running || !snapshot.visible || snapshot.generation != expectedGeneration) return null
    val age = SystemClock.elapsedRealtime() - point.elapsedMs
    if (age < 0 || age > FRESH_FIX_MS) return null
    return mapOf(
      "latitude" to point.latitude, "longitude" to point.longitude,
      "accuracyMeters" to point.accuracyMeters, "timestampMs" to point.timestampMs,
      "generation" to snapshot.generation
    )
  }

  fun stop(context: Context): Map<String, Any?> {
    checkMain()
    session.stop()
    clearFix()
    try {
      val live = service
      val cleaned = live?.shutdown() ?: true
      service = if (cleaned) null else live
      context.stopService(Intent(context, ActiveWalkService::class.java))
      if (!cleaned) session.fail("STOP_CLEANUP_FAILED")
    } finally {
      if (!PreparedAudioOwner.stop()) session.fail("STOP_CLEANUP_FAILED")
    }
    publish()
    completeStarts()
    return state(context)
  }

  fun fail(context: Context, code: String) {
    checkMain()
    session.fail(code)
    clearFix()
    val live = service
    val cleaned = live?.shutdown() ?: true
    service = if (cleaned) null else live
    if (!cleaned) session.fail("STOP_CLEANUP_FAILED")
    context.stopService(Intent(context, ActiveWalkService::class.java))
    publish()
    completeStarts()
  }

  fun serviceDestroyed(candidate: ActiveWalkService) {
    checkMain()
    if (service !== candidate) return
    if (candidate.isSubscribed) {
      session.fail("STOP_CLEANUP_FAILED")
      clearFix()
      publish()
      completeStarts()
      return
    }
    service = null
    if (session.status != "error") session.stop()
    clearFix()
    publish()
    completeStarts()
  }

  fun state(context: Context): Map<String, Any?> {
    checkMain()
    val age = lastFixElapsedMs?.let { (SystemClock.elapsedRealtime() - it).coerceAtLeast(0) }
    return mapOf(
      "status" to session.status, "generation" to session.generation,
      "foreground" to (service?.isForeground ?: false),
      "subscribed" to (service?.isSubscribed ?: false),
      "precision" to precision(context),
      "providerEnabled" to compatibleProviders(context).isNotEmpty(),
      "notificationsEnabled" to notificationsEnabled(context),
      "fixStatus" to when { age == null -> "no-fix"; age <= FRESH_FIX_MS -> "fresh"; else -> "stale" },
      "lastFixAgeMs" to age, "accuracyMeters" to lastAccuracy,
      "fixTimestampMs" to lastFixTimestampMs, "sampleCount" to sampleCount,
      "errorCode" to session.errorCode
    )
  }

  private fun clearFix() {
    lastFixElapsedMs = null
    lastFixTimestampMs = null
    lastAccuracy = null
    sampleCount = 0
    observation.set(Observation(session.generation, false, foregroundUi, null))
  }

  private fun publish(clearPoint: Boolean = true) {
    val previous = observation.get()
    observation.set(Observation(
      session.generation, session.status == "running", foregroundUi,
      if (clearPoint) null else previous.fix
    ))
    val context = appContext ?: return
    val state = state(context)
    notifyObservers { it.stateChanged(state) }
  }

  private fun completeStarts() {
    if (session.status == "starting") return
    val context = appContext ?: return
    val callbacks = pendingStarts.toList()
    pendingStarts.clear()
    val state = state(context)
    callbacks.forEach {
      // A destroyed bridge must not interrupt native Stop or another waiting caller.
      try { it(state) } catch (_: RuntimeException) { }
    }
  }

  private fun notifyObservers(action: (Observer) -> Unit) {
    observers.toList().forEach { (owner, observer) ->
      try { action(observer) } catch (_: RuntimeException) { observers.remove(owner) }
    }
    if (observers.isEmpty()) setVisible(false)
  }

  private fun checkMain() = check(Looper.myLooper() == Looper.getMainLooper()) {
    "Active walk mutation must run on the main looper"
  }
}
