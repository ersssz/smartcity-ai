package kz.astanaai.activewalk

import android.os.Handler
import android.os.Looper
import android.app.PendingIntent
import android.content.Intent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kz.astanaai.activewalk.narration.NarrationBridgeFacade
import kz.astanaai.activewalk.narration.NarrationHost

class ActiveWalkModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var disposed = false
  private var preparedPlayer: PreparedAudioPlayer? = null
  @Volatile private var narrationBridge: NarrationBridgeFacade? = null
  private fun narration(): NarrationBridgeFacade = narrationBridge?.takeUnless { disposed }
    ?: throw CodedException("NARRATION_UNAVAILABLE", "Narration is not ready", null)
  private fun audio(): PreparedAudioPlayer {
    check(!disposed) { "APP_CONTEXT_UNAVAILABLE" }
    return preparedPlayer ?: PreparedAudioPlayer(requireNotNull(appContext.reactContext)) { state ->
      if (!disposed) sendEvent("onPreparedAudioState", state)
    }.also { preparedPlayer = it; PreparedAudioOwner.register(it); it.setForeground(resumed()) }
  }
  private val observer = object : ActiveWalkController.Observer {
    override fun stateChanged(state: Map<String, Any?>) {
      if (!disposed) sendEvent("onStateChanged", state)
    }
    override fun locationAvailable(generation: Long) {
      // Only a signal crosses Expo's async event queue. Coordinates are pulled synchronously.
      if (!disposed && resumed()) sendEvent("onLocation", mapOf("generation" to generation))
    }
  }

  private fun resumed(): Boolean {
    val activity = appContext.currentActivity ?: return false
    return !activity.isDestroyed && !activity.isFinishing &&
      (activity as? LifecycleOwner)?.lifecycle?.currentState == Lifecycle.State.RESUMED
  }

  override fun definition() = ModuleDefinition {
    Name("AstanaActiveWalk")
    Events("onStateChanged", "onLocation", "onPreparedAudioState", "onNarrationState")

    OnCreate {
      ActiveWalkController.onMain {
        if (!disposed) appContext.reactContext?.let {
          val launch = it.packageManager.getLaunchIntentForPackage(it.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          val activity = launch?.let { intent -> PendingIntent.getActivity(it, 7401, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
          narrationBridge = NarrationHost.createBridge(it, android.R.drawable.ic_media_play,
            { !disposed && resumed() }, { state -> if (!disposed) sendEvent("onNarrationState", state) }, activity)
          ActiveWalkController.attach(this@ActiveWalkModule, it, observer) { resumed() }
        }
      }
    }
    OnDestroy {
      disposed = true
      main.removeCallbacksAndMessages(null)
      ActiveWalkController.detach(this@ActiveWalkModule)
      ActiveWalkController.onMain {
        try { narrationBridge?.close() }
        finally {
          narrationBridge = null
          PreparedAudioOwner.detach(preparedPlayer); preparedPlayer?.release(); preparedPlayer = null
        }
      }
    }
    OnActivityEntersForeground {
      // Expo can dispatch inside Activity.onResume before AndroidX's post-resume transition.
      main.post { if (!disposed) { ActiveWalkController.setVisible(resumed()); preparedPlayer?.setForeground(resumed()) } }
    }
    OnActivityEntersBackground {
      ActiveWalkController.onMain { if (!disposed) { ActiveWalkController.setVisible(false); preparedPlayer?.setForeground(false) } }
    }
    OnActivityDestroys {
      ActiveWalkController.onMain { if (!disposed) { ActiveWalkController.setVisible(false); preparedPlayer?.setForeground(false) } }
    }

    AsyncFunction("start") { promise: Promise ->
      val context = if (disposed) null else appContext.reactContext
      if (context == null) {
        promise.reject("ERR_APP_CONTEXT", "Native application context is unavailable", null)
      } else {
        ActiveWalkController.start(context, appContext.currentActivity, resumed()) { promise.resolve(it) }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext) { "Native application context is unavailable" }
      ActiveWalkController.stop(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getState") {
      val context = requireNotNull(appContext.reactContext) { "Native application context is unavailable" }
      ActiveWalkController.state(context)
    }.runOnQueue(Queues.MAIN)

    Function("getCurrentLocation") { generation: Long ->
      // AndroidX LifecycleRegistry is main-thread confined. This JS-thread read uses only the
      // immutable observation published by Start/lifecycle hooks, never Activity/context APIs.
      if (disposed) null else ActiveWalkController.currentFix(generation)
    }

    Function("hashUtf8") { text: String -> PreparedAssetVerifier.hashUtf8(text) }
    AsyncFunction("verifyAudioAssets") { records: List<Map<String, Any?>> ->
      val context = requireNotNull(appContext.reactContext) { "APP_CONTEXT_UNAVAILABLE" }
      PreparedAssetVerifier.verify(context, records)
    }
    // Capture reads the immutable publication only. No lifecycle/player access on the JS thread.
    Function("narrationCaptureScope") { narration().captureScopeDto() }
    AsyncFunction("narrationPlay") { captured: Map<String, Any?>, ref: Map<String, Any?> -> narration().play(captured, ref) }.runOnQueue(Queues.MAIN)
    AsyncFunction("narrationPause") { captured: Map<String, Any?> -> narration().pause(captured) }.runOnQueue(Queues.MAIN)
    AsyncFunction("narrationResume") { captured: Map<String, Any?> -> narration().resume(captured) }.runOnQueue(Queues.MAIN)
    AsyncFunction("narrationStop") { narration().stop() }.runOnQueue(Queues.MAIN)
    AsyncFunction("narrationGetState") { narration().getState() }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparedAudioPlay") { assetPath: String, expectedSha256: String ->
      val selected = audio(); PreparedAudioOwner.register(selected); selected.play(assetPath, expectedSha256)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparedAudioPause") { audio().pause() }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparedAudioStop") { audio().stop() }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparedAudioGetState") { audio().getState() }.runOnQueue(Queues.MAIN)
  }
}
