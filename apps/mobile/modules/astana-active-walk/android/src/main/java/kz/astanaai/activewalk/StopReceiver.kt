package kz.astanaai.activewalk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Explicit immutable notification action. It never starts a service or needs the JS bridge. */
class StopReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    ActiveWalkController.stop(context.applicationContext)
  }
}
