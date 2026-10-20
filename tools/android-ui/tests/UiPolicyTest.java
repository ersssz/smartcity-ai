package kz.astanaai.diagnostics.test;

import java.util.Arrays;
import java.util.Collections;

/** Tests the approved command/screen policy Interface; no Android/device simulation. */
public final class UiPolicyTest {
  private static int checks;
  private static void expect(boolean value) { if (!value) throw new AssertionError(); checks++; }
  private static void rejects(String code, Runnable call) {
    try { call.run(); throw new AssertionError("Expected " + code); }
    catch (UiPolicy.Refusal failure) { expect(failure.code.equals(code)); }
  }
  public static void main(String[] args) {
    expect(UiPolicy.plan("policy", "").isEmpty());
    expect(UiPolicy.plan("windows", "").isEmpty());
    expect(UiPolicy.plan("sequence", "canonical_entry,choose_walk,pause_audio").size() == 3);
    expect(UiPolicy.plan("sequence", "scroll_top").get(0).equals("scroll_top"));
    expect(UiPolicy.plan("sequence", "discovery_history,discovery_weather,weather_sun,weather_rain,weather_cold,weather_windy,place_saken,discovery_back,place_bayterek,place_detail,guided_walk,read_story").size() == 12);
    expect(UiPolicy.matches("discovery_history", "История"));
    expect(UiPolicy.matches("discovery_weather", "Погода и события: Погода пока неизвестна"));
    expect(!UiPolicy.matches("discovery_weather", "Другие Погода и события: Солнце"));
    expect(UiPolicy.matches("place_saken", "Музей Сакена Сейфуллина. Короткий осмотр снаружи."));
    expect(!UiPolicy.matches("place_saken", "Музей Сакена Сейфуллина другого города"));
    expect(UiPolicy.matches("place_detail", "Подробнее: Байтерек"));
    expect(!UiPolicy.matches("place_detail", "Подробнее: com.android.settings"));
    expect(UiPolicy.matches("guided_walk", "Прогулка с историями · 80 мин"));
    expect(UiPolicy.matches("read_story", "Историю прочитал · дальше →"));
    expect(!UiPolicy.matches("discovery_weather", "Погода и события: " + "x".repeat(250)));
    expect(UiPolicy.awaitOwnLaunch("com.miui.home", 1, false, false));
    expect(UiPolicy.awaitOwnLaunch("com.android.systemui", 3, false, false));
    expect(!UiPolicy.awaitOwnLaunch("com.miui.home", 1, true, false));
    expect(!UiPolicy.awaitOwnLaunch("com.miui.home", 1, false, true));
    expect(!UiPolicy.awaitOwnLaunch("com.android.systemui", 3, true, false));
    expect(!UiPolicy.awaitOwnLaunch("com.android.systemui", 2, false, false));
    expect(!UiPolicy.awaitOwnLaunch("com.android.permissioncontroller", 1, false, false));
    expect(!UiPolicy.awaitOwnLaunch("another.foreign.app", 1, false, false));
    expect(UiPolicy.startupRootClass(UiPolicy.TARGET).equals("OWN"));
    expect(UiPolicy.startupRootClass("com.miui.home").equals("KNOWN_LAUNCHER"));
    expect(UiPolicy.startupRootClass("com.android.systemui").equals("SYSTEMUI"));
    expect(UiPolicy.startupRootClass("com.android.permissioncontroller").equals("UNKNOWN"));
    expect(UiPolicy.startupRootClass("private.unrelated.package").equals("UNKNOWN"));
    expect(UiPolicy.startupRootClass(null).equals("UNKNOWN"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "android.settings.SETTINGS"));
    rejects("INVALID_SCENARIO", () -> UiPolicy.plan("shell", ""));
    rejects("TOO_MANY_ACTIONS", () -> UiPolicy.plan("sequence", String.join(",", Collections.nCopies(31, "inspect"))));
    expect(UiPolicy.matches("choose_walk", "  Выбрать эту прогулку  →\n"));
    expect(UiPolicy.matches("choose_walk", "\u00a0Выбрать\u202fэту\u2003прогулку\t→\u0085"));
    expect(!UiPolicy.matches("choose_walk", "\u200bВыбрать эту прогулку →"));
    expect(!UiPolicy.matches("choose_walk", "Не выбирать эту прогулку →"));
    expect(!UiPolicy.matches("pause_audio", "Остановить звук"));
    UiPolicy.authorize(false, UiPolicy.TARGET, Arrays.asList(UiPolicy.TARGET)); checks++;
    rejects("KEYGUARD_LOCKED", () -> UiPolicy.authorize(true, UiPolicy.TARGET, Arrays.asList(UiPolicy.TARGET)));
    rejects("FOREIGN_FOREGROUND", () -> UiPolicy.authorize(false, "com.android.settings", Arrays.asList("com.android.settings")));
    rejects("FOREIGN_WINDOW", () -> UiPolicy.authorize(false, UiPolicy.TARGET, Arrays.asList("com.android.permissioncontroller")));
    expect(UiPolicy.sensitive("latitude: 51.123456 longitude: 71.987654"));
    expect(UiPolicy.sensitive("51,123456"));
    expect(!UiPolicy.sensitive("80 мин · 3 остановки"));
    expect(UiPolicy.redact("GPS 51.123456").equals("[LOCATION_REDACTED]"));
    expect(UiPolicy.redact("x".repeat(300)).length() <= 160);
    expect(UiPolicy.safeCaptureLabel("Карта выбранной прогулки"));
    expect(!UiPolicy.safeCaptureLabel("Техническая проверка"));
    expect(UiPolicy.openingLabel("Welcome to Astana!"));
    expect(!UiPolicy.passiveSystemBar("NotificationShade"));
    expect(UiPolicy.passiveSystemBar("StatusBar"));
    int[] display = { 0, 0, 1080, 2400 }, top = { 0, 0, 1080, 94 }, bottom = { 0, 2270, 1080, 2400 };
    expect(UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "", top, display));
    expect(UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "Панель навигации", bottom, display));
    expect(!UiPolicy.passiveSystemBar(3, true, false, "com.android.systemui", "", top, display));
    expect(!UiPolicy.passiveSystemBar(3, false, true, "com.android.systemui", "", top, display));
    expect(!UiPolicy.passiveSystemBar(2, false, false, "com.android.systemui", "", top, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.permissioncontroller", "StatusBar", top, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "NotificationShade", top, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "", new int[] { 0, 0, 1080, 2200 }, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "", new int[] { 0, 1000, 1080, 1100 }, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "", new int[] { 500, 0, 1080, 94 }, display));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "com.android.systemui", "", top, new int[] { 0, 100, 1080, 2400 }));
    expect(!UiPolicy.passiveSystemBar(3, false, false, "", "", top, display));
    expect(AndroidPolicyProbe.failureChain(new ExceptionInInitializerError(new IllegalArgumentException("PRIVATE-SYNTHETIC-UI-VALUE"))).equals("ExceptionInInitializerError>IllegalArgumentException"));
    expect(AndroidPolicyProbe.unicodePatternFlag().equals("PATTERN_FLAG_0X100_SUPPORTED"));
    System.out.println("UiPolicy Interface: " + checks + " checks PASS; no Android execution");
  }
}
