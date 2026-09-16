import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Lock, LockOpen, ShieldAlert } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Card,
  SectionHeader,
  Text,
  VStack,
  HStack,
  Button,
  TextField,
  Banner,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useSetRecordRestriction } from "@modules/patient/hooks/usePatients";
import type { Patient, RecordRestriction } from "@modules/patient/types";

/** Mirrors the server's minimum reason length for restricting. */
const MIN_REASON = 10;

/**
 * Whether the record is open to all clinical staff or only the treating team. Read from the
 * patient, not the medical record: opening the record here would log a record view every time.
 */
export function RecordAccessCard({ patient }: { patient: Patient }) {
  const setRestriction = useSetRecordRestriction(patient.id);

  // What the last save answered, shown until the refetched patient arrives.
  const [saved, setSaved] = useState<RecordRestriction | null>(null);
  const [restricting, setRestricting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmLift, setConfirmLift] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restricted = saved
    ? saved.accessRestricted
    : Boolean(patient.accessRestricted);
  const reasonShown = saved?.restrictionReason ?? patient.restrictionReason;
  const restrictedBy = saved?.restrictedByName ?? patient.restrictedByName;
  const length = reason.trim().length;

  const restrict = async () => {
    if (length < MIN_REASON) return;
    setError(null);
    try {
      setSaved(
        await setRestriction.mutateAsync({
          restricted: true,
          reason: reason.trim(),
        }),
      );
      setRestricting(false);
      setReason("");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not restrict this record"));
    }
  };

  const lift = async () => {
    setError(null);
    try {
      setSaved(await setRestriction.mutateAsync({ restricted: false }));
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove the restriction"));
    } finally {
      setConfirmLift(false);
    }
  };

  return (
    <Card
      testID="record-access"
      accentColor={restricted ? signal.caution.color : undefined}
    >
      <SectionHeader
        title="Record access"
        subtitle="Who can open this patient's medical record"
      />

      {error ? (
        <Banner
          tone="danger"
          message={error}
          onDismiss={() => setError(null)}
          style={{ marginBottom: 10 }}
        />
      ) : null}

      {restricted ? (
        <VStack gap={10}>
          <HStack gap={10} align="center">
            <View style={[styles.mark, { backgroundColor: signal.caution.bg }]}>
              <Lock size={16} color={signal.caution.text} strokeWidth={2.2} />
            </View>
            <VStack gap={2} flex={1}>
              <Text
                variant="label-lg"
                tone="primary"
                testID="record-access-status"
              >
                Restricted to the treating team
              </Text>
              <Text variant="body-sm" tone="secondary">
                Anyone else has to break the glass to open it, and that access
                is logged and reviewed.
              </Text>
            </VStack>
          </HStack>
          {reasonShown ? (
            <Text variant="body-sm" tone="secondary">
              Reason: {reasonShown}
              {restrictedBy ? ` — ${restrictedBy}` : ""}
            </Text>
          ) : null}
          <HStack gap={8} wrap>
            <Button
              label="Remove restriction"
              variant="secondary"
              size="sm"
              fullWidth={false}
              testID="unrestrict-record"
              icon={
                <LockOpen
                  size={14}
                  color={palette.text.primary}
                  strokeWidth={2.2}
                />
              }
              onPress={() => setConfirmLift(true)}
            />
          </HStack>
        </VStack>
      ) : (
        <VStack gap={10}>
          <HStack gap={10} align="center">
            <View style={[styles.mark, { backgroundColor: palette.ink[50] }]}>
              <LockOpen
                size={16}
                color={palette.text.tertiary}
                strokeWidth={2.2}
              />
            </View>
            <VStack gap={2} flex={1}>
              <Text
                variant="label-lg"
                tone="primary"
                testID="record-access-status"
              >
                Not restricted
              </Text>
              <Text variant="body-sm" tone="secondary">
                Clinical staff whose role includes records can open it.
              </Text>
            </VStack>
          </HStack>

          {!restricting ? (
            <HStack gap={8} wrap>
              <Button
                label="Restrict this record"
                variant="secondary"
                size="sm"
                fullWidth={false}
                testID="restrict-record"
                icon={
                  <Lock
                    size={14}
                    color={palette.text.primary}
                    strokeWidth={2.2}
                  />
                }
                onPress={() => setRestricting(true)}
              />
            </HStack>
          ) : (
            <VStack gap={12}>
              <View style={styles.explain}>
                <HStack gap={8} align="center">
                  <ShieldAlert
                    size={15}
                    color={signal.caution.text}
                    strokeWidth={2.3}
                  />
                  <Text
                    variant="label"
                    weight="600"
                    style={{ color: signal.caution.text }}
                  >
                    What restricting does
                  </Text>
                </HStack>
                <Text variant="body-sm" style={{ color: signal.caution.text }}>
                  Only the patient&apos;s treating team — the doctors seeing
                  them, their ward nurses — can open the record. Anyone else has
                  to break the glass and give a reason; that access is logged,
                  the administrator is alerted, and it is reviewed.
                </Text>
              </View>
              <TextField
                label="Reason"
                required
                multiline
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Staff member being treated here; patient asked for privacy"
                hint={
                  length < MIN_REASON
                    ? `At least ${MIN_REASON} characters — ${MIN_REASON - length} to go`
                    : "Recorded in the audit trail"
                }
                testID="restrict-reason"
              />
              <HStack gap={8} justify="flex-end" wrap>
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => {
                    setRestricting(false);
                    setReason("");
                  }}
                />
                <Button
                  label="Restrict record"
                  size="sm"
                  fullWidth={false}
                  disabled={length < MIN_REASON}
                  loading={setRestriction.isPending}
                  onPress={restrict}
                  testID="restrict-submit"
                />
              </HStack>
            </VStack>
          )}
        </VStack>
      )}

      <ConfirmDialog
        visible={confirmLift}
        title="Remove the restriction?"
        message="Clinical staff whose role includes records will be able to open it again without breaking the glass. The change is recorded in the audit trail."
        confirmLabel="Remove restriction"
        cancelLabel="Keep it restricted"
        loading={setRestriction.isPending}
        onConfirm={lift}
        onCancel={() => setConfirmLift(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  explain: {
    padding: 10,
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: signal.caution.border,
    backgroundColor: signal.caution.bg,
  },
});
