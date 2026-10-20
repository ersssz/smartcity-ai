package kz.astanaai.activewalk.narration

import kz.astanaai.activewalk.narration.*

data class HostScope(val processNonce: String, val requestEpoch: Long)
enum class HostPhase { ABSENT, STARTING, RUNNING, STOPPING, ERROR }
data class HostSnapshot(val hostScope: HostScope, val eventSequence: Long, val phase: HostPhase,
  val audio: AudioSnapshot? = null, val pendingRequestId: String? = null, val errorCode: String? = null)
data class HostCommandReceipt(val accepted: Boolean, val state: HostSnapshot, val rejected: String? = null)
data class ServiceStartDecision(val admitted: Boolean, val state: HostSnapshot, val rejected: String? = null)

/** Native-only handle. The coordinator checks actual identity, never a bridge-provided string. */
class NativeClientHandle internal constructor(internal val id: String)

/** The same runtime API has an actual Android adapter and a recording platform adapter for JVM tests. */
interface HostedNarrationRuntime {
  fun snapshot(): AudioSnapshot
  fun play(ref: NarrationRef, scope: AudioScope, clientId: String): AudioTransition
  fun pause(scope: AudioScope): AudioTransition
  fun resume(scope: AudioScope, clientId: String): AudioTransition
  fun stopAudio(): AudioTransition
  fun bridgeDestroyed(clientId: String): AudioTransition
  fun subscribe(listener: (AudioSnapshot) -> Unit): () -> Unit
  fun release(): AudioSnapshot
}

/** Android system boundary. No tracking, SQL, files, permission changes or remote services. */
interface NarrationHostPlatform {
  fun startService(nonce: String)
  fun stopService(service: Any, startId: Int?)
  fun createRuntime(service: Any, runtimeId: String, visibleClient: (String) -> Boolean): HostedNarrationRuntime
}

