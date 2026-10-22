import * as Haptics from "expo-haptics";

/**
 * Small, consistent touches of feedback. Android's own "touch feedback" setting still applies, and failures
 * (no vibrator, emulator) are ignored: haptics are never essential.
 */
const safe = (fn: () => Promise<void>) => {
  fn().catch(() => undefined);
};

export const haptic = {
  /** Selecting or toggling something in a list. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** A deliberate tap with a result, e.g. favorite. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Something finished well: a session saved, a goal reached. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something could not be done. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
