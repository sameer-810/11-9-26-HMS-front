import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Clock, CircleCheck, CircleX, TriangleAlert } from "lucide-react-native";
import { palette, radius, signal, layout } from "@shared/designSystem";
import { Text, HStack, VStack, Card, Button, Banner, TextField, Select } from "@shared/ui";
import { useDrugRound, useAdminister } from "@modules/inpatient/hooks/useInpatient";
import type { DrugRoundSlot } from "@modules/inpatient/types";


/**
 * NU-04 drug round: unsigned past slots show as overdue; a second signature is refused
 * by the server (409) and shown with who already gave the dose.
 */
const OMISSION_REASONS = [
  { value: "refused", label: "Patient refused" },
  { value: "withheld", label: "Withheld on clinical grounds" },
  { value: "omitted", label: "Not given — other reason" },
  { value: "self_administered", label: "Self-administered by patient" },
];

interface Props {
  admissionId: string;
  date?: string;
}

export function DrugRoundPanel({ admissionId, date }: Props) {
  const { data: round, isLoading } = useDrugRound(admissionId, date);
  const administer = useAdminister();
  const [omitting, setOmitting] = useState<DrugRoundSlot | null>(null);
  const [omitStatus, setOmitStatus] = useState("refused");
  const [omitReason, setOmitReason] = useState("");

  const conflict =
    administer.isError &&
    (administer.error as { response?: { status?: number } })?.response?.status === 409
      ? ((
          administer.error as {
            response?: { data?: { error?: { message?: string } } };
          }
        )?.response?.data?.error?.message ?? "")
      : "";

  const sign = (slot: DrugRoundSlot, status: string, reason?: string) => {
    administer.mutate(
      {
        admissionId,
        prescriptionId: slot.prescriptionId,
        prescriptionItemId: slot.prescriptionItemId,
        status: status as "given",
        reason,
        ...(round && slot.time ? { dueDate: round.date, dueTime: slot.time } : {}),
      },
      {
        onSuccess: () => {
          setOmitting(null);
          setOmitReason("");
        },
      },
    );
  };

  if (isLoading) {
    return (
      <Card>
        <Text tone="secondary">Loading the round…</Text>
      </Card>
    );
  }

  if (!round || round.slots.length === 0) {
    return (
      <Card>
        <VStack gap={4}>
          <Text variant="label">Nothing prescribed</Text>
          <Text variant="caption" tone="secondary">
            No active prescription for this patient, so there is no round.
          </Text>
        </VStack>
      </Card>
    );
  }

  const scheduled = round.slots.filter((s) => !s.asNeeded);
  const asNeeded = round.slots.filter((s) => s.asNeeded);
  const overdue = scheduled.filter((s) => s.overdue);

  return (
    <VStack gap={12} testID="drug-round">
      {overdue.length > 0 ? (
        <Banner
          tone="warning"
          title={`${overdue.length} dose${overdue.length === 1 ? "" : "s"} overdue`}
          message={overdue
            .map((s) => `${s.drugName} ${s.time} (${s.minutesLate} min late)`)
            .join(" · ")}
        />
      ) : null}

      {conflict ? (
        <View testID="administer-conflict">
          <Banner tone="danger" title="Already signed for" message={conflict} />
        </View>
      ) : null}

      <Card>
        <VStack gap={10}>
          <HStack justify="space-between" align="center">
            <Text variant="h4">Drug round</Text>
            <Text variant="caption" tone="secondary">
              {round.date}
            </Text>
          </HStack>

          {scheduled.map((slot) => (
            <SlotRow
              key={`${slot.prescriptionItemId}-${slot.time}`}
              slot={slot}
              onGive={() => sign(slot, "given")}
              onOmit={() => {
                setOmitting(slot);
                setOmitStatus("refused");
                setOmitReason("");
              }}
              pending={administer.isPending}
            />
          ))}

          {asNeeded.length > 0 ? (
            <VStack gap={8} style={styles.prnSection}>
              <Text variant="overline" tone="secondary">
                As needed
              </Text>
              {asNeeded.map((slot) => (
                <SlotRow
                  key={slot.prescriptionItemId}
                  slot={slot}
                  onGive={() => sign(slot, "given")}
                  onOmit={() => {
                    setOmitting(slot);
                    setOmitStatus("refused");
                    setOmitReason("");
                  }}
                  pending={administer.isPending}
                />
              ))}
            </VStack>
          ) : null}
        </VStack>
      </Card>

      { /* An omission cannot be saved without a reason. */ }
      {omitting ? (
        <Card testID="omission-form">
          <VStack gap={12}>
            <Text variant="h4">{omitting.drugName} was not given</Text>
            <Select
              label="What happened"
              value={omitStatus}
              onChange={setOmitStatus}
              options={OMISSION_REASONS}
            />
            <TextField
              label="Reason"
              placeholder="The next shift has to decide what to do about this dose"
              value={omitReason}
              onChangeText={setOmitReason}
              multiline
              testID="omit-reason"
            />
            <HStack gap={8}>
              <Button
                label="Record"
                onPress={() => sign(omitting, omitStatus, omitReason)}
                disabled={omitReason.trim().length < 3 || administer.isPending}
                testID="omit-submit"
              />
              <Button label="Cancel" variant="ghost" onPress={() => setOmitting(null)} />
            </HStack>
          </VStack>
        </Card>
      ) : null}
    </VStack>
  );
}

