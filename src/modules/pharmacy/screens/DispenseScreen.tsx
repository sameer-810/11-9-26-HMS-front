import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { OctagonAlert, Square, SquareCheck, CircleCheck, ShieldAlert } from "lucide-react-native";

import { palette, radius, signal, layout } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  TextField,
  Banner,
  Skeleton,
  ErrorState,
  SignalBadge,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime, formatRupees } from "@shared/format";
import { useDispenseContext, useDispense, useDispensings } from "@modules/pharmacy/hooks/usePharmacy";
import { StockStatusBadge, ExpiryBadge } from "@modules/inventory/components/StockBadges";
import { UrgencyBadge } from "@modules/laboratory/screens/LabQueueScreen";
import type { DispenseContext, DispenseLine, Dispensing } from "@modules/pharmacy/types";

/**
 * Dispense a prescription — Flow 1 step 11.
 *
 * ---------------------------------------------------------------------------
 * Order on the screen is the order of the checks
 * ---------------------------------------------------------------------------
 *   1. Who — the banner, pinned, allergies included.
 *   2. The allergy check, as it stands NOW — changes since prescribing, lines
 *      the prescriber never considered, overrides the prescriber recorded —
 *      and the acknowledgement.
 *   3. Each medicine: stock, and the batches, expired ones visible and locked.
 *   4. Confirm.
 *
 * ---------------------------------------------------------------------------
 * Why the form remounts when the allergy list changes
 * ---------------------------------------------------------------------------
 * The form is keyed on the allergy fingerprint. If a colleague records an
 * allergy while this screen is open, the server refuses the dispense, the
 * context reloads with a new fingerprint, and the form starts again — with the
 * acknowledgement UNTICKED. An acknowledgement carried across that change
 * would be an acknowledgement of a list the pharmacist never saw.
 */
export default function DispenseScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { prescriptionId } = (route.params ?? {}) as { prescriptionId: string };

  const { data: ctx, isLoading, isError, error, refetch, isRefetching } = useDispenseContext(prescriptionId);
  // Held here, above the keyed form, so a refusal's message survives the remount it causes.
  const dispense = useDispense(prescriptionId);
  const [done, setDone] = useState<Dispensing | null>(null);

  if (isLoading || !ctx) {
    return (
      <Screen title="Dispense">
        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <VStack gap={10}>
            <Skeleton height={100} />
            <Skeleton height={200} />
          </VStack>
        )}
      </Screen>
    );
  }

  const dispensedKey = ctx.lines.map((l) => `${l.id}:${l.dispensedQuantity}`).join("|");

  return (
    <Screen
      patient={ctx.patient}
      overline="Pharmacy"
      title={`Dispense ${ctx.prescription.prescriptionNumber}`}
      subtitle={`Prescribed by Dr ${ctx.prescription.doctor.fullName} · ${formatDateTime(ctx.prescription.createdAt)}`}
      right={<UrgencyBadge urgency={ctx.prescription.urgency} />}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="dispense-screen"
    >
      <VStack gap={14}>
        {done ? (
          <View testID="dispense-success">
            <Banner
              tone="success"
              title={`${done.dispenseNumber} dispensed`}
              message={done.lines
                .map((l) => `${l.quantity} × ${l.medicineName} (batch ${l.batches.map((b) => b.batchNumber).join(", ")})`)
                .join("; ")}
              action={<Button label="Back to the queue" size="sm" variant="secondary" onPress={() => navigation.navigate("PharmacyQueueList")} />}
            />
          </View>
        ) : null}

        {dispense.isError ? (
          <View testID="dispense-error">
            <Banner tone="danger" title="Not dispensed" message={apiErrorMessage(dispense.error)} />
          </View>
        ) : null}

        {!ctx.dispensable ? (
          <Banner
            tone="info"
            title={ctx.prescription.status === "cancelled" ? "Cancelled" : "Fully dispensed"}
            message={
              ctx.prescription.status === "cancelled"
                ? "The prescriber cancelled this prescription. Nothing more can be dispensed from it."
                : "Everything on this prescription has been handed over."
            }
          />
        ) : (
          <DispenseForm
            key={`${ctx.allergyFingerprint}-${dispensedKey}`}
            ctx={ctx}
            submitting={dispense.isPending}
            onSubmit={(body) =>
              dispense.mutate(body, {
                onSuccess: (data) => setDone(data.dispensing),
              })
            }
            onEdit={() => {
              if (dispense.isError) dispense.reset();
              if (done) setDone(null);
            }}
          />
        )}

        <DispensingHistory prescriptionId={prescriptionId} />
      </VStack>
    </Screen>
  );
}

type Quantities = Record<string, Record<string, string>>;

