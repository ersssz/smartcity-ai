package kz.astanaai.activewalk

import android.os.Handler
import android.os.Looper
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ActiveWalkModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var disposed = false
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
    Events("onStateChanged", "onLocation")

    OnCreate {
      ActiveWalkController.onMain {
        if (!disposed) appContext.reactContext?.let {
          ActiveWalkController.attach(this@ActiveWalkModule, it, observer) { resumed() }
        }
      }
    }
    OnDestroy {
      disposed = true
      main.removeCallbacksAndMessages(null)
      ActiveWalkController.detach(this@ActiveWalkModule)
    }
    OnActivityEntersForeground {
      // Expo can dispatch inside Activity.onResume before AndroidX's post-resume transition.
      main.post { if (!disposed) ActiveWalkController.setVisible(resumed()) }
    }
    OnActivityEntersBackground {
      ActiveWalkController.onMain { if (!disposed) ActiveWalkController.setVisible(false) }
    }
    OnActivityDestroys {
      ActiveWalkController.onMain { if (!disposed) ActiveWalkController.setVisible(false) }
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
  }
}
