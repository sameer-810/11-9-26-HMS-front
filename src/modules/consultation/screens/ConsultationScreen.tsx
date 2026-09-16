import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRoute } from "@react-navigation/native";
import {
  Lock,
  FileSignature,
  TriangleAlert,
  ShieldAlert,
  History,
  Plus,
  Check,
} from "lucide-react-native";

import { palette, radius, signal, layout } from "@shared/designSystem";
import { checkable } from "@shared/ui/a11y";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  TextField,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
  SignalBadge,
  VitalTile,
  useBreakpoint,
} from "@shared/ui";
import { apiErrorMessage, apiErrorCode, apiErrorDetails } from "@api/apiClient";
import {
  BreakGlassPrompt,
  EmergencyAccessBanner,
} from "@modules/consultation/components/BreakGlassPrompt";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { usePatientBanner } from "@modules/patient/hooks/usePatients";
import {
  useConsultation,
  useClinicalContext,
  useUpdateConsultation,
  useSignConsultation,
  useAddAddendum,
} from "@modules/consultation/hooks/useConsultation";
import { PrescribePanel } from "@modules/consultation/components/PrescribePanel";
import { OrderTestsPanel } from "@modules/laboratory/components/OrderTestsPanel";
import { LabFlagGlyph } from "@modules/laboratory/components/LabFlag";
import { formatDateTime } from "@shared/format";
import type { Diagnosis, RestrictedDetails } from "@modules/consultation/types";

/**
 * Consultation workspace: history loads with the screen (OP-01); the note is a draft
 * until signed, then read-only with addenda (OP-06).
 */
