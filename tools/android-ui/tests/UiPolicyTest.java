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
  private static UiPolicy.DiscoveryScreenEvidence discovery(String... labels) {
    UiPolicy.DiscoveryScreenEvidence evidence = new UiPolicy.DiscoveryScreenEvidence();
    for (String label : labels) evidence.observe(label);
    return evidence;
  }
  public static void main(String[] args) {
    expect(UiPolicy.plan("policy", "").isEmpty());
    expect(UiPolicy.plan("windows", "").isEmpty());
    expect(UiPolicy.plan("sequence", "canonical_entry,choose_walk,pause_audio").size() == 3);
    expect(UiPolicy.plan("sequence", "scroll_top").get(0).equals("scroll_top"));
    expect(UiPolicy.plan("sequence", "background_audio_20s").equals(Collections.singletonList("background_audio_20s")));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "home"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "GLOBAL_ACTION_HOME"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "background_audio_10s"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "background_audio_20s:2"));
    expect(!UiPolicy.matches("background_audio_20s", "Ⅱ Приостановить звук"));
    expect(UiPolicy.backgroundAudioWaitMillis("background_audio_20s", true) == 20_000L);
    rejects("AUDIO_PLAYBACK_NOT_VISIBLE", () -> UiPolicy.backgroundAudioWaitMillis("background_audio_20s", false));
    rejects("INVALID_BACKGROUND_AUDIO_ACTION", () -> UiPolicy.backgroundAudioWaitMillis("GLOBAL_ACTION_HOME", true));
    rejects("INVALID_BACKGROUND_AUDIO_ACTION", () -> UiPolicy.backgroundAudioWaitMillis("background_audio_10s", true));
    rejects("INVALID_BACKGROUND_AUDIO_ACTION", () -> UiPolicy.backgroundAudioWaitMillis(null, true));
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
    expect(UiPolicy.plan("sequence", "read_story,confirm_end,inspect").size() == 3);
    expect(UiPolicy.matches("confirm_end", "Я у старта · завершить"));
    // Golden visible labels from CanonicalPresentation, not an arbitrary confirmation matcher.
    for (String label : Arrays.asList("Бастауға жеттім · аяқтау", "At the start · finish",
        "Завершить у последней остановки", "Соңғы аялдамада аяқтау", "Finish at the last stop",
        "Я у финиша · завершить", "Мәреге жеттім · аяқтау", "At the finish · complete")) {
      expect(UiPolicy.matches("confirm_end", label));
    }
    expect(UiPolicy.matches("confirm_end", "\u00a0Я у старта\u202f· завершить\n"));
    expect(!UiPolicy.matches("confirm_end", "Подтверждаю Я у старта · завершить"));
    expect(!UiPolicy.matches("confirm_end", "Я у старта · завершить чужую прогулку"));
    expect(!UiPolicy.matches("confirm_end", "\u200bЯ у старта · завершить"));
    expect(!UiPolicy.matches("confirm_end", "At the start · Finish"));
    expect(!UiPolicy.matches("confirm_end", "Я вернулся к старту · ручное подтверждение"));
    expect(!UiPolicy.matches("confirm_end", "GPS confirmed arrival"));
    expect(!UiPolicy.matches("confirm_end", null));
    expect(!UiPolicy.matches("confirm_end", ""));
    expect(!UiPolicy.matches("confirm_return", "Я у старта · завершить"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "confirm_return"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "confirm_end:At the start · finish"));
    expect(UiPolicy.plan("sequence", "walk_again,inspect").size() == 2);
    expect(UiPolicy.matches("walk_again", "Пройти ещё раз"));
    expect(UiPolicy.matches("walk_again", "Тағы бір рет өту"));
    expect(UiPolicy.matches("walk_again", "Walk again"));
    expect(UiPolicy.matches("walk_again", "\u00a0Пройти\u202fещё раз\n"));
    expect(!UiPolicy.matches("walk_again", "Подтверждаю Пройти ещё раз"));
    expect(!UiPolicy.matches("walk_again", "Пройти ещё раз чужую прогулку"));
    expect(!UiPolicy.matches("walk_again", "\u200bПройти ещё раз"));
    expect(!UiPolicy.matches("walk_again", "Walk Again"));
    expect(!UiPolicy.matches("walk_again", "Перезапустить приложение"));
    expect(!UiPolicy.matches("walk_again", "Start again"));
    expect(!UiPolicy.matches("walk_again", null));
    expect(!UiPolicy.matches("walk_again", ""));
    expect(!UiPolicy.matches("restart", "Пройти ещё раз"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "restart"));
    rejects("INVALID_ACTION", () -> UiPolicy.plan("sequence", "walk_again:Walk again"));
    expect(UiPolicy.plan("sequence", "resume_walk_footer").size() == 1);
    expect(UiPolicy.matches("resume_walk_footer", "Продолжить"));
    expect(UiPolicy.matches("resume_walk_footer", "Жалғастыру"));
    expect(UiPolicy.matches("resume_walk_footer", "Continue"));
    expect(!UiPolicy.matches("resume_walk_footer", "Продолжить чужую прогулку"));
    int[] ownWindow = { 0, 0, 1080, 2400 };
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 1920, 500, 2020 })) == 0);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 1919, 500, 2020 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 1930, 500, 2401 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { -1, 1930, 500, 2020 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 1930, 1081, 2020 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 2000, 40, 2020 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 2100, 500, 2000 })) == -1);
    expect(UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 1200, 500, 1300 }, new int[] { 40, 2100, 500, 2200 })) == 1);
    expect(UiPolicy.footerTargetIndex(new int[] { 100, 200, 1100, 2200 }, Arrays.asList(new int[] { 120, 1800, 500, 1900 })) == 0);
    expect(UiPolicy.footerTargetIndex(null, Arrays.asList(new int[] { 40, 2100, 500, 2200 })) == -1);
    rejects("AMBIGUOUS_ACTION_RESUME_WALK_FOOTER", () -> UiPolicy.footerTargetIndex(ownWindow, Arrays.asList(new int[] { 40, 2100, 500, 2200 }, new int[] { 600, 2100, 1000, 2200 })));
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
    // Composite public discovery signatures, not a title or generic heading alone.
    expect(discovery("Открой Астану", "Музей Сакена Сейфуллина").isSafe());
    expect(discovery("Бәйтерек", "Неліктен көруге тұрарлық", "⌖ Картадан көру").isSafe());
    expect(discovery("Discover Astana", "Gorky Drama Theatre").isSafe());
    expect(discovery("Yesil waterfront", "Why see it", "⌖ Show on the map").isSafe());
    expect(!discovery("Байтерек", "Мой журнал", "ЛОКАЛЬНАЯ КОЛЛЕКЦИЯ").isSafe());
    expect(!discovery("Почему стоит увидеть", "Посмотреть на карте").isSafe());
    expect(!discovery("Открой Астану", "Непроверенное место").isSafe());
    expect(!discovery("Байтерек", "Почему стоит увидеть").isSafe());
    expect(!discovery("Discover Astana", "Baiterek", "latitude: 51.123456").isSafe());
    UiPolicy.DiscoveryScreenEvidence input = discovery("Discover Astana", "Baiterek"); input.inputVisible(); expect(!input.isSafe());
    expect(!UiPolicy.safeCaptureLabel("Почему стоит увидеть"));
    expect(!UiPolicy.safeCaptureLabel("Карта интересных мест Астаны"));
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
