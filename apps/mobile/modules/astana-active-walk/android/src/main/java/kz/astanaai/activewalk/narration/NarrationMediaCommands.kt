package kz.astanaai.activewalk.narration

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Looper
import java.lang.ref.WeakReference

/** RAM only: a receiver can control an existing runtime but can NEVER create/start one. */
object NarrationMediaCommands {
  private var runtime = WeakReference<NarrationRuntime>(null)
  private const val PREFIX = "kz.astanaai.narration.media."
  private const val PROCESS = "process"
  private const val EPOCH = "epoch"

  fun attach(selected: NarrationRuntime): () -> Unit {
    checkMain()
    check(runtime.get() == null || runtime.get() === selected) { "NARRATION_OWNER_BUSY" }
    runtime = WeakReference(selected)
    return { checkMain(); if (runtime.get() === selected) runtime.clear() }
  }

  class Intents(context: Context) : ScopedMediaIntents, AutoCloseable {
    private val application = context.applicationContext
    private var selectedScope: AudioScope? = null
    private val pending = mutableMapOf<AudioTransportAction, PendingIntent>()
    override fun create(action: AudioTransportAction, scope: AudioScope): PendingIntent {
      checkMain()
      if (selectedScope != scope) { close(); selectedScope = scope }
      return pending.getOrPut(action) {
        val intent = Intent(application, NarrationMediaActionReceiver::class.java)
          .setAction(PREFIX + action.name)
          .setData(Uri.Builder().scheme("astana-narration").authority(scope.processId)
            .appendPath(scope.playbackEpoch.toString()).appendPath(action.name).build())
          .putExtra(PROCESS, scope.processId).putExtra(EPOCH, scope.playbackEpoch)
        PendingIntent.getBroadcast(application, action.ordinal, intent, PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
    }
    override fun close() {
      checkMain(); pending.values.forEach { it.cancel() }; pending.clear(); selectedScope = null
    }
  }

  internal fun receive(intent: Intent?) {
    checkMain()
    val actionName = intent?.action?.removePrefix(PREFIX) ?: return
    if (intent.action != PREFIX + actionName) return
    val action = AudioTransportAction.entries.firstOrNull { it.name == actionName } ?: return
    val process = intent.getStringExtra(PROCESS) ?: return
    if (process.isBlank() || process.length > 128) return
    val epoch = intent.getLongExtra(EPOCH, -1)
    if (epoch < 0) return
    val selected = runtime.get() ?: return // Process death/old notification never starts a service.
    val captured = AudioScope(process, epoch)
    if (selected.snapshot().scope != captured) return
    when (action) {
      AudioTransportAction.RESUME -> selected.resumeFromNotification(captured)
      AudioTransportAction.PAUSE -> selected.pause(captured)
      AudioTransportAction.STOP_AUDIO -> selected.stopAudio()
    }
  }
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) }
}

/** Root must declare exported=false when integrating. No standalone exported/browser service. */
class NarrationMediaActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) { NarrationMediaCommands.receive(intent) }
}