export default function ConsultationScreen() {
  const route = useRoute<any>();
  const { id, patientId: routePatientId } = (route.params ?? {}) as {
    id?: string;
    patientId?: string;
  };

  const { isWide } = useBreakpoint();
  const {
    data: consultation,
    isLoading,
    isError,
    error,
    refetch,
  } = useConsultation(id);

  const patientId =
    routePatientId ?? (consultation?.patient as { id: string })?.id;
  const { data: banner } = usePatientBanner(patientId);
  const {
    data: context,
    error: contextError,
    refetch: refetchContext,
  } = useClinicalContext(patientId);
  const restricted =
    apiErrorCode(contextError) === "RECORD_RESTRICTED"
      ? apiErrorDetails<RestrictedDetails>(contextError)
      : undefined;

  const [signOpen, setSignOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastPrescription, setLastPrescription] = useState<string | null>(null);
  const [lastLabOrder, setLastLabOrder] = useState<string | null>(null);
  const sign = useSignConsultation(id ?? "");
  const flushRef = useRef<(() => Promise<string | null>) | null>(null);

  const doSign = async () => {
    setSaveError(null);
    try {
      const blocked = await flushRef.current?.();
      if (blocked) {
        setSignOpen(false);
        setSaveError(blocked);
        return;
      }
      await sign.mutateAsync();
      setSignOpen(false);
    } catch (err) {
      setSignOpen(false);
      setSaveError(apiErrorMessage(err, "Could not sign this consultation"));
    }
  };

  if (isLoading || !consultation) {
    return (
      <Screen title="Consultation" patient={banner ?? undefined}>
        {isError ? (
          <ErrorState
            error={error}
            title="Couldn't open this consultation"
            onRetry={refetch}
          />
        ) : (
          <VStack gap={12}>
            <Skeleton width="40%" height={20} />
            <Card>
              <VStack gap={10}>
                <Skeleton width="90%" height={12} />
                <Skeleton width="70%" height={12} />
              </VStack>
            </Card>
          </VStack>
        )}
      </Screen>
    );
  }

  const signed = consultation.isSigned;

  return (
    <Screen
      // Screen pins the banner outside the scroll view.
      patient={banner ?? undefined}
      overline="Clinical"
      title={signed ? "Consultation (signed)" : "Consultation"}
      subtitle={`${consultation.consultationNumber} · ${formatDateTime(consultation.createdAt)}`}
      testID="consultation-screen"
      right={
        signed ? (
          <HStack gap={6} align="center">
            <Lock size={15} color={palette.text.tertiary} strokeWidth={2} />
            <Text variant="label-sm" tone="tertiary">
              Signed by {consultation.signedByName}
            </Text>
          </HStack>
        ) : (
          <Button
            label="Sign consultation"
            fullWidth={false}
            testID="sign-consultation"
            icon={<FileSignature size={16} color="#FFFFFF" strokeWidth={2.1} />}
            onPress={() => setSignOpen(true)}
          />
        )
      }
    >
      <VStack gap={16}>
        {saveError ? (
          <Banner
            tone="danger"
            message={saveError}
            onDismiss={() => setSaveError(null)}
          />
        ) : null}

        {lastPrescription ? (
          <Banner
            tone="success"
            title="Prescription sent to the pharmacy"
            message={`${lastPrescription} is now in the pharmacy queue.`}
            onDismiss={() => setLastPrescription(null)}
          />
        ) : null}

        {signed ? (
          <Banner
            tone="info"
            title="This note is permanent"
            message="A signed consultation cannot be edited. Anything to add or correct is recorded as a note beside it."
          />
        ) : null}

        {/* OP-01 — the history, before anything is written. */}
        {restricted && patientId ? (
          <BreakGlassPrompt
            patientId={patientId}
            details={restricted}
            compact
          />
        ) : (
          <VStack gap={10}>
            {context?.access?.viaBreakGlass && context.access.expiresAt ? (
              <EmergencyAccessBanner
                expiresAt={context.access.expiresAt}
                onExpired={refetchContext}
              />
            ) : null}
            <HistoryPanel context={context} compact={!isWide} />
          </VStack>
        )}

        <ConsultationForm
          consultation={consultation}
          disabled={signed}
          onError={setSaveError}
          flushRef={flushRef}
        />

        {patientId ? (
          <PrescribePanel
            patientId={patientId}
            consultationId={consultation.id}
            disabled={signed}
            onPrescribed={(rx) => {
              setSaveError(null);
              setLastPrescription(rx);
            }}
          />
        ) : null}

        {lastLabOrder ? (
          <Banner
            tone="success"
            title="Sent to the laboratory"
            message={`${lastLabOrder} is in the laboratory queue.`}
            onDismiss={() => setLastLabOrder(null)}
          />
        ) : null}

        {/* LB-01, from the consultation. Flow 1 step 9: "request reaches laboratory". */}
        {patientId ? (
          <OrderTestsPanel
            patientId={patientId}
            consultationId={consultation.id}
            disabled={signed}
            onOrdered={setLastLabOrder}
          />
        ) : null}

        {signed ? (
          <AddendaPanel
            consultationId={consultation.id}
            consultation={consultation}
          />
        ) : null}
      </VStack>

      <ConfirmDialog
        visible={signOpen}
        title="Sign this consultation?"
        message="Once signed it becomes part of the permanent record and cannot be edited. Corrections after this point are recorded as separate notes."
        confirmLabel="Sign it"
        cancelLabel="Keep editing"
        loading={sign.isPending}
        onConfirm={doSign}
        onCancel={() => setSignOpen(false)}
      />
    </Screen>
  );
}

