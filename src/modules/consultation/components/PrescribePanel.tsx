import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Pill, Trash2, TriangleAlert, ShieldAlert, Search } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  TextField,
  SearchInput,
  Banner,
  ListRow,
  Skeleton,
  SignalBadge,
  ClinicalAlert,
  Select,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import {
  useMedicineSearch,
  useSafetyCheck,
  useCreatePrescription,
} from "@modules/consultation/hooks/useConsultation";
import type {
  Medicine,
  DraftLine,
  SafetyResult,
  SafetyAlert,
  SafetyTier,
} from "@modules/consultation/types";

interface Props {
  patientId: string;
  consultationId?: string;
  /** Disabled once the consultation is signed. */
  disabled?: boolean;
  onPrescribed?: (prescriptionNumber: string) => void;
}

const FREQUENCIES = [
  { value: "1-0-0", label: "1-0-0", sublabel: "Morning only" },
  { value: "0-0-1", label: "0-0-1", sublabel: "Night only" },
  { value: "1-0-1", label: "1-0-1", sublabel: "Morning and night" },
  { value: "1-1-1", label: "1-1-1", sublabel: "Three times a day" },
  { value: "1-1-1-1", label: "1-1-1-1", sublabel: "Four times a day" },
  { value: "SOS", label: "SOS", sublabel: "As needed" },
];

/**
 * The prescribing panel.
 *
 * The safety check runs as each line is ADDED, not on submit. That ordering is
 * the entire point of this phase: the doctor learns about the allergy while
 * the patient is still in the room and the order does not exist yet, rather
 * than after the pharmacist has already received it.
 */