function SlotRow({
  slot,
  onGive,
  onOmit,
  pending,
}: {
  slot: DrugRoundSlot;
  onGive: () => void;
  onOmit: () => void;
  pending: boolean;
}) {
  const given = slot.administration?.status === "given";
  const notGiven = Boolean(slot.administration) && !given;
  const tone = given ? signal.normal : notGiven ? signal.caution : slot.overdue ? signal.urgent : null;

  return (
    <View
      style={[styles.row, tone ? { borderColor: tone.border, backgroundColor: tone.bg } : null]}
      testID={`slot-${slot.prescriptionItemId}${slot.time ? `-${slot.time}` : ""}`}
    >
      <HStack gap={12} align="center" wrap>
        <View style={styles.time}>
          {slot.asNeeded ? (
            <Text variant="label-sm" tone="secondary">
              PRN
            </Text>
          ) : (
            <Text variant="label" tabular>
              {slot.time}
            </Text>
          )}
        </View>

        <VStack gap={2} style={{ flex: 1, minWidth: 160 }}>
          <Text variant="label">
            {slot.drugName} {slot.strength}
          </Text>
          <Text variant="caption" tone="secondary">
            {slot.dose} · {slot.route} · {slot.frequency}
            {slot.instructions ? ` · ${slot.instructions}` : ""}
          </Text>

          {given ? (
            <HStack gap={4} align="center">
              <CircleCheck size={13} color={signal.normal.text} />
              <Text variant="caption" style={{ color: signal.normal.text }}>
                Given by {slot.administration?.administeredBy}
              </Text>
            </HStack>
          ) : notGiven ? (
            <HStack gap={4} align="center">
              <CircleX size={13} color={signal.caution.text} />
              <Text variant="caption" style={{ color: signal.caution.text }}>
                {slot.administration?.status}: {slot.administration?.reason}
              </Text>
            </HStack>
          ) : slot.overdue ? (
            <HStack gap={4} align="center">
              <TriangleAlert size={13} color={signal.urgent.text} />
              <Text variant="caption" style={{ color: signal.urgent.text }}>
                Overdue by {slot.minutesLate} minutes
              </Text>
            </HStack>
          ) : (
            <HStack gap={4} align="center">
              <Clock size={13} color={palette.text.tertiary} />
              <Text variant="caption" tone="tertiary">
                Due
              </Text>
            </HStack>
          )}
        </VStack>

        {slot.administration ? null : (
          <HStack gap={6}>
            <Button
              label="Give"
              size="sm"
              onPress={onGive}
              disabled={pending}
              testID={`give-${slot.prescriptionItemId}${slot.time ? `-${slot.time}` : ""}`}
            />
            <Button
              label="Not given"
              size="sm"
              variant="secondary"
              onPress={onOmit}
              disabled={pending}
            />
          </HStack>
        )}
      </HStack>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.md,
    padding: 10,
    minHeight: layout.minTouchTarget,
    backgroundColor: palette.surface.raised,
  },
  time: {
    minWidth: 52,
  },
  prnSection: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});
