package kz.astanaai.activewalk

import android.content.Context
import java.security.MessageDigest

/** APK-owned media only. Neither a URI nor a filesystem path is accepted. */
object PreparedAssetVerifier {
  private val hashPattern = Regex("^[a-f0-9]{64}$")
  fun hashUtf8(text: String): String {
    val bytes = text.toByteArray(Charsets.UTF_8)
    require(bytes.size <= 524288) { "HASH_INPUT_TOO_LARGE" }
    return hex(MessageDigest.getInstance("SHA-256").digest(bytes))
  }
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }

  fun verify(context: Context, records: List<Map<String, Any?>>): List<Map<String, Any?>> {
    require(records.size <= 256) { "ASSET_LIMIT" }
    var consumed = 0L
    return records.map { record ->
      val id = record["id"] as? String ?: throw IllegalArgumentException("INVALID_ASSET")
      val hash = record["sha256"] as? String ?: throw IllegalArgumentException("INVALID_ASSET")
      val path = record["path"] as? String ?: throw IllegalArgumentException("INVALID_ASSET")
      val expected = record["bytes"] as? Number ?: throw IllegalArgumentException("INVALID_ASSET")
      val size = expected.toLong()
      require(hashPattern.matches(hash) && id == "audio-$hash" && path == "audio/$hash.mp3" && size in 1..100000000 && expected.toDouble() == size.toDouble()) { "INVALID_ASSET" }
      try {
        val digest = MessageDigest.getInstance("SHA-256")
        var count = 0L
        context.assets.open("astana-audio/$hash.mp3").use { input ->
          val buffer = ByteArray(65536)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            count += read; consumed += read
            check(count <= size && consumed <= 250000000) { "ASSET_BYTE_LIMIT" }
            digest.update(buffer, 0, read)
          }
        }
        mapOf("id" to id, "state" to "present", "bytes" to count, "sha256" to hex(digest.digest()), "storage" to "durable")
      } catch (_: Exception) {
        mapOf("id" to id, "state" to "missing")
      }
    }
  }
}