function DispenseForm({
  ctx,
  submitting,
  onSubmit,
  onEdit,
}: {
  ctx: DispenseContext;
  submitting: boolean;
  onSubmit: (body: Parameters<ReturnType<typeof useDispense>["mutate"]>[0]) => void;
  onEdit: () => void;
}) {
  const blocked = new Set(ctx.conflicts.blocked.map((c) => c.lineId));
  const open = (l: DispenseLine) => l.status === "pending" || l.status === "partially_dispensed";

  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Quantities>(() =>
    Object.fromEntries(
      ctx.lines.map((l) => [l.id, Object.fromEntries(l.suggested.allocations.map((a) => [a.batchId, String(a.quantity)]))]),
    ),
  );
  const [include, setInclude] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ctx.lines.map((l) => [l.id, open(l) && !blocked.has(l.id) && l.suggested.allocations.length > 0])),
  );

  const touch = () => onEdit();

  const lineState = ctx.lines.map((l) => {
    const entries = Object.entries(qty[l.id] ?? {});
    const problems: string[] = [];
    let total = 0;
    for (const [batchId, raw] of entries) {
      if (raw.trim() === "") continue;
      const n = Number(raw);
      const b = l.batches.find((x) => x.id === batchId);
      if (!Number.isInteger(n) || n < 0) problems.push("Whole numbers only.");
      else {
        total += n;
        if (b && n > b.quantityOnHand) problems.push(`Batch ${b.batchNumber} has only ${b.quantityOnHand}.`);
      }
    }
    if (l.remaining !== null && total > l.remaining) {
      problems.push(`Only ${l.remaining} remain on this prescription.`);
    }
    return { line: l, total, problems, included: Boolean(include[l.id]) && open(l) && !blocked.has(l.id) };
  });

  const chosen = lineState.filter((s) => s.included && s.total > 0);
  const hasProblems = lineState.some((s) => s.included && s.problems.length > 0);
  const total = chosen.reduce((sum, s) => sum + (s.line.item?.unitPrice ?? 0) * s.total, 0);
  const canConfirm = ack && chosen.length > 0 && !hasProblems;

  const submit = () =>
    onSubmit({
      allergiesAcknowledged: ack,
      allergyFingerprint: ctx.allergyFingerprint,
      note: note.trim() || undefined,
      lines: chosen.map((s) => ({
        lineId: s.line.id,
        allocations: Object.entries(qty[s.line.id])
          .filter(([, v]) => Number(v) > 0)
          .map(([batchId, v]) => ({ batchId, quantity: Number(v) })),
      })),
    });

  return (
    <VStack gap={14}>
      <AllergyCheck ctx={ctx} ack={ack} onAck={(v) => { setAck(v); touch(); }} note={note} onNote={setNote} />

      {lineState.map((s) => (
        <LineCard
          key={s.line.id}
          line={s.line}
          blockedReason={ctx.conflicts.blocked.find((c) => c.lineId === s.line.id)}
          doctorName={ctx.prescription.doctor.fullName}
          included={s.included}
          canInclude={open(s.line) && !blocked.has(s.line.id)}
          onInclude={(v) => { setInclude((m) => ({ ...m, [s.line.id]: v })); touch(); }}
          quantities={qty[s.line.id] ?? {}}
          onQuantity={(batchId, v) => {
            setQty((m) => ({ ...m, [s.line.id]: { ...(m[s.line.id] ?? {}), [batchId]: v } }));
            touch();
          }}
          total={s.total}
          problems={s.problems}
        />
      ))}

      <Card>
        <HStack gap={12} align="center" justify="space-between" wrap>
          <VStack gap={2}>
            <Text variant="label">
              {chosen.length ? `${chosen.length} medicine${chosen.length === 1 ? "" : "s"} to hand over` : "Nothing selected"}
            </Text>
            <Text variant="caption" tone="secondary" tabular>
              Charge {formatRupees(total)}
              {chosen.some((s) => s.line.item?.unitPrice === null) ? " · some items not priced" : ""}
            </Text>
            {!ack ? (
              <Text variant="caption" style={{ color: signal.caution.text }}>
                Confirm the allergy check above first.
              </Text>
            ) : null}
          </VStack>
          <Button label="Confirm dispense" onPress={submit} disabled={!canConfirm} loading={submitting} testID="dispense-confirm" />
        </HStack>
      </Card>
    </VStack>
  );
}