/** OP-01 history panel, allergies first. */
function HistoryPanel({
  context,
  compact,
}: {
  context: ReturnType<typeof useClinicalContext>["data"];
  compact: boolean;
}) {
  if (!context) {
    return (
      <Card>
        <VStack gap={8}>
          <Skeleton width="30%" height={13} />
          <Skeleton width="80%" height={12} />
        </VStack>
      </Card>
    );
  }

  const severe = context.allergies.filter(
    (a) => a.severity === "severe" || a.severity === "anaphylaxis",
  );

  return (
    <Card accentColor={severe.length ? signal.critical.color : undefined}>
      <SectionHeader
        title="History"
        subtitle="What is already known about this patient"
        right={
          <History size={16} color={palette.text.tertiary} strokeWidth={2} />
        }
      />

      <VStack gap={14}>
        <View>
          {!context.allergiesRecorded ? (
            <HStack gap={8} align="center">
              <ShieldAlert
                size={16}
                color={palette.warning.text}
                strokeWidth={2.2}
              />
              <Text
                variant="label"
                weight="600"
                style={{ color: palette.warning.text }}
              >
                Allergies not recorded — ask before prescribing
              </Text>
            </HStack>
          ) : context.allergies.length === 0 ? (
            <Text
              variant="label"
              weight="600"
              style={{ color: signal.normal.text }}
            >
              No known allergies
            </Text>
          ) : (
            <VStack gap={6}>
              <HStack gap={7} align="center">
                <TriangleAlert
                  size={15}
                  color={signal.critical.color}
                  strokeWidth={2.4}
                />
                <Text
                  variant="label"
                  weight="600"
                  style={{ color: signal.critical.text }}
                >
                  Allergies
                </Text>
              </HStack>
              <HStack gap={8} wrap>
                {context.allergies.map((a) => (
                  <SignalBadge
                    key={a.substance}
                    level={
                      a.severity === "anaphylaxis" || a.severity === "severe"
                        ? "critical"
                        : a.severity === "moderate"
                          ? "urgent"
                          : "caution"
                    }
                    label={`${a.substance} · ${a.severity}`}
                    size="sm"
                  />
                ))}
              </HStack>
            </VStack>
          )}
        </View>

        {context.chronicConditions.length > 0 ? (
          <VStack gap={4}>
            <Text variant="label-sm" tone="tertiary">
              Ongoing conditions
            </Text>
            <Text variant="body-sm" tone="primary">
              {context.chronicConditions.join(" · ")}
            </Text>
          </VStack>
        ) : null}

        {context.diagnosisHistory.length > 0 ? (
          <VStack gap={4}>
            <Text variant="label-sm" tone="tertiary">
              Previously diagnosed
            </Text>
            <VStack gap={3}>
              {context.diagnosisHistory.slice(0, compact ? 3 : 6).map((d) => (
                <Text key={d.description} variant="body-sm" tone="secondary">
                  {d.description}
                  {d.code ? ` (${d.code})` : ""}
                  {d.occurrences > 1 ? ` · ${d.occurrences} times` : ""}
                </Text>
              ))}
            </VStack>
          </VStack>
        ) : null}

        {context.recentPrescriptions.length > 0 ? (
          <VStack gap={4}>
            <Text variant="label-sm" tone="tertiary">
              Recent medication
            </Text>
            <VStack gap={3}>
              {context.recentPrescriptions.slice(0, 3).map((p) => (
                <Text
                  key={p.id}
                  variant="body-sm"
                  tone="secondary"
                  numberOfLines={1}
                >
                  {p.lines.map((l) => l.medicineName).join(", ")}
                </Text>
              ))}
            </VStack>
          </VStack>
        ) : null}

        {/* Recent results with abnormal values named, to avoid duplicate orders. */}
        {context.recentLabResults?.length ? (
          <VStack gap={4} testID="history-lab-results">
            <Text variant="label-sm" tone="tertiary">
              Recent laboratory results
            </Text>
            <VStack gap={4}>
              {context.recentLabResults.slice(0, compact ? 3 : 5).map((r) => {
                const flagged = r.results.filter((x) => x.isAbnormal);
                return (
                  <HStack key={r.id} gap={8} align="center" wrap>
                    <Text variant="body-sm" tone="secondary">
                      {r.testName} · {formatDateTime(r.reportedAt)}
                    </Text>
                    {flagged.length === 0 ? (
                      <Text variant="caption" tone="tertiary">
                        within range
                      </Text>
                    ) : (
                      flagged.slice(0, 4).map((x) => (
                        <HStack key={x.code} gap={3} align="center">
                          <Text
                            variant="caption"
                            tabular
                            style={{
                              color: x.isCritical
                                ? signal.critical.text
                                : signal.urgent.text,
                            }}
                          >
                            {x.name} {x.valueText}
                          </Text>
                          <LabFlagGlyph flag={x.flag} />
                        </HStack>
                      ))
                    )}
                  </HStack>
                );
              })}
            </VStack>
          </VStack>
        ) : null}

        {context.pendingLabOrders?.length ? (
          <Text variant="body-sm" tone="secondary" testID="history-lab-pending">
            Awaiting results:{" "}
            {context.pendingLabOrders.map((o) => o.testName).join(", ")}
          </Text>
        ) : null}

        {context.recentConsultations.length === 0 ? (
          <Text variant="body-sm" tone="tertiary">
            No previous consultations on file — this is a first visit.
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

/** The note, autosaved as a draft while typing; autosave stops once signed. */
function ConsultationForm({
  consultation,
  disabled,
  onError,
  flushRef,
}: {
  consultation: NonNullable<ReturnType<typeof useConsultation>["data"]>;
  disabled: boolean;
  onError: (msg: string | null) => void;
  /** Set by the form: saves pending edits, or returns why the note cannot be signed yet. */
  flushRef?: React.MutableRefObject<(() => Promise<string | null>) | null>;
}) {
  const update = useUpdateConsultation(consultation.id);

  const [chiefComplaint, setChiefComplaint] = useState(
    consultation.chiefComplaint,
  );
  const [history, setHistory] = useState(consultation.historyOfPresentIllness);
  const [examination, setExamination] = useState(consultation.examination);
  const [plan, setPlan] = useState(consultation.treatmentPlan);
  const [advice, setAdvice] = useState(consultation.advice);
  const [diagnosisText, setDiagnosisText] = useState("");
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(
    consultation.diagnoses,
  );
  const [vitals, setVitals] = useState(consultation.vitals ?? {});
  const [recommendAdmission, setRecommendAdmission] = useState(
    consultation.admissionRecommended,
  );
  const [admissionReason, setAdmissionReason] = useState(
    consultation.admissionReason,
  );
  const [reasonTouched, setReasonTouched] = useState(false);

  const draft = JSON.stringify({
    chiefComplaint,
    history,
    examination,
    plan,
    advice,
    recommendAdmission,
    admissionReason,
  });
  const debounced = useDebouncedValue(draft, 900);
  const lastSaved = useRef(draft);

  const save = async (snapshot: string) => {
    const parsed = JSON.parse(snapshot);
    const reason = String(parsed.admissionReason ?? "").trim();
    await update.mutateAsync({
      chiefComplaint: parsed.chiefComplaint,
      historyOfPresentIllness: parsed.history,
      examination: parsed.examination,
      treatmentPlan: parsed.plan,
      advice: parsed.advice,
      // A recommendation only reaches the admission desk with a reason attached.
      admissionRecommended: Boolean(parsed.recommendAdmission) && reason !== "",
      admissionReason: parsed.recommendAdmission ? reason : "",
    });
    lastSaved.current = snapshot;
  };

  useEffect(() => {
    if (disabled || debounced === lastSaved.current) return;
    save(debounced)
      .then(() => onError(null))
      .catch((err) => onError(apiErrorMessage(err, "Could not save the note")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, disabled]);

  // Signing must not race the autosave, or the last few words (or the admission reason) are lost.
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      if (recommendAdmission && !admissionReason.trim()) {
        setReasonTouched(true);
        return "Say why this patient should be admitted, or untick Recommend admission.";
      }
      if (draft !== lastSaved.current) await save(draft);
      return null;
    };
  });

  const addDiagnosis = async () => {
    const text = diagnosisText.trim();
    if (!text) return;
    const next = [
      ...diagnoses,
      {
        description: text,
        type: "provisional" as const,
        isPrimary: diagnoses.length === 0,
      },
    ];
    setDiagnoses(next);
    setDiagnosisText("");
    try {
      await update.mutateAsync({ diagnoses: next });
    } catch (err) {
      onError(apiErrorMessage(err, "Could not save the diagnosis"));
    }
  };

  const setVital = async (key: string, value: string) => {
    const n = value === "" ? null : Number(value);
    const next = { ...vitals, [key]: n };
    setVitals(next);
    try {
      await update.mutateAsync({ vitals: next });
    } catch (err) {
      onError(apiErrorMessage(err, "Could not save that reading"));
    }
  };

  return (
    <>
      <Card>
        <SectionHeader
          title="This visit"
          subtitle={disabled ? undefined : "Saved as you type"}
          right={
            disabled ? undefined : update.isPending ? (
              <Text variant="caption" tone="tertiary">
                Saving…
              </Text>
            ) : undefined
          }
        />
        <VStack gap={14}>
          <TextField
            label="Why they came"
            value={chiefComplaint}
            onChangeText={setChiefComplaint}
            editable={!disabled}
            multiline
            placeholder="Fever and sore throat for three days"
            testID="cc-field"
          />
          <TextField
            label="History"
            value={history}
            onChangeText={setHistory}
            editable={!disabled}
            multiline
            placeholder="Onset, progression, associated symptoms"
          />
          <TextField
            label="Examination"
            value={examination}
            onChangeText={setExamination}
            editable={!disabled}
            multiline
            placeholder="What you found"
            testID="exam-field"
          />
        </VStack>
      </Card>

      <Card>
        <SectionHeader title="Vitals" subtitle="Taken at this consultation" />
        <HStack gap={10} wrap>
          <VitalField
            label="Temp"
            unit="°C"
            value={vitals.temperatureC}
            onSave={(v) => setVital("temperatureC", v)}
            disabled={disabled}
          />
          <VitalField
            label="Pulse"
            unit="/min"
            value={vitals.pulse}
            onSave={(v) => setVital("pulse", v)}
            disabled={disabled}
          />
          <VitalField
            label="Systolic"
            unit="mmHg"
            value={vitals.systolic}
            onSave={(v) => setVital("systolic", v)}
            disabled={disabled}
          />
          <VitalField
            label="Diastolic"
            unit="mmHg"
            value={vitals.diastolic}
            onSave={(v) => setVital("diastolic", v)}
            disabled={disabled}
          />
          <VitalField
            label="SpO₂"
            unit="%"
            value={vitals.spo2}
            onSave={(v) => setVital("spo2", v)}
            disabled={disabled}
          />
          <VitalField
            label="Weight"
            unit="kg"
            value={vitals.weightKg}
            onSave={(v) => setVital("weightKg", v)}
            disabled={disabled}
          />
        </HStack>
      </Card>

      <Card>
        <SectionHeader title="Diagnosis" />
        <VStack gap={12}>
          {diagnoses.length > 0 ? (
            <VStack gap={6}>
              {diagnoses.map((d, i) => (
                <HStack key={`${d.description}-${i}`} gap={8} align="center">
                  <View style={styles.dxDot} />
                  <Text variant="body" tone="primary" style={{ flex: 1 }}>
                    {d.description}
                    {d.code ? ` (${d.code})` : ""}
                  </Text>
                  {d.isPrimary ? (
                    <Text variant="caption" tone="tertiary">
                      primary
                    </Text>
                  ) : null}
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text variant="body-sm" tone="tertiary">
              No diagnosis recorded yet.
            </Text>
          )}

          {!disabled ? (
            <HStack gap={8} align="flex-end">
              <View style={{ flex: 1 }}>
                <TextField
                  label="Add a diagnosis"
                  value={diagnosisText}
                  onChangeText={setDiagnosisText}
                  placeholder="Acute pharyngitis"
                  onSubmitEditing={addDiagnosis}
                  testID="dx-field"
                />
              </View>
              <Button
                label="Add"
                variant="secondary"
                fullWidth={false}
                icon={
                  <Plus
                    size={14}
                    color={palette.text.primary}
                    strokeWidth={2.2}
                  />
                }
                onPress={addDiagnosis}
                testID="dx-add"
              />
            </HStack>
          ) : null}
        </VStack>
      </Card>

      <Card>
        <SectionHeader title="Plan and advice" />
        <VStack gap={14}>
          <TextField
            label="Treatment plan"
            value={plan}
            onChangeText={setPlan}
            editable={!disabled}
            multiline
            placeholder="What you are doing about it"
          />
          <TextField
            label="Advice to the patient"
            value={advice}
            onChangeText={setAdvice}
            editable={!disabled}
            multiline
            placeholder="Rest, fluids, return if worse"
          />
          {disabled ? null : (
            <VStack gap={10} testID="recommend-admission-section">
              <Pressable
                onPress={() => setRecommendAdmission((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityLabel="Recommend admission"
                accessibilityHint="Adds this patient to the admission desk's list of patients waiting for a bed when you sign"
                accessibilityState={{ checked: recommendAdmission }}
                {...checkable(recommendAdmission, () =>
                  setRecommendAdmission((v) => !v),
                )}
                testID="recommend-admission"
                style={styles.checkRow}
              >
                <View
                  style={[
                    styles.checkBox,
                    recommendAdmission ? styles.checkBoxOn : null,
                  ]}
                >
                  {recommendAdmission ? (
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  ) : null}
                </View>
                <VStack gap={1} flex={1}>
                  <Text variant="label" tone="primary">
                    Recommend admission
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    Once you sign, the patient appears on the ward&apos;s
                    &quot;waiting for a bed&quot; list.
                  </Text>
                </VStack>
              </Pressable>
              {recommendAdmission ? (
                <TextField
                  label="Why should they be admitted?"
                  required
                  value={admissionReason}
                  onChangeText={setAdmissionReason}
                  onBlur={() => setReasonTouched(true)}
                  multiline
                  placeholder="Needs IV antibiotics and oxygen; not safe to go home"
                  hint="The admitting team reads this when they find a bed."
                  error={
                    reasonTouched && !admissionReason.trim()
                      ? "Say why, so the ward knows what the bed is for."
                      : undefined
                  }
                  testID="admission-reason"
                />
              ) : null}
            </VStack>
          )}
          {disabled && consultation.admissionRecommended ? (
            <View testID="admission-recommended-banner">
              <Banner
                tone="warning"
                title="Admission recommended"
                message={
                  consultation.admissionReason ||
                  "This patient should be admitted."
                }
              />
            </View>
          ) : null}
        </VStack>
      </Card>
    </>
  );
}

function VitalField({
  label,
  unit,
  value,
  onSave,
  disabled,
}: {
  label: string;
  unit: string;
  value: number | null | undefined;
  onSave: (v: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(
    value === null || value === undefined ? "" : String(value),
  );

  if (disabled) {
    return (
      <VitalTile label={label} value={value ?? null} unit={unit} compact />
    );
  }

  return (
    <View style={{ width: 128 }}>
      <TextField
        label={label}
        value={text}
        onChangeText={setText}
        onBlur={() => onSave(text)}
        numericField
        suffix={unit}
      />
    </View>
  );
}

/** OP-06: corrections after signing live here, beside the original. */
function AddendaPanel({
  consultationId,
  consultation,
}: {
  consultationId: string;
  consultation: NonNullable<ReturnType<typeof useConsultation>["data"]>;
}) {
  const add = useAddAddendum(consultationId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (text.trim().length < 10) return;
    setError(null);
    try {
      await add.mutateAsync({ text: text.trim(), reason: "clarification" });
      setText("");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not add that note"));
    }
  };

  return (
    <Card>
      <SectionHeader
        title="Notes added since signing"
        subtitle="The original stays exactly as it was signed"
      />
      <VStack gap={12}>
        {error ? <Banner tone="danger" message={error} /> : null}

        {consultation.addenda.length === 0 ? (
          <Text variant="body-sm" tone="tertiary">
            Nothing added.
          </Text>
        ) : (
          <VStack gap={10}>
            {consultation.addenda.map((a) => (
              <View key={a.id} style={styles.addendum}>
                <Text variant="body-sm" tone="primary">
                  {a.text}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {a.authorName} · {formatDateTime(a.createdAt)} ·{" "}
                  {a.reason.replace("_", " ")}
                </Text>
              </View>
            ))}
          </VStack>
        )}

        <TextField
          label="Add a note"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="What is being corrected or added, and why"
          hint="This is appended beside the original. Nothing above is changed."
          testID="addendum-field"
        />
        <HStack justify="flex-end">
          <Button
            label="Add note"
            variant="secondary"
            fullWidth={false}
            disabled={text.trim().length < 10}
            loading={add.isPending}
            onPress={submit}
            testID="addendum-submit"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.minTouchTarget,
    paddingVertical: 4,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: palette.border.strong,
    backgroundColor: palette.surface.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: {
    backgroundColor: palette.clinical[600],
    borderColor: palette.clinical[600],
  },
  dxDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.clinical[600],
  },
  addendum: {
    padding: 10,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.clinical[300],
    backgroundColor: palette.surface.secondary,
    gap: 4,
  },
});
