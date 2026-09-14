import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { palette, radius } from "@shared/designSystem";
import { Banner, Button, HStack, Text, VStack } from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { useNetworkStore } from "./network";
import { useMirrorStore } from "./mirror";
import { useOutbox, useMyOps, drainOutbox, type OutboxOp } from "./outbox";

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The strip above every screen that says what state the device is in.
 *
 * Silent when there is nothing to say. Otherwise, one of:
 *   - offline: what is on screen is a saved copy, as of when, and what can and
 *     cannot be saved right now;
 *   - back online with entries still sending;
 *   - entries the server refused, with a way to see their values and re-enter
 *     them. Those are never discarded without the nurse choosing to.
 */
export function OfflineStatusBar() {
  const online = useNetworkStore((s) => s.online);
  const savedAt = useMirrorStore((s) => s.savedAt);
  const syncing = useOutbox((s) => s.syncing);
  const ops = useMyOps();
  const [reviewing, setReviewing] = useState(false);

  const pending = ops.filter((o) => o.status === "pending");
  const failed = ops.filter((o) => o.status === "failed");
  if (online && pending.length === 0 && failed.length === 0) return null;

  return (
    <View style={styles.wrap} testID="offline-status">
      {!online ? (
        <Banner
          tone="warning"
          title="Offline — no connection to the hospital server"
          message={`Showing what this device saved${savedAt ? ` (as of ${clock(savedAt)})` : ""}. Vitals and nursing notes you record are kept here and sent in order when the connection returns; nothing else can be saved until then.${
            pending.length ? ` ${entries(pending.length)} waiting to send.` : ""
          }`}
        />
      ) : pending.length > 0 ? (
        <Banner
          tone="info"
          title={syncing ? "Sending entries saved offline" : "Entries saved offline are waiting to send"}
          message={`${entries(pending.length)} will be filed at the times they were charted.`}
        />
      ) : null}

      {failed.length > 0 ? (
        <View testID="outbox-failed">
          <Banner
            tone="danger"
            title={`${entries(failed.length)} saved offline could not be filed`}
            message="The server refused them — the patient may have been discharged, or the device clock was wrong. Review them to re-enter what is still needed."
            action={
              <Button label="Review" size="sm" variant="secondary" onPress={() => setReviewing(true)} testID="outbox-review" />
            }
          />
        </View>
      ) : null}

      <FailedEntries visible={reviewing} ops={failed} onClose={() => setReviewing(false)} />
    </View>
  );
}

const SUMMARY_FIELDS: [string, string][] = [
  ["respiratoryRate", "RR"],
  ["spo2", "SpO₂"],
  ["onOxygen", "O₂"],
  ["systolic", "Systolic"],
  ["diastolic", "Diastolic"],
  ["pulse", "HR"],
  ["temperatureC", "Temp"],
  ["consciousness", "ACVPU"],
  ["clinicalConcern", "Concern"],
];

function summarise(op: OutboxOp): string {
  if (op.kind === "note") return String(op.body.note ?? "");
  return SUMMARY_FIELDS.filter(([key]) => op.body[key] !== null && op.body[key] !== undefined && op.body[key] !== "")
    .map(([key, label]) => `${label} ${String(op.body[key])}`)
    .join(" · ");
}

function FailedEntries({ visible, ops, onClose }: { visible: boolean; ops: OutboxOp[]; onClose: () => void }) {
  const retry = useOutbox((s) => s.retry);
  const discard = useOutbox((s) => s.discard);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <VStack gap={12}>
            <Text variant="h3">Entries not filed</Text>
            <Text variant="body-sm" tone="secondary">
              Each was charted on this device and refused by the server. The values are shown so they can be
              re-entered where they still apply.
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <VStack gap={10}>
                {ops.length === 0 ? (
                  <Text variant="body-sm" tone="tertiary">
                    Nothing left to review.
                  </Text>
                ) : null}
                {ops.map((op) => (
                  <View key={op.id} style={styles.entry} testID={`outbox-failed-${op.id}`}>
                    <VStack gap={4}>
                      <Text variant="label">{op.label}</Text>
                      <Text variant="caption" tone="tertiary">
                        Charted {formatDateTime(op.takenAt)}
                      </Text>
                      <Text variant="body-sm">{summarise(op)}</Text>
                      <Text variant="caption" style={{ color: palette.danger.text }}>
                        {op.error}
                      </Text>
                      <HStack gap={8} wrap>
                        <Button
                          label="Send again"
                          size="sm"
                          variant="secondary"
                          onPress={() => {
                            retry(op.id);
                            void drainOutbox();
                          }}
                          testID={`outbox-retry-${op.id}`}
                        />
                        <Button
                          label={confirming === op.id ? "Discard — tap again to confirm" : "Discard"}
                          size="sm"
                          variant={confirming === op.id ? "destructive" : "ghost"}
                          onPress={() => {
                            if (confirming === op.id) {
                              discard(op.id);
                              setConfirming(null);
                            } else {
                              setConfirming(op.id);
                            }
                          }}
                          testID={`outbox-discard-${op.id}`}
                        />
                      </HStack>
                    </VStack>
                  </View>
                ))}
              </VStack>
            </ScrollView>
            <Button label="Close" variant="ghost" onPress={onClose} testID="outbox-close" />
          </VStack>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, gap: 8, backgroundColor: palette.surface.secondary },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,18,32,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: palette.surface.primary,
  },
  entry: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border.default,
  },
});
