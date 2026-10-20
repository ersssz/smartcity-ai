package kz.astanaai.activewalk

import android.os.Looper
import java.lang.ref.WeakReference

/** One process-owned Stop seam, including the native notification receiver. */
object PreparedAudioOwner {
  private val players = mutableListOf<WeakReference<PreparedAudioPlayer>>()
  fun register(player: PreparedAudioPlayer) {
    check(Looper.myLooper() == Looper.getMainLooper())
    players.removeAll { it.get() == null }
    players.mapNotNull { it.get() }.filter { it !== player }.forEach { it.stop() }
    if (players.none { it.get() === player }) players.add(WeakReference(player))
  }
  fun detach(player: PreparedAudioPlayer?) {
    check(Looper.myLooper() == Looper.getMainLooper())
    players.removeAll { it.get() == null || it.get() === player }
  }
  fun stop(): Boolean {
    check(Looper.myLooper() == Looper.getMainLooper())
    var successful = true
    players.mapNotNull { it.get() }.forEach { if (runCatching { it.stop() }.isFailure) successful = false }
    players.removeAll { it.get() == null }
    return successful
  }
}
