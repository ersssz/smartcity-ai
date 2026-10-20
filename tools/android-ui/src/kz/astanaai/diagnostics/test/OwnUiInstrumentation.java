package kz.astanaai.diagnostics.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.KeyguardManager;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Process;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Public Android test APIs only. No input injection, global actions, grants or hidden hooks. */
public final class OwnUiInstrumentation extends Instrumentation {
  private static final int MAX_NODES = 2400, MAX_DEPTH = 60, MAX_LABELS = 60;
  private static final long TOTAL_LIMIT_MS = 180_000, STEP_LIMIT_MS = 20_000;
  private Bundle arguments;
  private UiAutomation automation;
  private File folder;
  private long deadline;
  private long startedAt;
  private int step;
  private int admissionPolls;
  private String startupRootClass = "UNKNOWN";
  private String phase = "BOOT";
  private final JSONArray results = new JSONArray();

  @Override public void onCreate(Bundle input) {
    arguments = input == null ? new Bundle() : new Bundle(input);
    start();
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    final long started = SystemClock.elapsedRealtime();
    startedAt = started;
    final JSONObject timing = new JSONObject();
    try {
      phase = "POLICY_PROBE";
      String patternProbe = AndroidPolicyProbe.unicodePatternFlag();
      Bundle probeStatus = new Bundle(); probeStatus.putString("pattern_probe", patternProbe); sendStatus(0, probeStatus);
      phase = "POLICY_INITIALIZATION";
      String scenario = arguments.getString("scenario", "inspect");
      List<String> actions = UiPolicy.plan(scenario, arguments.getString("actions", ""));
      for (String key : arguments.keySet()) if (!key.equals("scenario") && !key.equals("actions")) throw new UiPolicy.Refusal("UNSUPPORTED_ARGUMENT", false);
      if (scenario.equals("policy")) {
        if (!UiPolicy.matches("choose_walk", "\u00a0Выбрать\u202fэту\u2003прогулку\t→\u0085") || UiPolicy.matches("choose_walk", "\u200bВыбрать эту прогулку →")) throw new UiPolicy.Refusal("UNICODE_EXACT_MATCH_FAILED", false);
        result.putString("status", "POLICY_COMPATIBILITY_PASS"); result.putString("pattern_probe", patternProbe);
        result.putString("scope", "Fixed synthetic string policy checks only; no UI/permissions/settings read or changed");
        finish(Activity.RESULT_OK, result); return;
      }
      deadline = SystemClock.elapsedRealtime() + TOTAL_LIMIT_MS;
      checkpoint("UNLOCK_CHECK_ENTER");
      assertUnlocked();
      checkpoint("UNLOCK_CHECK_EXIT");
      // Do not suppress an already running screen reader/accessibility service.
      checkpoint("AUTOMATION_CONNECT_ENTER");
      automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      checkpoint("AUTOMATION_CONNECT_EXIT");
      timing.put("automation_connected_ms", SystemClock.elapsedRealtime() - started);
      if (automation == null) throw new UiPolicy.Refusal("STANDARD_INSTRUMENTATION_UNAVAILABLE", true);
      checkpoint("AUTOMATION_INFO_ENTER");
      AccessibilityServiceInfo info = automation.getServiceInfo();
      checkpoint("AUTOMATION_INFO_EXIT");
      if (info == null) throw new UiPolicy.Refusal("WINDOW_STATUS_UNAVAILABLE", true);
      info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      checkpoint("AUTOMATION_CONFIGURE_ENTER");
      automation.setServiceInfo(info);
      checkpoint("AUTOMATION_CONFIGURE_EXIT");
      if (scenario.equals("windows")) {
        phase = "OWN_WINDOW_METADATA";
        // Reproduce the same own-Activity launch, but never click or inspect labels/screens.
        startOwnActivity();
        timing.put("activity_launched_ms", SystemClock.elapsedRealtime() - started);
        SystemClock.sleep(200);
        timing.put("idle_wait_finished_ms", SystemClock.elapsedRealtime() - started);
        checkpoint("WINDOW_METADATA_ENTER");
        result.putString("windows_json", windowMetadata().toString());
        checkpoint("WINDOW_METADATA_EXIT");
        timing.put("metadata_finished_ms", SystemClock.elapsedRealtime() - started);
        try { AccessibilityNodeInfo root = ownRoot(); root.recycle(); result.putString("unchanged_guard", "ADMITTED"); }
        catch (UiPolicy.Refusal refusal) { result.putString("unchanged_guard", refusal.code); }
        timing.put("guard_finished_ms", SystemClock.elapsedRealtime() - started);
        result.putString("elapsed_json", timing.toString());
        result.putString("status", "WINDOW_METADATA_RECORDED");
        result.putString("scope", "Window type/focus/pixel bounds only; own/SystemUI package+title, other identities redacted; no labels/screens/actions/settings");
        finish(Activity.RESULT_OK, result); return;
      }
      checkpoint("OWN_TEST_STORAGE_ENTER");
      // Instrumentation executes under the target UID: write only a new own-app evidence folder.
      File base = getTargetContext().getExternalFilesDir("android-ui-tests");
      if (base == null) throw new UiPolicy.Refusal("TEST_STORAGE_UNAVAILABLE", false);
      folder = new File(base, "run-" + System.currentTimeMillis() + "-" + Process.myPid());
      if (!folder.mkdir()) throw new UiPolicy.Refusal("TEST_STORAGE_UNAVAILABLE", false);
      checkpoint("OWN_TEST_STORAGE_EXIT");
      // am instrument may restart the target process: every run establishes its own UI first.
      launchOwn();
      checkpoint("OWN_OPENING_WAIT_ENTER"); waitOpening(); checkpoint("OWN_OPENING_WAIT_EXIT");
      checkpoint("OWN_LAUNCH_RECORD_ENTER"); record("launch", false); checkpoint("OWN_LAUNCH_RECORD_EXIT");
      phase = "OWN_UI_ACTIONS";
      if (scenario.equals("inspect")) record("inspect", false);
      if (scenario.equals("capture")) record("capture", true);
      if (scenario.equals("smoke")) {
        if (hasVisibleAction("city_exit")) { click("city_exit"); record("city_exit", false); }
        if (!waitEntryOrPreview()) throw new UiPolicy.Refusal("CANONICAL_ENTRY_OR_PREVIEW_NOT_FOUND", false);
        if (!hasVisibleAction("choose_walk")) { click("canonical_entry"); record("canonical_entry", false); }
        if (!waitVisibleAction("choose_walk", STEP_LIMIT_MS)) throw new UiPolicy.Refusal("PREVIEW_NOT_FOUND", false);
        record("canonical_preview", true);
      }
      for (String action : actions) {
        checkDeadline();
        switch (action) {
          case "inspect": case "capture": break;
          case "scroll_forward": scroll(true); break;
          case "scroll_backward": scroll(false); break;
          case "scroll_top": scrollTop(); break;
          case "wait_short": guardedWait(400); break;
          case "wait_audio": guardedWait(4000); break;
          default: click(action); break;
        }
        record(action, action.equals("capture"));
      }
      result.putString("status", "EXECUTED");
      result.putString("evidence_dir", folder.getAbsolutePath());
      result.putString("steps", Integer.toString(step));
      result.putString("scope", "Own UI actions only; playback/business/field assertions require independent evidence");
      finish(Activity.RESULT_OK, result);
    } catch (UiPolicy.Refusal refusal) {
      result.putString("status", refusal.userAction ? "USER_ACTION_REQUIRED" : "SCENARIO_FAILED");
      result.putString("reason", refusal.code);
      result.putString("phase", phase);
      result.putString("completed_steps", Integer.toString(step));
      result.putLong("elapsed_ms", SystemClock.elapsedRealtime() - startedAt);
      result.putInt("admission_polls", admissionPolls);
      result.putString("startup_root", startupRootClass);
      if (folder != null) result.putString("evidence_dir", folder.getAbsolutePath());
      finish(Activity.RESULT_CANCELED, result);
    } catch (SecurityException denied) {
      result.putString("status", "USER_ACTION_REQUIRED"); result.putString("reason", "STANDARD_INSTRUMENTATION_DENIED");
      result.putString("phase", phase);
      finish(Activity.RESULT_CANCELED, result);
    } catch (Throwable failure) {
      // Exception messages/stacks could contain UI payloads. Emit a fixed code only.
      result.putString("status", "SCENARIO_FAILED"); result.putString("reason", "ANDROID_TEST_OPERATION_FAILED");
      result.putString("failure_class", failure.getClass().getSimpleName());
      result.putString("failure_chain", AndroidPolicyProbe.failureChain(failure)); result.putString("phase", phase);
      finish(Activity.RESULT_CANCELED, result);
    }
  }

