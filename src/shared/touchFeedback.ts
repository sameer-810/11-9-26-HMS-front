import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export type FeedbackTone =
  "select" | "impact" | "success" | "warning" | "error";

/**
 * Haptic tap confirmation (helps avoid double-charting when not looking at the screen).
 * No-op on web; failures are swallowed so a clinical workflow never throws.
 */
export function haptic(tone: FeedbackTone = "select") {
  if (Platform.OS === "web") return;
  try {
    switch (tone) {
      case "impact":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "success":
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        break;
      case "warning":
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "select":
      default:
        void Haptics.selectionAsync();
    }
  } catch {
    // Haptics unavailable; ignore.
  }
}