export function PrescribePanel({ patientId, consultationId, disabled, onPrescribed }: Props) {
  const [lines, setLines] = useState<DraftLine[]>([]);
  /** Per-component, not module-level — two panels must not share a counter. */
  const nextLineId = useRef(0);
  const [search, setSearch] = useState("");
  /**
   * The last verdict, and the medicine set that produced it.
   *
   * Held together so a result is DISCARDED when the lines change, rather than
   * cleared from an effect — which both fights React and leaves a frame where
   * an alert for a removed medicine is still on screen.
   */
  const [safetyResult, setSafetyResult] = useState<{
    key: string;
    result: SafetyResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  /** The blocking alert currently on screen, and the line it belongs to. */
  const [blockingLineId, setBlockingLineId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: medicines, isLoading: searching } = useMedicineSearch(debouncedSearch);
  const check = useSafetyCheck();
  const create = useCreatePrescription();

  /**
   * Re-check whenever the set of medicines changes.
   *
   * Keyed on the medicine ids, so editing a dose does not re-run the check —
   * the allergy answer does not depend on the dose, and re-running would flash
   * the alert while somebody is typing into the field beneath it.
   */
  const medicineKey = lines.map((l) => l.medicine.id).join(",");

  const checkKey = `${patientId}|${medicineKey}`;

  useEffect(() => {
    if (lines.length === 0) return;

    let cancelled = false;
    check
      .mutateAsync({
        patientId,
        lines: lines.map((l) => ({ id: l.id, medicineId: l.medicine.id })),
      })
      .then((result) => {
        if (!cancelled) setSafetyResult({ key: checkKey, result });
      })
      .catch(() => {
        // A failed check must not stop a doctor prescribing. The server runs
        // the same check on save and will refuse there if it needs to — that
        // is the control, this is the early warning.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  // Only trust a verdict that was asked about the medicines currently listed.
  const safety =
    lines.length > 0 && safetyResult?.key === checkKey ? safetyResult.result : null;

  const addMedicine = (m: Medicine) => {
    nextLineId.current += 1;
    const id = `line-${nextLineId.current}`;
    setLines((prev) => [
      ...prev,
      {
        id,
        medicine: m,
        dose: m.defaultDose || "1",
        frequency: m.defaultFrequency || "1-0-1",
        durationDays: m.defaultDurationDays ? String(m.defaultDurationDays) : "5",
        instructions: "",
        overrideReason: "",
      },
    ]);
    setSearch("");
  };

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const patchLine = (id: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const resultFor = (lineId: string) =>
    safety?.lines.find((l) => l.lineId === lineId) ?? null;

  /** Lines the server will refuse without a reason, and which still lack one. */
  const unresolvedCritical = lines.filter((l) => {
    const r = resultFor(l.id);
    return r?.requiresOverrideReason && l.overrideReason.trim().length < 10;
  });

  const submit = async () => {
    setError(null);

    // Present the blocking alert rather than sending something that will be
    // refused. The dialog is where the reason gets typed.
    if (unresolvedCritical.length > 0) {
      setBlockingLineId(unresolvedCritical[0].id);
      return;
    }

    try {
      const { prescription } = await create.mutateAsync({
        patientId,
        consultationId,
        lines: lines.map((l) => ({
          medicineId: l.medicine.id,
          dose: l.dose,
          frequency: l.frequency,
          durationDays: l.durationDays ? Number(l.durationDays) : null,
          instructions: l.instructions || undefined,
          overrideReason: l.overrideReason || undefined,
        })),
        notes: notes.trim() || undefined,
      });
      setLines([]);
      setSafetyResult(null);
      setNotes("");
      onPrescribed?.(prescription.prescriptionNumber);
    } catch (err) {
      if (apiErrorCode(err) === "OVERRIDE_REASON_REQUIRED") {
        // The server refused. It re-ran the check and knows something this
        // screen did not — usually an allergy a colleague recorded in the last
        // few minutes.
        setBlockingLineId(unresolvedCritical[0]?.id ?? lines[0]?.id ?? null);
        return;
      }
      setError(apiErrorMessage(err, "Could not save this prescription"));
    }
  };

  const blockingLine = lines.find((l) => l.id === blockingLineId) ?? null;
  const blockingResult = blockingLineId ? resultFor(blockingLineId) : null;
  const blockingAlert = blockingResult?.alerts.find((a) => a.tier === "critical") ?? null;

  return (
    <Card>
      <SectionHeader
        title="Prescription"
        subtitle={disabled ? "This consultation is signed" : "Checked against allergies as you add"}
      />

      <VStack gap={14}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        {/*
          The gap alert. Raised because nobody has ASKED about allergies —
          separate from any finding about a drug, and true whatever is being
          prescribed.
        */}
        {safety?.allergyStatusAlert ? (
          <Banner
            tone="warning"
            title={safety.allergyStatusAlert.title}
            message={safety.allergyStatusAlert.message}
          />
        ) : null}

        {!disabled ? (
          <VStack gap={8}>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search a medicine by brand, salt or ingredient"
              testID="medicine-search"
            />
            {searching && debouncedSearch.length >= 2 ? (
              <Skeleton height={44} />
            ) : (medicines ?? []).length > 0 ? (
              <VStack gap={6}>
                {medicines!.slice(0, 6).map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.label}
                    subtitle={[m.genericName, m.drugClass].filter(Boolean).join(" · ")}
                    meta={m.schedule ? `Schedule ${m.schedule}` : undefined}
                    onPress={() => addMedicine(m)}
                    leading={<Pill size={16} color={palette.text.tertiary} strokeWidth={2} />}
                    showChevron
                  />
                ))}
              </VStack>
            ) : debouncedSearch.trim().length >= 2 ? (
              <Text variant="body-sm" tone="tertiary">
                Nothing in the formulary matches that.
              </Text>
            ) : null}
          </VStack>
        ) : null}

        {lines.length === 0 ? (
          <HStack gap={8} align="center">
            <Search size={15} color={palette.text.tertiary} strokeWidth={2} />
            <Text variant="body-sm" tone="tertiary">
              No medicines added yet.
            </Text>
          </HStack>
        ) : (
          <VStack gap={10}>
            {lines.map((line) => (
              <PrescriptionLineRow
                key={line.id}
                line={line}
                result={resultFor(line.id)}
                disabled={disabled}
                onChange={(patch) => patchLine(line.id, patch)}
                onRemove={() => removeLine(line.id)}
                onOpenAlert={() => setBlockingLineId(line.id)}
              />
            ))}
          </VStack>
        )}

        {lines.length > 0 && !disabled ? (
          <>
            <TextField
              label="Notes for the pharmacy"
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the pharmacist needs to know"
              multiline
            />
            <HStack gap={10} justify="flex-end" wrap>
              <Button
                label="Clear"
                variant="secondary"
                fullWidth={false}
                onPress={() => {
                  setLines([]);
                  setSafetyResult(null);
                }}
              />
              <Button
                label={
                  unresolvedCritical.length > 0
                    ? "Review the alert to continue"
                    : `Prescribe ${lines.length} medicine${lines.length === 1 ? "" : "s"}`
                }
                variant={unresolvedCritical.length > 0 ? "critical" : "primary"}
                fullWidth={false}
                loading={create.isPending}
                onPress={submit}
                testID="prescribe-submit"
              />
            </HStack>
          </>
        ) : null}
      </VStack>

      {/*
        The blocking alert.

        Everything about its presentation is decided by ClinicalAlert from the
        tier — this screen does not get to choose how interruptive it is. The
        override requires a typed reason, and the recommended action (cancel and
        review) is the primary button.
      */}
      <ClinicalAlert
        visible={Boolean(blockingAlert)}
        level="critical"
        title={blockingAlert?.title ?? ""}
        message={blockingAlert?.message ?? ""}
        details={blockingAlert?.details}
        recommendedLabel="Remove this medicine"
        overrideLabel="Prescribe anyway"
        source={
          blockingLine ? `Checked against this patient's recorded allergies · ${blockingLine.medicine.label}` : undefined
        }
        onRecommended={() => {
          if (blockingLineId) removeLine(blockingLineId);
          setBlockingLineId(null);
        }}
        onOverride={(reason) => {
          if (blockingLineId) patchLine(blockingLineId, { overrideReason: reason });
          setBlockingLineId(null);
        }}
      />
    </Card>
  );
}

function PrescriptionLineRow({
  line,
  result,
  disabled,
  onChange,
  onRemove,
  onOpenAlert,
}: {
  line: DraftLine;
  result: { highestTier: SafetyTier; requiresOverrideReason: boolean; alerts: SafetyAlert[] } | null;
  disabled?: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onOpenAlert: () => void;
}) {
  const tier = result?.highestTier ?? "normal";
  const hasAlerts = (result?.alerts.length ?? 0) > 0;
  const needsReason = result?.requiresOverrideReason && line.overrideReason.trim().length < 10;
  const overridden = result?.requiresOverrideReason && line.overrideReason.trim().length >= 10;

  const accent =
    tier === "critical"
      ? signal.critical.color
      : tier === "urgent"
        ? signal.urgent.color
        : tier === "caution"
          ? signal.caution.color
          : undefined;

  return (
    <View
      style={[
        styles.line,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
      ]}
      testID={`rx-line-${line.medicine.name}`}
    >
      <VStack gap={10}>
        <HStack gap={10} align="center" wrap>
          <VStack gap={2} flex={1} style={{ minWidth: 180 }}>
            <Text variant="label-lg" tone="primary">
              {line.medicine.label}
            </Text>
            {line.medicine.genericName ? (
              <Text variant="caption" tone="tertiary">
                {line.medicine.genericName}
              </Text>
            ) : null}
          </VStack>
          {hasAlerts ? (
            <SignalBadge
              level={tier === "normal" ? "caution" : tier}
              label={result!.alerts.length === 1 ? "1 alert" : `${result!.alerts.length} alerts`}
              size="sm"
            />
          ) : null}
          {!disabled ? (
            <Button
              label="Remove"
              variant="secondary"
              size="xs"
              fullWidth={false}
              icon={<Trash2 size={13} color={palette.text.primary} strokeWidth={2} />}
              onPress={onRemove}
            />
          ) : null}
        </HStack>

        {/*
          Non-blocking alerts are rendered INLINE. The tier decides: only
          `critical` interrupts, because an alert that stops the screen for a
          mild finding is one that teaches people to dismiss alerts unread.
        */}
        {hasAlerts ? (
          <VStack gap={6}>
            {result!.alerts.map((a, i) => (
              <View
                key={`${a.type}-${i}`}
                style={[
                  styles.alert,
                  {
                    backgroundColor:
                      a.tier === "critical"
                        ? signal.critical.bg
                        : a.tier === "urgent"
                          ? signal.urgent.bg
                          : signal.caution.bg,
                    borderColor:
                      a.tier === "critical"
                        ? signal.critical.border
                        : a.tier === "urgent"
                          ? signal.urgent.border
                          : signal.caution.border,
                  },
                ]}
              >
                <HStack gap={8} align="flex-start">
                  {a.tier === "critical" ? (
                    <TriangleAlert size={15} color={signal.critical.color} strokeWidth={2.4} />
                  ) : (
                    <ShieldAlert
                      size={15}
                      color={a.tier === "urgent" ? signal.urgent.color : signal.caution.color}
                      strokeWidth={2.2}
                    />
                  )}
                  <VStack gap={2} flex={1}>
                    <Text
                      variant="label"
                      weight="600"
                      style={{
                        color:
                          a.tier === "critical"
                            ? signal.critical.text
                            : a.tier === "urgent"
                              ? signal.urgent.text
                              : signal.caution.text,
                      }}
                    >
                      {a.title}
                    </Text>
                    <Text
                      variant="body-sm"
                      style={{
                        color:
                          a.tier === "critical"
                            ? signal.critical.text
                            : a.tier === "urgent"
                              ? signal.urgent.text
                              : signal.caution.text,
                      }}
                    >
                      {a.message}
                    </Text>
                  </VStack>
                </HStack>
              </View>
            ))}
          </VStack>
        ) : null}

        {needsReason ? (
          <Button
            label="Review this alert"
            variant="critical"
            size="sm"
            fullWidth={false}
            onPress={onOpenAlert}
            testID={`review-alert-${line.medicine.name}`}
          />
        ) : null}

        {overridden ? (
          <View style={styles.overrideBox}>
            <Text variant="caption" weight="600" style={{ color: signal.critical.text }}>
              Prescribing anyway — recorded reason
            </Text>
            <Text variant="body-sm" style={{ color: signal.critical.text }}>
              {line.overrideReason}
            </Text>
          </View>
        ) : null}

        {!disabled ? (
          <HStack gap={10} wrap>
            <View style={{ width: 110 }}>
              <TextField
                label="Dose"
                value={line.dose}
                onChangeText={(v) => onChange({ dose: v })}
                placeholder="1 tab"
              />
            </View>
            <View style={{ minWidth: 150, flex: 1 }}>
              <Select
                label="Frequency"
                value={line.frequency}
                options={FREQUENCIES}
                onChange={(v) => onChange({ frequency: v })}
              />
            </View>
            <View style={{ width: 110 }}>
              <TextField
                label="Days"
                value={line.durationDays}
                onChangeText={(v) => onChange({ durationDays: v })}
                numericField
                maxLength={3}
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <TextField
                label="Instructions"
                value={line.instructions}
                onChangeText={(v) => onChange({ instructions: v })}
                placeholder="After food"
              />
            </View>
          </HStack>
        ) : null}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
  alert: { padding: 9, borderRadius: radius.sm, borderWidth: 1 },
  overrideBox: {
    padding: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
    gap: 2,
  },
});
