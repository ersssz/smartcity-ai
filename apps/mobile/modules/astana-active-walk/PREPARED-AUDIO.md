# Prepared APK audio player

New isolated files only. Root owns Expo bindings, lifecycle wiring, UI, registry,
APK assets, dependencies and Gradle. No old module/session files were changed.

## Kotlin Interface

```kotlin
val audio = PreparedAudioPlayer(context) { state -> /* onPreparedAudioState */ }
audio.setForeground(resumed) // main looper; initially false
audio.play("astana-audio/<64 lowercase hex>.mp3", "<same SHA-256>")
audio.pause()
audio.stop()
audio.getState()
audio.setForeground(false) // every background/destroy transition
audio.release() // module/app owner destroyed; idempotent
```

All calls and callbacks use the main looper. Play returns the current state
(usually `loading`); preparation/completion/failure use the callback. Root binds
`preparedAudioPlay`, `preparedAudioPause`, `preparedAudioStop`,
`preparedAudioGetState`, and `onPreparedAudioState` on `AstanaActiveWalk`.

State has exactly `status`, `assetId`, `positionMs`, `durationMs`, `errorCode`,
`generation`. `assetId` is `audio-<SHA>`, matching the canonical manifest.
Generation increases on emitted transitions; an independent internal token and
MediaPlayer identity discard obsolete hash/prepare/error/completion/focus work.
GetState refreshes actual position while prepared without advancing generation.
Completion reports stopped with the completed asset and final position; explicit
Stop clears the asset and position. Errors contain stable codes, no file/URI or
platform exception details.

The strict path grammar has no URI, absolute path, traversal, file selector or
network input. A single worker streams actual APK bytes through SHA-256 in 64 KiB
chunks, capped at 100 MB, before opening a MediaPlayer APK asset descriptor.
Filename, expected hash, bytes and descriptor length must agree. Empty/missing/
corrupt/compressed-or-unopenable assets fail visibly. Root must bundle the MP3s
without compression (`androidResources.noCompress += ['mp3']`). No system TTS
or other audio fallback exists.

Speech uses AudioAttributes USAGE_MEDIA/CONTENT_TYPE_SPEECH and requests focus
before starting. Temporary loss, including a duck request, pauses speech rather
than making words inaudible; permanent loss stops. Focus gain never auto-resumes.
Explicit Play on the same paused prepared asset resumes from its current position;
Play after a cancelled loading operation checks the asset again. Pause while
loading invalidates pending autoplay. The noisy broadcast and screen-off stop
playback. Background also stops, and no foreground return starts audio. Start is
additionally refused if the screen is noninteractive or the keyguard is locked.
Release cancels work, releases MediaPlayer/focus/receiver and shuts down the worker.

This is foreground-only narration. It does not implement a media service,
lockscreen controls or background/locked-screen playback.

## TypeScript Interface

```typescript
import { preparedAudio } from './modules/astana-active-walk/src/preparedAudio';
const subscription = preparedAudio.addListener(state => { /* render */ });
await preparedAudio.play(assetPath, expectedSha256);
await preparedAudio.pause();
await preparedAudio.stop();
await preparedAudio.getState();
subscription.remove();
```

`preparedAudio` and `nativePreparedAudio` name the same object. The wrapper checks
path/hash and native state, discards events older than an already observed
generation and exposes no speech/network fallback. It is separate from existing
`src/index.ts`; Root imports it explicitly.

## Verification receipts and limits

Test-first: the path/hash test failed before the TS wrapper existed; JVM verifier
checks failed before the Kotlin file existed. Current checks:

- Node bridge tests: **3 PASS, 0 skipped**, 435.8681 ms. The native bridge is an
  explicit fake SDK seam; these are not MediaPlayer device checks.
- Entire Kotlin player compiled against installed Android 37 stubs, Kotlin
  2.2.10 and JDK 17, using existing cached tools only. Pure JVM verifier:
  **11 checks PASS** (known SHA-256 `abc` vector, path/URI/uppercase/traversal,
  filename/hash mismatch, corrupt/empty/oversize/cancelled stream).
- Local primary API signatures inspected in
  `work/android-toolchain/sdk/platforms/android-37.0/android-stubs-src.jar`:
  MediaPlayer FD offset/length and prepare/callback APIs, AudioFocusRequest
  listener/duck handling, and AudioManager focus constants. Stub compilation
  verifies API availability/types; it does not verify Android behavior.

From repository root:

```powershell
node --test apps/mobile/modules/astana-active-walk/src/preparedAudio.test.cjs
& apps/mobile/modules/astana-active-walk/scripts/test-prepared-audio.ps1 `
  -JdkRoot ../../work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2 `
  -GradleCache ../../work/android-toolchain/gradle-cache `
  -AndroidJar ../../work/android-toolchain/sdk/platforms/android-37.0/android.jar
```

Root still must verify actual APK byte hashes and MediaPlayer playback on Android:
all languages, pause/resume/stop/completion, rapid track switching, corrupt asset,
focus loss/call, headset disconnect, screen off, background/foreground and module
recreation. No such device acceptance is claimed by these source tests. Human
pronunciation/listening and the complete offline map gate remain open.

No device, remote laptop, network/provider, purchase, key, account or system
setting was accessed by this task.
