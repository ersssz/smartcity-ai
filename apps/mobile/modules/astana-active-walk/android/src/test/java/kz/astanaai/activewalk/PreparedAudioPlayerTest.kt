package kz.astanaai.activewalk

import java.io.ByteArrayInputStream

/** JVM byte/path verification only; no claim of Android MediaPlayer acceptance. */
fun main() {
  val sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  val path = "astana-audio/$sha.mp3"
  var checks = 0
  fun reject(code: String, action: () -> Unit) {
    try { action(); error("Expected $code") }
    catch (failure: PreparedAudioFailure) { check(failure.code == code) { "${failure.code} != $code" } }
    checks++
  }
  check(PreparedAudioAssetVerifier.validate(path, sha) == "audio-$sha"); checks++
  check(PreparedAudioAssetVerifier.verify(ByteArrayInputStream("abc".toByteArray()), sha).bytes == 3L); checks++
  for (invalid in listOf("https://example.test/test.mp3", "/sdcard/test.mp3", "astana-audio/../$sha.mp3", "astana-audio/${sha.uppercase()}.mp3")) {
    reject("INVALID_ASSET_PATH") { PreparedAudioAssetVerifier.validate(invalid, sha) }
  }
  reject("SHA256_MISMATCH") { PreparedAudioAssetVerifier.validate(path, "0".repeat(64)) }
  reject("ASSET_SHA_MISMATCH") { PreparedAudioAssetVerifier.verify(ByteArrayInputStream("abd".toByteArray()), sha) }
  reject("ASSET_EMPTY") { PreparedAudioAssetVerifier.verify(ByteArrayInputStream(byteArrayOf()), sha) }
  reject("ASSET_TOO_LARGE") { PreparedAudioAssetVerifier.verify(ByteArrayInputStream("abc".toByteArray()), sha, byteLimit = 2) }
  reject("CANCELLED") { PreparedAudioAssetVerifier.verify(ByteArrayInputStream("abc".toByteArray()), sha, cancelled = { true }) }
  println("PreparedAudioAssetVerifier: $checks checks PASS; Android playback/lifecycle not exercised")
}
