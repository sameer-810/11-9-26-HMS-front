import React from "react";
import { View, StyleSheet } from "react-native";

import { palette } from "@shared/designSystem";
import { Banner } from "@shared/ui";
import { useRealtimeAlerts } from "./realtime";

/**
 * Alerts pushed by the server — a critical result, a high-acuity arrival,
 * emergency access used. They stay until dismissed: an alert that fades on a
 * timer is one nobody was looking at when it went.
 */
export function RealtimeAlerts() {
  const alerts = useRealtimeAlerts((s) => s.alerts);
  const dismiss = useRealtimeAlerts((s) => s.dismiss);
  if (alerts.length === 0) return null;

  return (
    <View style={styles.wrap} testID="realtime-alerts">
      {alerts.map((a) => (
        <Banner key={a.id} tone={a.tone} title={a.title} message={a.message} onDismiss={() => dismiss(a.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, gap: 8, backgroundColor: palette.surface.secondary },
});