/** PH-03, with everything the pharmacist is confirming shown above the box they tick. */
function AllergyCheck({
  ctx,
  ack,
  onAck,
  note,
  onNote,
}: {
  ctx: DispenseContext;
  ack: boolean;
  onAck: (v: boolean) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const p = ctx.patient;
  const snapshot = ctx.prescription.allergySnapshot;

  return (
    <Card accentColor={ctx.conflicts.blocked.length || p.allergies.length ? signal.critical.color : undefined} testID="allergy-check">
      <VStack gap={12}>
        <SectionHeader title="Allergy check" subtitle="As recorded right now, not when this was prescribed" />

        {!p.allergiesRecorded ? (
          <HStack gap={8} align="center">
            <ShieldAlert size={16} color={signal.caution.text} />
            <Text variant="label" style={{ color: signal.caution.text }}>
              Allergies have never been recorded for this patient. Ask them before handing anything over.
            </Text>
          </HStack>
        ) : p.allergies.length === 0 ? (
          <Text variant="label" style={{ color: signal.normal.text }}>
            No known allergies
          </Text>
        ) : (
          <HStack gap={8} wrap testID="allergy-list">
            {p.allergies.map((a) => (
              <SignalBadge
                key={a.substance}
                level={a.severity === "anaphylaxis" || a.severity === "severe" ? "critical" : "urgent"}
                label={`${a.substance} · ${a.severity}`}
                size="sm"
              />
            ))}
          </HStack>
        )}

        {ctx.allergiesChangedSinceWritten ? (
          <View testID="allergies-changed">
            <Banner
              tone="warning"
              title="Changed since this was prescribed"
              message={`Dr ${ctx.prescription.doctor.fullName} was working from: ${
                !ctx.prescription.allergiesWereRecorded
                  ? "allergies not recorded"
                  : snapshot.length
                    ? snapshot.map((a) => `${a.substance} (${a.severity})`).join(", ")
                    : "no known allergies"
              }.`}
            />
          </View>
        ) : null}

        {ctx.conflicts.acknowledged.map((c) => (
          <View key={`${c.lineId}-${c.substance}`} style={styles.override} testID="prescriber-override">
            <Text variant="label">
              {c.medicineName}: {c.title}
            </Text>
            <Text variant="body-sm">
              The prescriber saw this and went ahead: “{c.overrideReason}”{c.overriddenByName ? ` — ${c.overriddenByName}` : ""}
            </Text>
          </View>
        ))}

        <Pressable
          onPress={() => onAck(!ack)}
          style={[styles.ack, ack ? styles.ackOn : null]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ack }}
          testID="dispense-ack"
        >
          {ack ? <SquareCheck size={22} color={palette.text.accent} /> : <Square size={22} color={palette.text.tertiary} />}
          <Text variant="label" style={{ flex: 1 }}>
            I have checked these allergies{ctx.conflicts.acknowledged.length ? " and the prescriber's reasons" : ""} with the patient
          </Text>
        </Pressable>

        <TextField label="Note (optional)" value={note} onChangeText={onNote} placeholder="What the patient told you" testID="dispense-note" />
      </VStack>
    </Card>
  );
}

