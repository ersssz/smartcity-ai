package kz.astanaai.activewalk

/** Process-local authorization seam. All mutations belong to the main looper. */
class WalkSession {
  var status: String = "stopped"
    private set
  var generation: Long = 0
    private set
  var errorCode: String? = null
    private set
  private var pendingToken: String? = null
  private var permitExpiresAtMs: Long = 0
  private var permitConsumed = false

  fun beginStart(token: String, nowMs: Long): String? {
    if (status == "starting" || status == "running") return null
    generation += 1
    status = "starting"
    errorCode = null
    pendingToken = token
    permitExpiresAtMs = nowMs + 10_000
    permitConsumed = false
    return token
  }

  fun consumePermit(token: String?, nowMs: Long): Long? {
    if (status != "starting" || token == null || token != pendingToken) return null
    pendingToken = null
    if (nowMs >= permitExpiresAtMs) {
      fail("START_EXPIRED")
      return null
    }
    permitConsumed = true
    return generation
  }

  fun markRunning(expectedGeneration: Long): Boolean {
    if (status != "starting" || expectedGeneration != generation || !permitConsumed) return false
    status = "running"
    return true
  }

  fun acceptsFix(expectedGeneration: Long): Boolean =
    status == "running" && expectedGeneration == generation

  fun stop() {
    generation += 1
    pendingToken = null
    permitConsumed = false
    status = "stopped"
    errorCode = null
  }

  fun fail(code: String) {
    generation += 1
    pendingToken = null
    permitConsumed = false
    status = "error"
    errorCode = code
  }
}
