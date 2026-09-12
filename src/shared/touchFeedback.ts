import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export type FeedbackTone = "select" | "impact" | "success" | "warning" | "error";

/**
 * Physical confirmation that a tap landed.
 *
 * Matters more here than in a consumer app: a nurse confirming a medication
 * administration on a tablet often cannot watch the screen while doing it, and
 * "did that register?" is the question that produces double-charting.
 *
 * Silently no-ops on web and swallows its own failures — a device with haptics
 * disabled must not throw into a clinical workflow.
 */
export function haptic(tone: FeedbackTone = "select") {
  if (Platform.OS === "web") return;
  try {
    switch (tone) {
      case "impact":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "select":
      default:
        void Haptics.selectionAsync();
    }
  } catch {
    // Haptics unavailable. Not a reason to interrupt anything.
  }
}