function LineCard({
  line,
  blockedReason,
  doctorName,
  included,
  canInclude,
  onInclude,
  quantities,
  onQuantity,
  total,
  problems,
}: {
  line: DispenseLine;
  blockedReason?: { substance: string; message: string };
  doctorName: string;
  included: boolean;
  canInclude: boolean;
  onInclude: (v: boolean) => void;
  quantities: Record<string, string>;
  onQuantity: (batchId: string, v: string) => void;
  total: number;
  problems: string[];
}) {
  const finished = line.status === "dispensed" || line.status === "cancelled";

  return (
    <Card accentColor={blockedReason ? signal.critical.color : undefined} testID={`dispense-line-${line.medicineName}`}>
      <VStack gap={10}>
        <HStack gap={10} align="center" justify="space-between" wrap>
          <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
            <Text variant="label-lg">
              {line.medicineName} {line.strength}
            </Text>
            <Text variant="body-sm" tone="secondary">
              {line.dose} · {line.frequency}
              {line.durationDays ? ` · ${line.durationDays} days` : ""} · {line.route}
              {line.instructions ? ` · ${line.instructions}` : ""}
            </Text>
            <Text variant="caption" tone="tertiary">
              {line.status === "cancelled"
                ? "Cancelled by the prescriber"
                : line.status === "dispensed"
                  ? `Fully dispensed (${line.dispensedQuantity})`
                  : line.remaining === null
                    ? "As needed — enter the quantity to hand over"
                    : `${line.remaining} of ${line.quantity} still to dispense`}
            </Text>
          </VStack>
          {!finished ? <StockStatusBadge status={line.stock.status} label={line.stock.label} /> : null}
        </HStack>

        {line.stock.note ? (
          <Text variant="caption" tone="secondary">
            {line.stock.note}
          </Text>
        ) : null}

        {blockedReason ? (
          <View style={styles.blocked} testID={`dispense-blocked-${line.medicineName}`}>
            <HStack gap={8} align="flex-start">
              <OctagonAlert size={18} color={signal.critical.text} />
              <VStack gap={2} style={{ flex: 1 }}>
                <Text variant="label" style={{ color: signal.critical.text }}>
                  Cannot be dispensed: {blockedReason.substance} allergy
                </Text>
                <Text variant="body-sm">
                  This allergy was not considered when Dr {doctorName} prescribed it. Contact the prescriber — only they can change or confirm it.
                </Text>
              </VStack>
            </HStack>
          </View>
        ) : null}

        {!finished && canInclude ? (
          <>
            <Pressable
              onPress={() => onInclude(!included)}
              style={styles.include}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: included }}
              testID={`dispense-include-${line.medicineName}`}
            >
              {included ? <SquareCheck size={20} color={palette.text.accent} /> : <Square size={20} color={palette.text.tertiary} />}
              <Text variant="label-sm">Hand this over now</Text>
            </Pressable>

            {included ? (
              <VStack gap={0}>
                {line.batches.length === 0 ? (
                  <Text variant="caption" tone="tertiary">
                    No batches in the pharmacy.
                  </Text>
                ) : (
                  line.batches.map((b) => (
                    <View key={b.id} style={[styles.batch, !b.selectable ? styles.batchLocked : null]} testID={`batch-${b.batchNumber}`}>
                      <HStack gap={10} align="center" wrap>
                        <VStack gap={2} style={{ flex: 1, minWidth: 180 }}>
                          <Text variant="label-sm" tabular>
                            Batch {b.batchNumber}
                          </Text>
                          <HStack gap={6} align="center" wrap>
                            <ExpiryBadge status={b.expiryStatus} date={b.expiryDate} days={b.daysToExpiry} />
                            <Text variant="caption" tone="tertiary">
                              {b.quantityOnHand} on hand
                            </Text>
                          </HStack>
                          {b.expiresBeforeCourseEnds ? (
                            <Text variant="caption" style={{ color: signal.caution.text }}>
                              Expires before this course ends
                            </Text>
                          ) : null}
                        </VStack>
                        <View style={styles.qty}>
                          {b.selectable ? (
                            <TextField
                              label="Quantity"
                              numericField
                              value={quantities[b.id] ?? ""}
                              onChangeText={(v) => onQuantity(b.id, v)}
                              testID={`qty-${b.batchNumber}`}
                            />
                          ) : (
                            <Text variant="caption" style={{ color: signal.critical.text }} testID={`locked-${b.batchNumber}`}>
                              {b.expiryStatus === "expired" ? "Expired — cannot be selected" : "Empty"}
                            </Text>
                          )}
                        </View>
                      </HStack>
                    </View>
                  ))
                )}
                <HStack gap={8} align="center" style={{ marginTop: 6 }}>
                  <Text variant="caption" tone="secondary" tabular>
                    Handing over {total}
                    {line.item?.unit ? ` ${line.item.unit}${total === 1 ? "" : "s"}` : ""}
                    {line.item?.unitPrice !== null && line.item ? ` · ${formatRupees(total * (line.item.unitPrice ?? 0))}` : " · not priced"}
                  </Text>
                </HStack>
                {problems.map((p, i) => (
                  <Text key={i} variant="caption" style={{ color: signal.urgent.text }}>
                    {p}
                  </Text>
                ))}
              </VStack>
            ) : null}
          </>
        ) : null}
      </VStack>
    </Card>
  );
}

function DispensingHistory({ prescriptionId }: { prescriptionId: string }) {
  const { data = [] } = useDispensings(prescriptionId);
  if (data.length === 0) return null;
  return (
    <Card testID="dispensing-history">
      <SectionHeader title="Already handed over" />
      <VStack gap={10}>
        {data.map((d) => (
          <VStack key={d.id} gap={3}>
            <HStack gap={6} align="center">
              <CircleCheck size={14} color={signal.normal.text} />
              <Text variant="label-sm">
                {d.dispenseNumber} · {formatDateTime(d.dispensedAt)} · {d.dispensedByName}
              </Text>
            </HStack>
            {d.lines.map((l) => (
              <Text key={l.id} variant="caption" tone="secondary">
                {l.quantity} × {l.medicineName} — {l.batches.map((b) => `${b.batchNumber} (exp ${b.expiryDate})`).join(", ")}
              </Text>
            ))}
          </VStack>
        ))}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  override: {
    padding: 10,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: signal.caution.border,
    backgroundColor: signal.caution.bg,
  },
  ack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.minTouchTarget,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
  },
  ackOn: { borderColor: palette.border.focus, backgroundColor: palette.surface.secondary },
  include: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: layout.minTouchTarget },
  blocked: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
  },
  batch: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.border.subtle },
  batchLocked: { opacity: 0.8 },
  qty: { width: 140 },
});
