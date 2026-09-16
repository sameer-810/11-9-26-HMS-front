import React from "react";
import { View, StyleSheet } from "react-native";

import { palette } from "@shared/designSystem";
import { Banner } from "@shared/ui";
import { useRealtimeAlerts } from "./realtime";

/** Server-pushed alerts (critical results, high-acuity arrivals, break-glass). They stay until dismissed. */
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