class NarrationCoordinator(
  private val platform: NarrationHostPlatform,
  private val now: () -> Long,
  private val newId: () -> String,
  private val checkMain: () -> Unit = {},
  private val permitTtlMs: Long = 10_000,
) {
  companion object { const val START_ACTION = "kz.astanaai.narration.START"; const val MAX_SAFE_EPOCH = 9_007_199_254_740_991L }
  init { require(permitTtlMs in 1..10_000) }
  private val processNonce = newId()
  private val clients = mutableMapOf<NativeClientHandle, () -> Boolean>()
  private data class Permit(val nonce: String, val client: NativeClientHandle, val epoch: Long,
    val ref: NarrationRef, val deadline: Long)
  private var pending: Permit? = null
  private var serviceIdentity: Any? = null
  private var runtime: HostedNarrationRuntime? = null
  private var removeRuntimeListener: (() -> Unit)? = null
  private var owner: NativeClientHandle? = null
  private var busy = false
  private var closing = false
  private var publishing = false
  private var cleanupFault = false // No command can turn an unconfirmed hardware cleanup into success.
  private val listeners = mutableMapOf<Long, Pair<NativeClientHandle, (HostSnapshot) -> Unit>>()
  private var listenerSequence = 0L
  fun stopAudio(): HostCommandReceipt {
    checkMain(); if (closing) return reject("SERVICE_CLOSING")
    closeCurrent(null, null)
    return HostCommandReceipt(published.errorCode == null, published, published.errorCode)
  }
  fun onServiceCreated(service: Any): Boolean {
    checkMain()
    if (serviceIdentity != null && serviceIdentity !== service || published.phase == HostPhase.STOPPING || closing) {
      runCatching { platform.stopService(service, null) }; return false
    }
    serviceIdentity = service; return true
  }
  fun consumeStart(service: Any, startId: Int, action: String?, nonce: String?): ServiceStartDecision {
    checkMain()
    val permit = pending
    val code = when {
      serviceIdentity !== service -> "STALE_SERVICE"
      closing || busy || published.phase == HostPhase.STOPPING -> "SERVICE_CLOSING"
      action != START_ACTION || nonce == null || permit == null || nonce != permit.nonce -> "START_NOT_ADMITTED"
      permit.epoch != published.hostScope.requestEpoch -> "STALE_HOST_SCOPE"
      now() >= permit.deadline -> "START_EXPIRED"
      clients[permit.client] == null -> "CLIENT_CLOSED"
      !visible(permit.client) -> "NOT_FOREGROUND"
      else -> null
    }
    if (code != null) {
      // A duplicate/null intent is not an audio Stop capability for an admitted live owner.
      if (serviceIdentity === service && runtime != null && owner?.let { clients.containsKey(it) } == true &&
        published.phase == HostPhase.RUNNING) return ServiceStartDecision(false, published, code)
      if (serviceIdentity === service && !closing) closeCurrent(startId, code)
      else runCatching { platform.stopService(service, startId) }
      return ServiceStartDecision(false, published, code)
    }
    val admitted = permit!!
    pending = null // Single-use BEFORE creating runtime or publishing any callback.
    busy = true
    publish(published.copy(pendingRequestId = null))
    var candidate: HostedNarrationRuntime? = null
    try {
      val runtimeId = newId() // Opaque instance identity; never restored or reused across Service incarnations.
      candidate = platform.createRuntime(service, runtimeId, ::visibleId)
      if (serviceIdentity !== service || published.hostScope.requestEpoch != admitted.epoch || closing || published.phase == HostPhase.STOPPING) {
        releaseUnowned(candidate); return ServiceStartDecision(false, published, "START_CANCELLED")
      }
      runtime = candidate; owner = admitted.client
      val selected = candidate
      removeRuntimeListener = selected.subscribe { audio -> onAudio(selected, audio) }
      publish(published.copy(phase = HostPhase.RUNNING, audio = selected.snapshot(), errorCode = null))
      val result = selected.play(admitted.ref, selected.snapshot().scope, admitted.client.id)
      if (runtime !== selected || serviceIdentity !== service) return ServiceStartDecision(false, published, "START_CANCELLED")
      onAudio(selected, result.snapshot)
      if (result.rejected != null) closeCurrent(startId, result.rejected)
      return ServiceStartDecision(result.rejected == null && runtime === selected, published, result.rejected ?: published.errorCode)
    } catch (_: Exception) {
      if (candidate !== runtime && candidate != null) releaseUnowned(candidate)
      closeCurrent(startId, "RUNTIME_START_FAILED")
      return ServiceStartDecision(false, published, "RUNTIME_START_FAILED")
    } finally { busy = false }
  }
  fun onServiceDestroyed(service: Any) {
    checkMain(); if (serviceIdentity !== service) return
    if (closing) { serviceIdentity = null; return } // Exact teardown acknowledgment can arrive reentrantly.
    closeCurrent(null, published.errorCode, destroying = true)
  }
  fun taskRemoved(service: Any) { checkMain(); if (serviceIdentity === service) stopAudio() }
  fun detachClient(client: NativeClientHandle): HostCommandReceipt {
    checkMain()
    if (clients.remove(client) == null) return reject("CLIENT_CLOSED")
    listeners.entries.removeAll { it.value.first === client }
    if (pending?.client === client || owner === client) closeCurrent(null, null)
    return HostCommandReceipt(true, published)
  }
  fun subscribe(client: NativeClientHandle, listener: (HostSnapshot) -> Unit): () -> Unit {
    checkMain(); check(clients.containsKey(client)) { "CLIENT_CLOSED" }; check(listeners.size < 32)
    val id = ++listenerSequence; listeners[id] = client to listener
    return { checkMain(); listeners.remove(id); Unit }
  }
  fun pause(client: NativeClientHandle, host: HostScope, audio: AudioScope): HostCommandReceipt = control(client, host, audio, false)
  fun resume(client: NativeClientHandle, host: HostScope, audio: AudioScope): HostCommandReceipt = control(client, host, audio, true)
  private fun control(client: NativeClientHandle, host: HostScope, audio: AudioScope, resume: Boolean): HostCommandReceipt {
    checkMain()
    commandError(client, host)?.let { return reject(it) }
    val selected = runtime ?: return reject("OPEN_APP_REQUIRED")
    if (owner !== client) return reject("AUDIO_OWNER_MISMATCH")
    if (selected.snapshot().scope != audio) return reject("STALE_AUDIO_SCOPE")
    if (resume && !visible(client)) return reject("NOT_FOREGROUND")
    busy = true
    return try {
      val result = if (resume) selected.resume(audio, client.id) else selected.pause(audio)
      if (runtime === selected) onAudio(selected, result.snapshot)
      HostCommandReceipt(result.rejected == null, published, result.rejected)
    } catch (_: Exception) { closeCurrent(null, "RUNTIME_COMMAND_FAILED"); reject("RUNTIME_COMMAND_FAILED") }
    finally { busy = false }
  }
  @Volatile private var published = HostSnapshot(HostScope(processNonce, 0), 0, HostPhase.ABSENT)
  fun snapshot(): HostSnapshot = published
  /** MAIN observation captures actual player position; sync capture continues to read publication only. */
  fun observe(): HostSnapshot {
    checkMain()
    val selected = runtime
    if (selected != null && !closing) {
      try { onAudio(selected, selected.snapshot()) }
      catch (_: Exception) { closeCurrent(null, "RUNTIME_OBSERVATION_FAILED") }
    }
    return published
  }
  fun registerClient(nativeVisible: () -> Boolean): NativeClientHandle {
    checkMain(); check(clients.size < 32)
    return NativeClientHandle(newId()).also { clients[it] = nativeVisible }
  }
  fun play(client: NativeClientHandle, capturedHost: HostScope, capturedAudio: AudioScope?, ref: NarrationRef): HostCommandReceipt {
    checkMain()
    commandError(client, capturedHost)?.let { return reject(it) }
    val selected = runtime
    if (selected == null && capturedAudio != null || selected != null && selected.snapshot().scope != capturedAudio) return reject("STALE_AUDIO_SCOPE")
    if (!visible(client)) return reject("NOT_FOREGROUND")
    if (!valid(ref)) return reject("INVALID_NARRATION_REF")
    if (published.hostScope.requestEpoch >= MAX_SAFE_EPOCH) return reject("HOST_EPOCH_EXHAUSTED")
    busy = true
    val nextEpoch = published.hostScope.requestEpoch + 1
    try {
      if (selected != null) {
        pending = null
        publish(published.copy(hostScope = HostScope(processNonce, nextEpoch), pendingRequestId = null))
        if (runtime !== selected || published.hostScope.requestEpoch != nextEpoch) return reject("START_CANCELLED")
        val result = selected.play(ref, capturedAudio!!, client.id)
        if (runtime === selected) onAudio(selected, result.snapshot)
        return HostCommandReceipt(result.rejected == null && runtime === selected, published, result.rejected ?: published.errorCode)
      }
      val permit = Permit(newId(), client, nextEpoch, ref, Math.addExact(now(), permitTtlMs))
      pending = permit
      publish(published.copy(hostScope = HostScope(processNonce, nextEpoch), phase = HostPhase.STARTING,
        pendingRequestId = permit.nonce, errorCode = null))
      if (pending !== permit) return reject("START_CANCELLED")
      platform.startService(permit.nonce)
      return HostCommandReceipt(pending === permit, published, if (pending === permit) null else "START_CANCELLED")
    }
    catch (_: Exception) {
      closeCurrent(null, "SERVICE_START_FAILED")
      return reject("SERVICE_START_FAILED")
    } finally { busy = false }
  }
  private fun commandError(client: NativeClientHandle, capturedHost: HostScope): String? = when {
    closing || published.phase == HostPhase.STOPPING || serviceIdentity != null && runtime == null && published.phase == HostPhase.ERROR -> "SERVICE_CLOSING"
    busy || publishing -> "HOST_COMMAND_BUSY"
    clients[client] == null -> "CLIENT_CLOSED"
    capturedHost != published.hostScope -> "STALE_HOST_SCOPE"
    published.errorCode == "AUDIO_CLEANUP_FAILED" || published.errorCode == "HOST_CLEANUP_FAILED" -> "HOST_CLEANUP_REQUIRED"
    else -> null
  }
  private fun releaseUnowned(candidate: HostedNarrationRuntime) {
    val final = runCatching { candidate.release() }
    if (final.isFailure || final.getOrNull()?.errorCode == "AUDIO_CLEANUP_FAILED") {
      cleanupFault = true
      publish(published.copy(phase = HostPhase.ERROR, errorCode = "HOST_CLEANUP_FAILED"))
    }
  }
  private fun onAudio(selected: HostedNarrationRuntime, audio: AudioSnapshot) {
    checkMain(); if (runtime !== selected || closing) return
    val actualOwner = audio.ownerClientId?.let { id -> clients.keys.firstOrNull { it.id == id } }
    if (audio.ownerClientId != null && actualOwner == null) { closeCurrent(null, "CLIENT_CLOSED"); return }
    owner = actualOwner
    publish(published.copy(audio = audio))
    if (runtime === selected && audio.status in listOf(AudioStatus.STOPPED, AudioStatus.ERROR))
      closeCurrent(null, audio.errorCode)
  }
  private fun closeCurrent(startId: Int?, reason: String?, destroying: Boolean = false) {
    if (closing) return
    closing = true
    val selected = runtime; val service = serviceIdentity; val unsubscribe = removeRuntimeListener
    // Revoke all RAM authority BEFORE cleanup and before arbitrary observers can run.
    pending = null; runtime = null; owner = null; removeRuntimeListener = null
    var failed = cleanupFault
    try {
      val nextEpoch = published.hostScope.requestEpoch.coerceAtMost(MAX_SAFE_EPOCH - 1) + 1
      publish(published.copy(hostScope = HostScope(processNonce, nextEpoch), pendingRequestId = null,
        phase = if (service == null && selected == null) HostPhase.ABSENT else HostPhase.STOPPING, errorCode = reason))
      if (runCatching { unsubscribe?.invoke() }.isFailure) failed = true
      val final = runCatching { selected?.release() }.getOrElse { failed = true; null }
      if (final?.errorCode == "AUDIO_CLEANUP_FAILED") failed = true
      if (!destroying && service != null && runCatching { platform.stopService(service, startId) }.isFailure) failed = true
      if (destroying) serviceIdentity = null
      cleanupFault = failed
      publish(published.copy(audio = final ?: published.audio?.copy(status = AudioStatus.STOPPED, ref = null,
        ownerClientId = null, canResume = false, serviceForeground = false),
        phase = if (failed) HostPhase.ERROR else if (serviceIdentity == null) { if (reason == null) HostPhase.ABSENT else HostPhase.ERROR } else HostPhase.STOPPING,
        errorCode = if (failed) "HOST_CLEANUP_FAILED" else reason))
    } finally { closing = false }
  }
  private fun publish(next: HostSnapshot) {
    if (next == published) return
    published = next.copy(eventSequence = published.eventSequence + 1)
    if (publishing) return
    publishing = true
    try { listeners.values.toList().forEach { (client, listener) -> if (clients.containsKey(client)) runCatching { listener(published) } } }
    finally { publishing = false }
  }
  private fun reject(code: String) = HostCommandReceipt(false, published, code)
  private fun visible(client: NativeClientHandle) = runCatching { clients[client]?.invoke() == true }.getOrDefault(false)
  private fun visibleId(id: String) = clients.entries.firstOrNull { it.key.id == id }?.let { visible(it.key) } ?: false
  private fun valid(ref: NarrationRef): Boolean {
    val hash = Regex("^[a-f0-9]{64}$")
    return ref.walkSessionId.isNotBlank() && ref.walkSessionId.length <= 128 && hash.matches(ref.bundleSha256) &&
      ref.narrationId.length in 1..160 && Regex("^[a-zA-Z0-9:_-]+$").matches(ref.narrationId) &&
      ref.locale in listOf("ru", "kk", "en") && ref.narrationId.endsWith(":${ref.locale}") &&
      hash.matches(ref.assetSha256) && ref.assetPath == "astana-audio/${ref.assetSha256}.mp3"
  }
}
