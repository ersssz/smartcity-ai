package kz.astanaai.diagnostics.test;

import java.util.regex.Pattern;

/** Fixed synthetic probes and sanitized class names only. Never reads UI, messages or stacks. */
public final class AndroidPolicyProbe {
  public static String unicodePatternFlag() {
    try { Pattern.compile("[ ]", 0x100); return "PATTERN_FLAG_0X100_SUPPORTED"; }
    catch (IllegalArgumentException unsupported) { return "PATTERN_FLAG_0X100_UNSUPPORTED"; }
    catch (RuntimeException other) { return "PATTERN_FLAG_PROBE_ERROR_" + safeClass(other); }
  }
  public static String failureChain(Throwable failure) {
    StringBuilder classes = new StringBuilder();
    for (int depth = 0; failure != null && depth < 4; depth++, failure = failure.getCause()) {
      if (depth > 0) classes.append('>'); classes.append(safeClass(failure));
    }
    return classes.toString();
  }
  private static String safeClass(Throwable failure) {
    String name = failure.getClass().getSimpleName();
    if (name.isEmpty() || name.length() > 80) return "Throwable";
    for (int i = 0; i < name.length(); i++) {
      char c = name.charAt(i);
      if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '_' && c != '$') return "Throwable";
    }
    return name;
  }
  private AndroidPolicyProbe() {}
}