  private void assertUnlocked() {
    KeyguardManager keyguard = (KeyguardManager) getTargetContext().getSystemService(Context.KEYGUARD_SERVICE);
    if (keyguard == null || keyguard.isKeyguardLocked() || keyguard.isDeviceLocked()) throw new UiPolicy.Refusal("KEYGUARD_LOCKED", true);
    PowerManager power = (PowerManager) getTargetContext().getSystemService(Context.POWER_SERVICE);
    if (power == null || !power.isInteractive()) throw new UiPolicy.Refusal("SCREEN_OFF", true);
  }
  private void checkDeadline() {
    if (SystemClock.elapsedRealtime() > deadline) throw new UiPolicy.Refusal("SCENARIO_TIME_LIMIT", false);
  }
  private void checkpoint(String fixedPhase) {
    phase = fixedPhase;
    Bundle update = new Bundle(); update.putString("phase", fixedPhase);
    update.putLong("elapsed_ms", SystemClock.elapsedRealtime() - startedAt);
    sendStatus(0, update);
  }
  private AccessibilityNodeInfo ownRoot() {
    checkDeadline(); assertUnlocked();
    AccessibilityNodeInfo root = automation.getRootInActiveWindow();
    String active = root == null || root.getPackageName() == null ? null : root.getPackageName().toString();
    Rect appBounds = new Rect();
    AccessibilityWindowInfo appWindow = root == null ? null : root.getWindow();
    try {
      if (appWindow == null || appWindow.getType() != AccessibilityWindowInfo.TYPE_APPLICATION || !appWindow.isActive() || !appWindow.isFocused()) {
        if (root != null) root.recycle(); throw new UiPolicy.Refusal("OWN_WINDOW_GEOMETRY_UNAVAILABLE", true);
      }
      appWindow.getBoundsInScreen(appBounds);
    } finally { if (appWindow != null) appWindow.recycle(); }
    List<String> focused = new ArrayList<>();
    List<AccessibilityWindowInfo> windows = automation.getWindows();
    if (windows != null) for (AccessibilityWindowInfo window : windows) {
      try {
        AccessibilityNodeInfo other = window.getRoot();
        try {
          String pkg = other == null || other.getPackageName() == null ? "" : other.getPackageName().toString();
          Rect bounds = new Rect(); window.getBoundsInScreen(bounds);
          boolean passiveBar = UiPolicy.passiveSystemBar(window.getType(), window.isActive(), window.isFocused(), pkg,
            window.getTitle() == null ? "" : window.getTitle().toString(), new int[] { bounds.left, bounds.top, bounds.right, bounds.bottom }, new int[] { appBounds.left, appBounds.top, appBounds.right, appBounds.bottom });
          if (!passiveBar) focused.add(pkg);
        } finally { if (other != null) other.recycle(); }
      } finally { window.recycle(); }
    }
    try { UiPolicy.authorize(false, active, focused); }
    catch (RuntimeException failure) { if (root != null) root.recycle(); throw failure; }
    return root;
  }
  private void launchOwn() {
    assertUnlocked();
    startOwnActivity();
    checkpoint("OWN_ACTIVITY_ADMISSION_ENTER");
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + STEP_LIMIT_MS);
    checkpoint("OWN_ACTIVITY_SETTLE_ENTER");
    long settleUntil = Math.min(until, SystemClock.elapsedRealtime() + 2500);
    while (SystemClock.elapsedRealtime() < settleUntil) {
      assertUnlocked(); checkDeadline();
      SystemClock.sleep(Math.min(100, Math.max(1, settleUntil - SystemClock.elapsedRealtime())));
    }
    assertUnlocked(); checkDeadline(); checkpoint("OWN_ACTIVITY_SETTLE_EXIT");
    phase = "OWN_ACTIVITY_ADMISSION_WAIT";
    while (SystemClock.elapsedRealtime() < until) {
      checkDeadline(); assertUnlocked();
      admissionPolls++;
      AccessibilityNodeInfo active = automation.getRootInActiveWindow();
      if (active != null) {
        String pkg; boolean awaitTransition = false;
        try {
          pkg = active.getPackageName() == null ? "" : active.getPackageName().toString();
          startupRootClass = UiPolicy.startupRootClass(pkg);
          if (!UiPolicy.TARGET.equals(pkg)) {
            AccessibilityWindowInfo window = active.getWindow();
            try { awaitTransition = window != null && UiPolicy.awaitOwnLaunch(pkg, window.getType(), window.isActive(), window.isFocused()); }
            finally { if (window != null) window.recycle(); }
          }
        }
        finally { active.recycle(); }
        if (admissionPolls == 1) {
          Bundle rootStatus = new Bundle(); rootStatus.putString("startup_root", startupRootClass);
          rootStatus.putLong("elapsed_ms", SystemClock.elapsedRealtime() - startedAt); sendStatus(0, rootStatus);
        }
        if (UiPolicy.TARGET.equals(pkg)) {
          AccessibilityNodeInfo root = ownRoot(); root.recycle();
          checkpoint("OWN_ACTIVITY_ADMISSION_EXIT"); return;
        }
        if (!awaitTransition) throw new UiPolicy.Refusal("FOREIGN_FOREGROUND", true);
      }
      if (admissionPolls == 1 || admissionPolls == 5 || admissionPolls == 20 || admissionPolls == 50 || admissionPolls == 100) {
        Bundle update = new Bundle(); update.putString("phase", "OWN_ACTIVITY_ADMISSION_WAIT");
        update.putLong("elapsed_ms", SystemClock.elapsedRealtime() - startedAt); update.putInt("admission_polls", admissionPolls); sendStatus(0, update);
      }
      SystemClock.sleep(100);
    }
    throw new UiPolicy.Refusal("OWN_ACTIVITY_NOT_READY", true);
  }
  private void startOwnActivity() {
    checkDeadline(); assertUnlocked();
    checkpoint("OWN_ACTIVITY_START_ENTER");
    // Explicit own component only; startActivitySync has an unbounded main-looper idle wait.
    getTargetContext().startActivity(ownIntent());
    checkpoint("OWN_ACTIVITY_START_EXIT");
  }
  private Intent ownIntent() {
    return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      .setComponent(new ComponentName(UiPolicy.TARGET, UiPolicy.ACTIVITY)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  }
  private JSONObject windowMetadata() throws org.json.JSONException {
    assertUnlocked();
    JSONObject result = new JSONObject(); JSONArray entries = new JSONArray();
    AccessibilityNodeInfo active = automation.getRootInActiveWindow();
    try {
      String pkg = active == null || active.getPackageName() == null ? "" : active.getPackageName().toString();
      result.put("activePackage", safeWindowPackage(pkg));
    } finally { if (active != null) active.recycle(); }
    List<AccessibilityWindowInfo> windows = automation.getWindows();
    result.put("windowCount", windows == null ? 0 : windows.size());
    result.put("truncated", windows != null && windows.size() > 32);
    if (windows != null) for (AccessibilityWindowInfo window : windows) {
      try {
        if (entries.length() >= 32) continue;
        JSONObject entry = new JSONObject(); Rect rect = new Rect(); window.getBoundsInScreen(rect);
        entry.put("type", window.getType()); entry.put("active", window.isActive()); entry.put("focused", window.isFocused());
        entry.put("bounds", new JSONArray(new int[] { rect.left, rect.top, rect.right, rect.bottom }));
        AccessibilityNodeInfo root = window.getRoot();
        try {
          String pkg = root == null || root.getPackageName() == null ? "" : root.getPackageName().toString();
          String safe = safeWindowPackage(pkg);
          entry.put("rootAvailable", root != null); entry.put("package", safe);
          entry.put("title", safe.equals("OTHER") ? "OTHER" : UiPolicy.redact(window.getTitle() == null ? "" : window.getTitle().toString()));
        } finally { if (root != null) root.recycle(); }
        entries.put(entry);
      } finally { window.recycle(); }
    }
    result.put("windows", entries); return result;
  }
  private String safeWindowPackage(String pkg) {
    return UiPolicy.TARGET.equals(pkg) || "com.android.systemui".equals(pkg) ? pkg : "OTHER";
  }
  private void waitOpening() {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + STEP_LIMIT_MS);
    while (SystemClock.elapsedRealtime() < until) {
      Scan state;
      try { state = scan(null); } catch (org.json.JSONException invalid) { throw new UiPolicy.Refusal("UI_TREE_ENCODING_FAILED", false); }
      boolean opening;
      try { opening = state.opening; } finally { state.close(); }
      if (!opening && (hasVisibleAction("discovery_history") || hasVisibleAction("city_exit") || hasVisibleAction("canonical_entry") || hasVisibleAction("expand_card") || hasVisibleAction("choose_walk"))) return;
      guardedWait(250);
    }
    throw new UiPolicy.Refusal("APP_OPENING_TIMEOUT_OR_MANUAL_CONTINUE_REQUIRED", true);
  }
  private void guardedWait(long milliseconds) {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + milliseconds);
    do {
      AccessibilityNodeInfo root = ownRoot(); root.recycle();
      SystemClock.sleep(Math.min(100, Math.max(1, until - SystemClock.elapsedRealtime())));
    } while (SystemClock.elapsedRealtime() < until);
  }

  private static final class Scan {
    int nodes; boolean sensitive; boolean safe; boolean opening;
    final UiPolicy.DiscoveryScreenEvidence discovery = new UiPolicy.DiscoveryScreenEvidence();
    final JSONArray labels = new JSONArray();
    final List<AccessibilityNodeInfo> targets = new ArrayList<>();
    final List<AccessibilityNodeInfo> scrolls = new ArrayList<>();
    void close() { for (AccessibilityNodeInfo node : targets) node.recycle(); for (AccessibilityNodeInfo node : scrolls) node.recycle(); }
  }
  private Scan scan(String action) throws org.json.JSONException {
    AccessibilityNodeInfo root = ownRoot(); Scan scan = new Scan();
    try { walk(root, action, scan, 0); scan.safe |= scan.discovery.isSafe(); return scan; }
    catch (RuntimeException | org.json.JSONException failure) { scan.close(); throw failure; }
    finally { root.recycle(); }
  }
  private void walk(AccessibilityNodeInfo node, String action, Scan scan, int depth) throws org.json.JSONException {
    if (++scan.nodes > MAX_NODES || depth > MAX_DEPTH) throw new UiPolicy.Refusal("UI_TREE_LIMIT", false);
    if (!UiPolicy.TARGET.contentEquals(node.getPackageName() == null ? "" : node.getPackageName())) return;
    if (node.isVisibleToUser()) {
      boolean input = node.isEditable() || node.isPassword();
      String text = input || node.getText() == null ? "" : node.getText().toString();
      String description = input || node.getContentDescription() == null ? "" : node.getContentDescription().toString();
      scan.sensitive |= UiPolicy.sensitive(text) || UiPolicy.sensitive(description);
      scan.safe |= UiPolicy.safeCaptureLabel(text) || UiPolicy.safeCaptureLabel(description);
      scan.discovery.observe(text); scan.discovery.observe(description);
      if (input) scan.discovery.inputVisible();
      scan.opening |= UiPolicy.openingLabel(text) || UiPolicy.openingLabel(description);
      if (scan.labels.length() < MAX_LABELS && (!text.isEmpty() || !description.isEmpty() || input)) {
        JSONObject label = new JSONObject();
        label.put("depth", depth); label.put("text", input ? "[INPUT_VALUE_OMITTED]" : UiPolicy.redact(text));
        label.put("description", UiPolicy.redact(description)); label.put("clickable", node.isClickable());
        label.put("enabled", node.isEnabled()); label.put("scrollable", node.isScrollable());
        scan.labels.put(label);
      }
      if (action != null && (UiPolicy.matches(action, text) || UiPolicy.matches(action, description))) {
        AccessibilityNodeInfo clickable = clickableAncestor(node);
        if (clickable != null) {
          boolean duplicate = false;
          for (AccessibilityNodeInfo existing : scan.targets) if (existing.equals(clickable)) duplicate = true;
          if (duplicate) clickable.recycle(); else scan.targets.add(clickable);
        }
      }
      String type = node.getClassName() == null ? "" : node.getClassName().toString();
      if (node.isScrollable() && node.isEnabled() && (type.equals("android.widget.ScrollView") || type.endsWith("ReactScrollView"))) scan.scrolls.add(AccessibilityNodeInfo.obtain(node));
    }
    int children = Math.min(node.getChildCount(), 300);
    for (int i = 0; i < children; i++) {
      AccessibilityNodeInfo child = node.getChild(i);
      if (child != null) try { walk(child, action, scan, depth + 1); } finally { child.recycle(); }
    }
    if (node.getChildCount() > 300) throw new UiPolicy.Refusal("UI_TREE_LIMIT", false);
  }
  private AccessibilityNodeInfo clickableAncestor(AccessibilityNodeInfo leaf) {
    AccessibilityNodeInfo node = AccessibilityNodeInfo.obtain(leaf);
    for (int depth = 0; depth < 6 && node != null; depth++) {
      if (!UiPolicy.TARGET.contentEquals(node.getPackageName() == null ? "" : node.getPackageName()) || !node.isVisibleToUser() || !node.isEnabled()) { node.recycle(); return null; }
      if (node.isClickable() && node.getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)) return node;
      AccessibilityNodeInfo parent = node.getParent(); node.recycle(); node = parent;
    }
    if (node != null) node.recycle(); return null;
  }
  private boolean hasVisibleAction(String action) {
    Scan scan;
    try { scan = scan(action); } catch (org.json.JSONException invalid) { throw new UiPolicy.Refusal("UI_TREE_ENCODING_FAILED", false); }
    try { return !scan.targets.isEmpty(); } finally { scan.close(); }
  }
  private boolean waitVisibleAction(String action, long wait) {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + wait);
    while (SystemClock.elapsedRealtime() < until) { if (hasVisibleAction(action)) return true; guardedWait(200); }
    return false;
  }
  private boolean waitEntryOrPreview() {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + STEP_LIMIT_MS);
    while (SystemClock.elapsedRealtime() < until) {
      if (hasVisibleAction("choose_walk") || hasVisibleAction("canonical_entry")) return true;
      guardedWait(200);
    }
    return false;
  }
  private void click(String action) throws org.json.JSONException {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + STEP_LIMIT_MS);
    int scrollCount = 0;
    while (SystemClock.elapsedRealtime() < until) {
      Scan scan = scan(action);
      try {
        if (scan.targets.size() > 1) throw new UiPolicy.Refusal("AMBIGUOUS_ACTION_" + action.toUpperCase(java.util.Locale.ROOT), false);
        if (scan.targets.size() == 1) {
          AccessibilityNodeInfo guard = ownRoot(); guard.recycle();
          AccessibilityNodeInfo target = scan.targets.get(0);
          if (target.refresh() && target.isVisibleToUser() && target.isEnabled()) {
            if (!target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new UiPolicy.Refusal("ACTION_CLICK_DECLINED", true);
            guardedWait(350); return;
          }
        } else if (scrollCount < 8 && scan.scrolls.size() == 1) {
          AccessibilityNodeInfo guard = ownRoot(); guard.recycle();
          if (scan.scrolls.get(0).performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) { scrollCount++; guardedWait(300); continue; }
          scrollCount = 8;
        }
      } finally { scan.close(); }
      guardedWait(200);
    }
    throw new UiPolicy.Refusal("ACTION_NOT_VISIBLE_" + action.toUpperCase(java.util.Locale.ROOT), false);
  }
  private void scroll(boolean forward) throws org.json.JSONException {
    Scan scan = scan(null);
    try {
      if (scan.scrolls.size() != 1) throw new UiPolicy.Refusal("OWN_SCROLL_NOT_UNIQUE", false);
      AccessibilityNodeInfo guard = ownRoot(); guard.recycle();
      if (!scan.scrolls.get(0).performAction(forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) throw new UiPolicy.Refusal("SCROLL_DECLINED_OR_BOUNDARY", false);
    } finally { scan.close(); }
    guardedWait(350);
  }
  private void scrollTop() throws org.json.JSONException {
    long until = Math.min(deadline, SystemClock.elapsedRealtime() + STEP_LIMIT_MS);
    for (int count = 0; count < 8 && SystemClock.elapsedRealtime() < until; count++) {
      Scan scan = scan(null);
      try {
        if (scan.scrolls.size() != 1) throw new UiPolicy.Refusal("OWN_SCROLL_NOT_UNIQUE", false);
        AccessibilityNodeInfo guard = ownRoot(); guard.recycle();
        AccessibilityNodeInfo target = scan.scrolls.get(0);
        if (!target.getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)
            || !target.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return;
      } finally { scan.close(); }
      guardedWait(300);
    }
    Scan scan = scan(null);
    try {
      if (scan.scrolls.size() == 1 && !scan.scrolls.get(0).getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)) return;
    } finally { scan.close(); }
    throw new UiPolicy.Refusal("SCROLL_TOP_BOUND_NOT_PROVEN", false);
  }

  private void record(String action, boolean requireCapture) throws Exception {
    Scan scan = scan(null);
    JSONObject record = new JSONObject();
    try {
      int index = ++step; String name = String.format(java.util.Locale.ROOT, "%02d-%s", index, action);
      record.put("step", index); record.put("action", action); record.put("package", UiPolicy.TARGET);
      record.put("visible_labels", scan.labels); record.put("visited_nodes", scan.nodes);
      record.put("screen_policy", scan.discovery.isSafe() ? "PUBLIC_DISCOVERY_COMPOSITE" : scan.safe ? "LEGACY_FIXED_LABEL" : "NOT_PROVEN");
      if (scan.safe && !scan.sensitive) {
        AccessibilityNodeInfo guard = ownRoot(); guard.recycle();
        Bitmap screenshot = automation.takeScreenshot();
        if (screenshot == null) throw new UiPolicy.Refusal("SCREENSHOT_DECLINED", true);
        try {
          // Validate again before persisting; discard a capture if a foreign window appeared.
          guard = ownRoot(); guard.recycle();
          File image = new File(folder, name + ".png");
          try (FileOutputStream stream = new FileOutputStream(image)) {
            if (!screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream)) throw new UiPolicy.Refusal("SCREENSHOT_WRITE_FAILED", false);
          }
          record.put("screenshot", image.getAbsolutePath());
        } finally { screenshot.recycle(); }
      } else {
        record.put("capture_skipped", scan.sensitive ? "LOCATION_LABEL_PRESENT" : "SAFE_SCREEN_NOT_PROVEN");
        if (requireCapture) throw new UiPolicy.Refusal(scan.sensitive ? "LOCATION_CAPTURE_REFUSED" : "SAFE_SCREEN_NOT_PROVEN", false);
      }
      write(new File(folder, name + ".json"), record.toString(2));
      results.put(record); write(new File(folder, "report.json"), results.toString(2));
      Bundle update = new Bundle(); update.putString("step", Integer.toString(index)); update.putString("action", action);
      update.putString("evidence", new File(folder, name + ".json").getAbsolutePath());
      update.putString("capture", record.optString("screenshot", record.optString("capture_skipped")));
      sendStatus(0, update);
    } finally { scan.close(); }
  }
  private static void write(File file, String data) throws Exception {
    try (FileOutputStream output = new FileOutputStream(file)) { output.write(data.getBytes(StandardCharsets.UTF_8)); }
  }
}
