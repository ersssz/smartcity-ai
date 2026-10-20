package kz.astanaai.activewalk

/** Dependency-free JVM tests of the native authorization seam, not Android hardware tests. */
fun main() {
  val session = WalkSession()
  val token = session.beginStart("test-start", 1_000)
  session.stop()
  check(session.consumePermit(token, 1_001) == null) {
    "Stop must revoke a pending start before the service receives its intent"
  }
  println("PASS: Stop defeats a pending Start")

  val oneUse = WalkSession()
  val permit = oneUse.beginStart("one-use", 2_000)
  check(oneUse.consumePermit(permit, 2_001) != null)
  check(oneUse.consumePermit(permit, 2_002) == null) {
    "A service start intent must not reuse a consumed authorization"
  }
  println("PASS: A Start permit is consumed exactly once")

  val expired = WalkSession()
  val expiredToken = expired.beginStart("expired", 3_000)
  check(expired.consumePermit(expiredToken, 13_000) == null) {
    "A delayed service intent must not start tracking once the 10-second permit expires"
  }
  check(expired.status == "error" && expired.errorCode == "START_EXPIRED")
  println("PASS: Delayed Start expires safely")

  val duplicate = WalkSession()
  val first = duplicate.beginStart("first", 4_000)
  check(duplicate.beginStart("second", 4_001) == null) {
    "Duplicate Start must keep the original pending operation"
  }
  val runningGeneration = checkNotNull(duplicate.consumePermit(first, 4_002))
  check(duplicate.markRunning(runningGeneration))
  check(duplicate.beginStart("third", 4_003) == null)
  println("PASS: Duplicate Start keeps one native session")

  duplicate.stop()
  val replacement = duplicate.beginStart("replacement", 5_000)
  val newGeneration = checkNotNull(duplicate.consumePermit(replacement, 5_001))
  check(duplicate.markRunning(newGeneration))
  check(!duplicate.acceptsFix(runningGeneration)) {
    "A callback from the previous listener must not enter a new walk"
  }
  check(duplicate.acceptsFix(newGeneration))
  duplicate.stop()
  check(!duplicate.markRunning(newGeneration)) {
    "A late subscription completion must not revive a stopped walk"
  }
  println("PASS: Old callbacks and late Start cannot revive a stopped walk")

  val notAdmitted = WalkSession()
  notAdmitted.beginStart("pending", 6_000)
  check(!notAdmitted.markRunning(notAdmitted.generation)) {
    "Starting state is not evidence that the service consumed its permit"
  }
  check(WalkSession().consumePermit("pending", 6_001) == null)
  check(notAdmitted.consumePermit(null, 6_001) == null)
  check(notAdmitted.consumePermit("unknown", 6_001) == null)
  println("PASS: Fresh processes and unknown intents have no authorization")

  val failing = WalkSession()
  val failureToken = failing.beginStart("failing", 7_000)
  val failedGeneration = checkNotNull(failing.consumePermit(failureToken, 7_001))
  failing.fail("PERMISSION_DENIED")
  check(failing.status == "error" && failing.errorCode == "PERMISSION_DENIED")
  check(!failing.markRunning(failedGeneration) && !failing.acceptsFix(failedGeneration))
  failing.stop()
  check(failing.status == "stopped" && failing.errorCode == null)
  println("PASS: Failed permission/subscription stays stopped until explicit Start")
}
