package kz.astanaai.diagnostics.test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Fixed user-interface commands, not an arbitrary automation/IPC endpoint. */
public final class UiPolicy {
  public static final String TARGET = "kz.astanaai.diagnostics";
  public static final String ACTIVITY = TARGET + ".MainActivity";
  private static final Pattern LOCATION = Pattern.compile("(?i)(?:[-+]?\\d{1,3}[.,]\\d{4,}|latitude|longitude|широта|долгота|\\blat\\s*[:=]|\\blon(?:g)?\\s*[:=])");
  private static final Map<String, List<String>> LABELS;
  private static final List<String> INTERNAL = Collections.unmodifiableList(Arrays.asList("inspect", "capture", "scroll_forward", "scroll_backward", "scroll_top", "wait_short", "wait_audio", "background_audio_20s"));
  static {
    Map<String, List<String>> labels = new LinkedHashMap<>();
    add(labels, "city_exit", "К первой прогулке →", "Вернуться к прогулке →", "Алғашқы серуенге →", "Серуенге оралу →", "To your first walk →", "Return to your walk →");
    add(labels, "canonical_entry", "✦ Новая прогулка · со звуком →", "✦ Жаңа серуен · дыбыспен →", "✦ New walk · with narration →");
    add(labels, "choose_walk", "Выбрать эту прогулку →", "Осы серуенді таңдау →", "Choose this walk →");
    add(labels, "expand_card", "Развернуть карточку", "Карточканы ашу", "Expand walk card", "Маршрут и материалы", "Маршрут пен материалдар", "Route and materials");
    add(labels, "preview_walk", "Рассмотреть прогулку", "Серуенмен танысу", "Explore this walk");
    add(labels, "consent_public_start", "Старт — выбранная общественная точка. Подход от вашего текущего положения до неё не включён во время прогулки.", "Бастау — таңдалған қоғамдық нүкте. Қазіргі орныңыздан оған дейінгі жол серуен уақытына кірмейді.", "The start is an explicitly chosen public point. The approach from your current location is not included in the walking time.");
    add(labels, "start_walk", "Начать прогулку", "Серуенді бастау", "Start the walk");
    add(labels, "listen_chapter", "▷ Послушать главу", "▷ Тарауды тыңдау", "▷ Listen to this chapter");
    add(labels, "pause_audio", "Ⅱ Приостановить звук", "Ⅱ Дыбысты кідірту", "Ⅱ Pause audio");
    add(labels, "stop_audio", "■ Остановить звук", "■ Дыбысты тоқтату", "■ Stop audio");
    add(labels, "locale_ru", "RU", "Русский");
    add(labels, "locale_kk", "KK", "ҚАЗ", "Қазақша");
    add(labels, "locale_en", "EN", "English");
    add(labels, "mark_manual", "Я у остановки · ручная отметка", "Аялдамадамын · қолмен белгілеу", "I am at this stop · manual mark");
    add(labels, "pause_walk", "Пауза", "Үзіліс", "Pause");
    add(labels, "resume_walk", "Продолжить", "Жалғастыру", "Continue");
    add(labels, "resume_walk_footer", "Продолжить", "Жалғастыру", "Continue");
    add(labels, "stop_walk", "Остановить и сохранить", "Тоқтатып, сақтау", "Stop and save");
    add(labels, "discovery_all", "Все", "Бәрі", "All");
    add(labels, "discovery_history", "История", "Тарих", "History");
    add(labels, "discovery_architecture", "Архитектура", "Сәулет", "Architecture");
    add(labels, "discovery_weather", "Погода и события:", "Ауа райы мен оқиғалар:", "Weather and events:");
    add(labels, "weather_sun", "Солнце", "Күн ашық", "Sunshine");
    add(labels, "weather_rain", "Дождь", "Жаңбыр", "Rain");
    add(labels, "weather_cold", "Холодно", "Суық", "Cold");
    add(labels, "weather_windy", "Ветер", "Жел", "Wind");
    add(labels, "place_saken", "Музей Сакена Сейфуллина", "Сәкен Сейфуллин музейі", "Saken Seifullin Museum");
    add(labels, "place_bayterek", "Байтерек", "Бәйтерек", "Baiterek");
    add(labels, "place_detail", "Подробнее: Байтерек", "Толығырақ: Бәйтерек", "Discover more: Baiterek", "Подробнее: Музей Сакена Сейфуллина", "Толығырақ: Сәкен Сейфуллин музейі", "Discover more: Saken Seifullin Museum");
    add(labels, "discovery_back", "Назад к местам", "Орындарға оралу", "Back to places");
    add(labels, "guided_walk", "Прогулка с историями · 80 мин", "Хикаялы серуен · 80 мин", "A walk with stories · 80 min", "Прогулка с историями", "Хикаялары бар серуен", "Walk with stories");
    add(labels, "read_story", "Историю прочитал · дальше →", "Хикаяны оқыдым · әрі қарай →", "I read the story · next →");
    add(labels, "confirm_end", "Я у старта · завершить", "Бастауға жеттім · аяқтау", "At the start · finish",
      "Завершить у последней остановки", "Соңғы аялдамада аяқтау", "Finish at the last stop",
      "Я у финиша · завершить", "Мәреге жеттім · аяқтау", "At the finish · complete");
    add(labels, "walk_again", "Пройти ещё раз", "Тағы бір рет өту", "Walk again");
    LABELS = Collections.unmodifiableMap(labels);
  }
  private static void add(Map<String, List<String>> map, String id, String... values) {
    List<String> normalized = new ArrayList<>();
    for (String value : values) normalized.add(normalize(value));
    map.put(id, Collections.unmodifiableList(normalized));
  }
  /** Android ICU Pattern rejects the JDK-only UNICODE_CHARACTER_CLASS flag. */
  public static String normalize(String text) {
    if (text == null || text.isEmpty()) return "";
    StringBuilder result = new StringBuilder(); boolean space = false;
    for (int offset = 0; offset < text.length();) {
      int point = text.codePointAt(offset); offset += Character.charCount(point);
      if (Character.isWhitespace(point) || Character.isSpaceChar(point) || point == 0x85) {
        if (result.length() > 0) space = true;
      } else {
        if (space) { result.append(' '); space = false; }
        result.appendCodePoint(point);
      }
    }
    return result.toString();
  }
  public static boolean matches(String action, String label) {
    List<String> allowed = LABELS.get(action);
    if (allowed == null) return false;
    String value = normalize(label);
    if (allowed.contains(value)) return true;
    // Only these fixed own controls include changing public weather/editorial text.
    if ("discovery_weather".equals(action) && value.length() <= 240) {
      for (String prefix : allowed) if (value.startsWith(prefix + " ") && value.length() > prefix.length() + 1) return true;
    }
    if (("place_saken".equals(action) || "place_bayterek".equals(action)) && value.length() <= 600) {
      for (String title : allowed) if (value.startsWith(title + ". ") && value.length() > title.length() + 2) return true;
    }
    return false;
  }
  public static List<String> plan(String scenario, String actions) {
    if (scenario == null || scenario.isEmpty()) scenario = "inspect";
    if (Arrays.asList("launch", "inspect", "capture", "smoke", "policy", "windows").contains(scenario)) {
      if (actions != null && !actions.isEmpty()) throw new Refusal("UNEXPECTED_ACTIONS", false);
      return Collections.emptyList();
    }
    if (!"sequence".equals(scenario)) throw new Refusal("INVALID_SCENARIO", false);
    if (actions == null || actions.isEmpty() || actions.length() > 1000) throw new Refusal("INVALID_ACTIONS", false);
    String[] parts = actions.split(",", -1);
    if (parts.length > 30) throw new Refusal("TOO_MANY_ACTIONS", false);
    List<String> result = new ArrayList<>();
    for (String action : parts) {
      if (!LABELS.containsKey(action) && !INTERNAL.contains(action)) throw new Refusal("INVALID_ACTION", false);
      result.add(action);
    }
    return Collections.unmodifiableList(result);
  }
  public static void authorize(boolean locked, String activePackage, List<String> focusedPackages) {
    if (locked) throw new Refusal("KEYGUARD_LOCKED", true);
    if (!TARGET.equals(activePackage)) throw new Refusal("FOREIGN_FOREGROUND", true);
    if (focusedPackages == null || focusedPackages.isEmpty()) throw new Refusal("WINDOW_STATUS_UNAVAILABLE", true);
    for (String pkg : focusedPackages) if (!TARGET.equals(pkg)) throw new Refusal("FOREIGN_WINDOW", true);
  }
  /** The single approved Home/wait probe; no arbitrary global-action ID or wait duration. */
  public static long backgroundAudioWaitMillis(String action, boolean ownEnabledPauseVisible) {
    if (!"background_audio_20s".equals(action)) throw new Refusal("INVALID_BACKGROUND_AUDIO_ACTION", false);
    if (!ownEnabledPauseVisible) throw new Refusal("AUDIO_PLAYBACK_NOT_VISIBLE", false);
    return 20_000L;
  }
  /** Read-only startup waiting only; never authorizes a click/tree/screenshot in a foreign window. */
  public static boolean awaitOwnLaunch(String pkg, int type, boolean active, boolean focused) {
    return !active && !focused && (("com.miui.home".equals(pkg) && type == 1) || ("com.android.systemui".equals(pkg) && type == 3));
  }
  public static String startupRootClass(String pkg) {
    if (TARGET.equals(pkg)) return "OWN";
    if ("com.miui.home".equals(pkg)) return "KNOWN_LAUNCHER";
    if ("com.android.systemui".equals(pkg)) return "SYSTEMUI";
    return "UNKNOWN";
  }
  public static boolean sensitive(String text) { return text != null && LOCATION.matcher(text).find(); }
  /** Fixed footer action only: full target bounds must be in the own window's bottom 20%. */
  public static int footerTargetIndex(int[] window, List<int[]> targets) {
    if (window == null || window.length != 4 || targets == null) return -1;
    long height = (long) window[3] - window[1];
    if (height <= 0 || window[2] <= window[0]) return -1;
    int selected = -1;
    for (int index = 0; index < targets.size(); index++) {
      int[] target = targets.get(index);
      if (target == null || target.length != 4 || target[2] <= target[0] || target[3] <= target[1]
          || target[0] < window[0] || target[1] < window[1] || target[2] > window[2] || target[3] > window[3]
          || ((long) target[1] - window[1]) * 5 < height * 4) continue;
      if (selected != -1) throw new Refusal("AMBIGUOUS_ACTION_RESUME_WALK_FOOTER", false);
      selected = index;
    }
    return selected;
  }
  public static String redact(String text) {
    if (sensitive(text)) return "[LOCATION_REDACTED]";
    String normalized = normalize(text).replaceAll("[\\p{Cntrl}]", "");
    return normalized.length() > 160 ? normalized.substring(0, 157) + "..." : normalized;
  }
  public static boolean safeCaptureLabel(String label) {
    String value = normalize(label);
    return Arrays.asList("Карта выбранной прогулки", "Таңдалған серуен картасы", "Map of the selected walk", "Карта для знакомства с городом", "Қаламен танысу картасы", "A first look at the city", "← К сохранённой прогулке", "← Сақталған серуенге", "← Back to the saved walk", "Ручное прохождение · отметки не означают GPS-посещение", "Қолмен өту · белгі GPS-сапарды білдірмейді", "Manual progression · marks do not prove a GPS visit").contains(value);
  }
  /** Bounded boolean evidence only: no collected UI text or caller-defined screen rules. */
  public static final class DiscoveryScreenEvidence {
    private final boolean[] home = new boolean[3], place = new boolean[3], why = new boolean[3], map = new boolean[3];
    private boolean disallowed;
    private static final String[] HOME = { "Открой Астану", "Астананы аш", "Discover Astana" };
    private static final String[] WHY = { "Почему стоит увидеть", "Неліктен көруге тұрарлық", "Why see it" };
    private static final String[] MAP = { "Посмотреть на карте", "Картадан көру", "Show on the map" };
    private static final String[] MARKER = { "Показать место: ", "Орынды көрсету: ", "Show place: " };
    private static final String[][] PLACES = {
      { "Байтерек", "Хан Шатыр", "Набережная Есиля", "Музей Сакена Сейфуллина", "Театр имени Горького" },
      { "Бәйтерек", "Хан Шатыр", "Есіл жағалауы", "Сәкен Сейфуллин музейі", "Горький атындағы театр" },
      { "Baiterek", "Khan Shatyr", "Yesil waterfront", "Saken Seifullin Museum", "Gorky Drama Theatre" }
    };
    public void observe(String label) {
      String value = normalize(label);
      if (sensitive(value)) disallowed = true;
      for (int locale = 0; locale < 3; locale++) {
        home[locale] |= HOME[locale].equals(value);
        why[locale] |= WHY[locale].equals(value);
        map[locale] |= MAP[locale].equals(value) || ("⌖ " + MAP[locale]).equals(value);
        for (String title : PLACES[locale]) place[locale] |= title.equals(value) || (MARKER[locale] + title).equals(value);
      }
    }
    public void inputVisible() { disallowed = true; }
    public boolean isSafe() {
      if (disallowed) return false;
      for (int locale = 0; locale < 3; locale++) if (place[locale] && (home[locale] || why[locale] && map[locale])) return true;
      return false;
    }
  }
  public static boolean openingLabel(String label) {
    return Arrays.asList("Добро пожаловать в Астану!", "Астанаға қош келдіңіз!", "Welcome to Astana!").contains(normalize(label));
  }
  public static boolean passiveSystemBar(String title) {
    return Arrays.asList("StatusBar", "NavigationBar", "NavigationBar0").contains(title);
  }
  /** Exact package/type/focus and edge geometry, never a title-only window exemption. */
  public static boolean passiveSystemBar(int type, boolean active, boolean focused, String pkg, String title, int[] bounds, int[] app) {
    if (type != 3 || active || focused || !"com.android.systemui".equals(pkg) || bounds == null || bounds.length != 4 || app == null || app.length != 4) return false;
    if (app[0] != 0 || app[1] != 0 || app[2] <= 0 || app[3] <= 0 || bounds[0] != app[0] || bounds[2] != app[2]) return false;
    long height = (long) bounds[3] - bounds[1], displayHeight = (long) app[3] - app[1];
    if (height <= 0 || height * 100 > displayHeight * 8 || bounds[1] < app[1] || bounds[3] > app[3]) return false;
    boolean top = bounds[1] == app[1] && ("".equals(title) || "StatusBar".equals(title));
    boolean bottom = bounds[3] == app[3] && Arrays.asList("NavigationBar", "NavigationBar0", "Панель навигации").contains(title);
    return top || bottom;
  }
  public static final class Refusal extends RuntimeException {
    public final String code;
    public final boolean userAction;
    public Refusal(String code, boolean userAction) { super(code); this.code = code; this.userAction = userAction; }
  }
  private UiPolicy() {}
}
