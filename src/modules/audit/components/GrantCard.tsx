import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius, signal } from "@shared/designSystem";
import { Banner, Button, Card, HStack, SignalBadge, Text, TextField, VStack } from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import { useReviewGrant } from "@modules/audit/hooks/useAudit";
import { roleLabel } from "@modules/audit/components/AuditEntryCard";
import { GRANT_STATUS_LABELS, REVIEW_NOTE_MIN, type BreakGlassGrant, type GrantOutcome } from "@modules/audit/types";

const STATUS_TONE = { pending: "warning", appropriate: "success", inappropriate: "danger" } as const;

/**
 * Break-glass grant review. "Inappropriate" requires a note; self-review is refused by the server
 * and shown as it arrives (the client only knows the grantee's name).
 */
export function GrantCard({ grant }: { grant: BreakGlassGrant }) {
  const review = useReviewGrant();
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState("");

  const isPending = grant.review.status === "pending";
  const noteLength = note.trim().length;
  const submit = (outcome: GrantOutcome) =>
    review.mutate({ id: grant.id, outcome, note: outcome === "inappropriate" ? note.trim() : undefined });

  const patient = grant.patient.fullName
    ? `${grant.patient.fullName}${grant.patient.patientId ? ` · ${grant.patient.patientId}` : ""}`
    : "Patient record";

  return (
    <Card compact accentColor={isPending ? signal.critical.color : undefined} testID={`grant-${grant.id}`}>
      <VStack gap={8}>
        <HStack gap={8} align="center" wrap>
          <Text variant="label">{grant.userName || "Unknown user"}</Text>
          {grant.userRole ? (
            <Text variant="caption" tone="tertiary">
              {roleLabel(grant.userRole)}
            </Text>
          ) : null}
          {grant.active ? (
            <SignalBadge level="urgent" size="sm" label="Active now" />
          ) : (
            <Text variant="caption" tone="tertiary">
              Expired
            </Text>
          )}
          <Text variant="label-sm" tone={STATUS_TONE[grant.review.status]} style={{ marginLeft: "auto" }}>
            {GRANT_STATUS_LABELS[grant.review.status]}
          </Text>
        </HStack>

        <Text variant="body-sm">Patient: {patient}</Text>
        <Text variant="body-sm" tone="secondary">
          {grant.categoryLabel || grant.category}
        </Text>

        <View style={styles.reason}>
          <Text variant="caption" tone="tertiary">
            Stated reason
          </Text>
          <Text variant="body-sm">{grant.reason}</Text>
        </View>

        <Text variant="caption" tone="tertiary" tabular>
          Granted {formatDateTime(grant.grantedAt)} · Expires {formatDateTime(grant.expiresAt)} · Opened{" "}
          {grant.viewCount} {grant.viewCount === 1 ? "time" : "times"} under this access
        </Text>

        {!isPending ? (
          <VStack gap={2}>
            <Text variant="caption" tone="secondary">
              Reviewed by {grant.review.reviewedByName || "—"} on {formatDateTime(grant.review.reviewedAt)}
            </Text>
            {grant.review.note ? <Text variant="body-sm">Note: {grant.review.note}</Text> : null}
          </VStack>
        ) : (
          <VStack gap={8}>
            {review.isError ? (
              <Banner tone="danger" message={apiErrorMessage(review.error, "Could not record the review")} />
            ) : null}
            <HStack gap={8} wrap>
              <Button
                label="Appropriate"
                size="sm"
                variant="secondary"
                fullWidth={false}
                disabled={review.isPending}
                loading={review.isPending && review.variables?.outcome === "appropriate"}
                onPress={() => submit("appropriate")}
                testID={`grant-appropriate-${grant.id}`}
              />
              <Button
                label="Inappropriate"
                size="sm"
                variant={marking ? "secondary" : "destructive"}
                fullWidth={false}
                disabled={review.isPending}
                onPress={() => setMarking((m) => !m)}
                testID={`grant-inappropriate-${grant.id}`}
              />
            </HStack>

            {marking ? (
              <VStack gap={8}>
                <TextField
                  label="Why was this access inappropriate?"
                  required
                  multiline
                  value={note}
                  onChangeText={setNote}
                  maxLength={1000}
                  placeholder="What the review found. This is the basis for any follow-up."
                  hint={
                    noteLength >= REVIEW_NOTE_MIN
                      ? undefined
                      : `At least ${REVIEW_NOTE_MIN} characters (${noteLength}/${REVIEW_NOTE_MIN})`
                  }
                  testID={`grant-note-${grant.id}`}
                />
                <HStack gap={8} wrap>
                  <Button
                    label="Record as inappropriate"
                    size="sm"
                    variant="destructive"
                    fullWidth={false}
                    disabled={noteLength < REVIEW_NOTE_MIN || review.isPending}
                    loading={review.isPending && review.variables?.outcome === "inappropriate"}
                    onPress={() => submit("inappropriate")}
                    testID={`grant-submit-${grant.id}`}
                  />
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="ghost"
                    fullWidth={false}
                    onPress={() => {
                      setMarking(false);
                      setNote("");
                    }}
                  />
                </HStack>
              </VStack>
            ) : null}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  reason: {
    gap: 2,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface.secondary,
    borderWidth: 1,
    borderColor: palette.border.subtle,
  },
});
