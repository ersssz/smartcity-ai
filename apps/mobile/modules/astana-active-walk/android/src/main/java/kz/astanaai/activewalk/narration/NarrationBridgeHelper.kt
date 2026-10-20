package kz.astanaai.activewalk.narration

import kz.astanaai.activewalk.narration.*

/** Capture at the actual UI gesture before await. This DTO is not a start permit. */
data class CapturedNarrationScope(val host: HostScope, val audio: AudioScope?)

/**
 * Native helper for the Expo bindings; no Expo dependency, no lifecycle reads on JS thread.
 * Commands must be scheduled on MAIN. capture()/snapshot() only read an immutable volatile publication.
 * Visibility closure MUST come from trusted native lifecycle, never from a serialized bridge boolean.
 */
class NarrationBridgeHelper(private val coordinator: NarrationCoordinator, nativeVisible: () -> Boolean) {
  private val client = coordinator.registerClient(nativeVisible)
  @Volatile private var closed = false
  fun snapshot(): HostSnapshot = coordinator.snapshot()
  fun capture(): CapturedNarrationScope {
    val state = coordinator.snapshot()
    return CapturedNarrationScope(state.hostScope, state.audio?.takeIf { state.phase == HostPhase.RUNNING }?.scope)
  }
  fun play(captured: CapturedNarrationScope, ref: NarrationRef): HostCommandReceipt =
    if (closed) refused("CLIENT_CLOSED") else coordinator.play(client, captured.host, captured.audio, ref)
  fun pause(captured: CapturedNarrationScope): HostCommandReceipt =
    if (closed) refused("CLIENT_CLOSED") else captured.audio?.let { coordinator.pause(client, captured.host, it) } ?: refused("OPEN_APP_REQUIRED")
  fun resume(captured: CapturedNarrationScope): HostCommandReceipt =
    if (closed) refused("CLIENT_CLOSED") else captured.audio?.let { coordinator.resume(client, captured.host, it) } ?: refused("OPEN_APP_REQUIRED")
  /** Explicit UI/global audio Stop is unconditional and does not borrow a media callback's scope. */
  fun stopAudio(): HostCommandReceipt = if (closed) refused("CLIENT_CLOSED") else coordinator.stopAudio()
  fun subscribe(listener: (HostSnapshot) -> Unit): () -> Unit {
    check(!closed) { "CLIENT_CLOSED" }; return coordinator.subscribe(client, listener)
  }
  fun close(): HostCommandReceipt {
    if (closed) return refused("CLIENT_CLOSED")
    closed = true // No callback can turn an old bridge into a new owner during teardown.
    return coordinator.detachClient(client)
  }
  fun play(captured: Map<String, Any?>, ref: Map<String, Any?>): HostCommandReceipt {
    val scope = NarrationBridgeParser.scope(captured) ?: return refused("INVALID_CAPTURED_SCOPE")
    val parsed = NarrationBridgeParser.ref(ref) ?: return refused("INVALID_NARRATION_REF")
    return play(scope, parsed) // Deliberately no fresh capture and no retry on a stale result.
  }
  private fun refused(code: String) = HostCommandReceipt(false, coordinator.snapshot(), code)
}

/** Exact DTO parser. Unknown keys/NaN/fractional or unsafe epochs are refused rather than coerced. */
object NarrationBridgeParser {
  fun scope(value: Map<String, Any?>): CapturedNarrationScope? {
    if (value.keys != setOf("host", "audio")) return null
    val host = map(value["host"]) ?: return null
    if (host.keys != setOf("processNonce", "requestEpoch")) return null
    val nonce = identifier(host["processNonce"]) ?: return null
    val epoch = integer(host["requestEpoch"]) ?: return null
    val audio = if (value["audio"] == null) null else {
      val a = map(value["audio"]) ?: return null
      if (a.keys != setOf("processId", "playbackEpoch")) return null
      AudioScope(identifier(a["processId"]) ?: return null, integer(a["playbackEpoch"]) ?: return null)
    }
    return CapturedNarrationScope(HostScope(nonce, epoch), audio)
  }
  fun ref(value: Map<String, Any?>): NarrationRef? {
    if (value.keys != setOf("walkSessionId", "bundleSha256", "narrationId", "locale", "assetPath", "assetSha256")) return null
    val walk = value["walkSessionId"] as? String ?: return null
    val bundle = value["bundleSha256"] as? String ?: return null
    val id = value["narrationId"] as? String ?: return null
    val locale = value["locale"] as? String ?: return null
    val path = value["assetPath"] as? String ?: return null
    val hash = value["assetSha256"] as? String ?: return null
    val hex = Regex("^[a-f0-9]{64}$")
    if (walk.isBlank() || walk.length > 128 || !hex.matches(bundle) || !hex.matches(hash) ||
      id.length !in 1..160 || !Regex("^[a-zA-Z0-9:_-]+$").matches(id) || locale !in listOf("ru", "kk", "en") ||
      !id.endsWith(":$locale") || path != "astana-audio/$hash.mp3") return null
    return NarrationRef(walk, bundle, id, locale, path, hash)
  }
  private fun identifier(value: Any?): String? = (value as? String)?.takeIf { Regex("^[a-zA-Z0-9:_-]{1,128}$").matches(it) }
  private fun integer(value: Any?): Long? {
    if (value !is Byte && value !is Short && value !is Int && value !is Long && value !is Float && value !is Double) return null
    val number = value as? Number ?: return null
    val d = number.toDouble()
    if (!d.isFinite() || d < 0 || d > NarrationCoordinator.MAX_SAFE_EPOCH.toDouble() || d % 1.0 != 0.0) return null
    return d.toLong()
  }
  private fun map(value: Any?): Map<String, Any?>? {
    val source = value as? Map<*, *> ?: return null
    if (source.keys.any { it !is String }) return null
    return source.entries.associate { it.key as String to it.value }
  }
}
