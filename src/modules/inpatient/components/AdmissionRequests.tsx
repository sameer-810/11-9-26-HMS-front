import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ClipboardList, TriangleAlert } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import { Banner, Button, Card, HStack, SectionHeader, Select, Text, TextField, VStack } from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import { useAdmissionRequests, useCloseAdmissionRequest } from "@modules/inpatient/hooks/useInpatient";
import {
  REQUEST_CLOSURE_LABELS,
  type AdmissionRequest,
  type RequestClosureOutcome,
} from "@modules/inpatient/types";

const OUTCOMES = (Object.keys(REQUEST_CLOSURE_LABELS) as RequestClosureOutcome[]).map((value) => ({
  value,
  label: REQUEST_CLOSURE_LABELS[value],
}));

/**
 * US-17: doctors' recommendations to admit, where the person who admits sees
 * them — the top of the admitted patients board.
 *
 * Nothing is drawn when nothing is waiting: an empty "0 requests" card on every
 * ward round is a card people learn to scroll past, and then miss the day it
 * has something in it.
 *
 * "Admit" opens the admission form with the patient, the reason and the
 * consultation already filled in, so the admission is linked to the
 * recommendation and clears it. A recommendation that will not go ahead is
 * closed with a reason rather than left to age off the list.
 */
export function AdmissionRequests({ onAdmit }: { onAdmit: (request: AdmissionRequest) => void }) {
  const requests = useAdmissionRequests();
  const rows = requests.data ?? [];

  if (requests.isError) {
    return (
      <View testID="admission-requests-error">
        <Banner tone="warning" title="Couldn't load the admission requests" message={apiErrorMessage(requests.error)} />
      </View>
    );
  }
  if (rows.length === 0) return null;

  return (
    <Card testID="admission-requests">
      <SectionHeader
        title={`${rows.length} waiting for a bed`}
        subtitle="Recommended for admission by a doctor. Admit from here, or close one that will not go ahead."
      />
      <VStack gap={10}>
        {rows.map((row) => (
          <RequestRow key={row.consultationId} row={row} onAdmit={() => onAdmit(row)} />
        ))}
      </VStack>
    </Card>
  );
}

function RequestRow({ row, onAdmit }: { row: AdmissionRequest; onAdmit: () => void }) {
  const close = useCloseAdmissionRequest();
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState<RequestClosureOutcome>("patient_declined");
  const [note, setNote] = useState("");
  const patient = row.patient;

  return (
    <View style={styles.row} testID={`request-${row.consultationNumber}`}>
      <VStack gap={6}>
        <HStack gap={8} align="center" wrap>
          <ClipboardList size={16} color={palette.clinical[600]} />
          <Text variant="label-lg">{patient.fullName}</Text>
          <Text variant="caption" tone="secondary">
            {patient.age} · {patient.gender} · {patient.patientId}
          </Text>
        </HStack>

        {patient.allergiesRecorded ? (
          patient.allergies.length > 0 ? (
            <HStack gap={4} align="center">
              <TriangleAlert size={12} color={signal.critical.text} />
              <Text variant="caption" style={{ color: signal.critical.text }}>
                Allergic to {patient.allergies.map((a) => a.substance).join(", ")}
              </Text>
            </HStack>
          ) : (
            <Text variant="caption" tone="tertiary">
              No known allergies
            </Text>
          )
        ) : (
          <Text variant="caption" style={{ color: signal.caution.text }}>
            Allergies not recorded
          </Text>
        )}

        {row.restricted ? (
          <Text variant="body-sm" tone="secondary">
            Restricted record — the reason is on the consultation, for the treating team.
          </Text>
        ) : (
          <VStack gap={2}>
            {row.reason ? <Text variant="body-sm">{row.reason}</Text> : null}
            {row.diagnosis ? (
              <Text variant="caption" tone="secondary">
                {row.diagnosis}
              </Text>
            ) : null}
          </VStack>
        )}

        <Text variant="caption" tone="tertiary">
          Recommended by {row.doctor?.fullName ?? "a doctor"}
          {row.department ? `, ${row.department.name}` : ""} · {formatDateTime(row.recommendedAt)} · {row.consultationNumber}
        </Text>

        {closing ? (
          <VStack gap={10} testID="request-close-form">
            <View testID="request-close-outcome">
              <Select
                label="Why is this patient not being admitted?"
                value={outcome}
                options={OUTCOMES}
                onChange={(v) => setOutcome(v as RequestClosureOutcome)}
              />
            </View>
            <TextField
              label="Note"
              required
              value={note}
              onChangeText={setNote}
              multiline
              hint="One sentence the next person can act on."
              testID="request-close-note"
            />
            {close.isError ? <Banner tone="danger" message={apiErrorMessage(close.error)} /> : null}
            <HStack gap={8} wrap>
              <Button
                label="Close recommendation"
                size="sm"
                disabled={note.trim().length < 3}
                loading={close.isPending}
                onPress={() => close.mutate({ consultationId: row.consultationId, outcome, note: note.trim() })}
                testID="request-close-submit"
              />
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => setClosing(false)} />
            </HStack>
          </VStack>
        ) : (
          <HStack gap={8} wrap>
            <Button label="Admit" size="sm" onPress={onAdmit} testID={`request-admit-${row.consultationNumber}`} />
            <Button
              label="Not admitting"
              size="sm"
              variant="secondary"
              onPress={() => setClosing(true)}
              testID={`request-close-${row.consultationNumber}`}
            />
          </HStack>
        )}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
});
