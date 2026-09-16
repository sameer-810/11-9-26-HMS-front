import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { palette, radius, signal, layout } from "@shared/designSystem";
import { Text, HStack, VStack, TextField, Button, Card, Banner } from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { News2Score } from "./News2Score";
import { useRecordObservation } from "@modules/inpatient/hooks/useInpatient";
import type { Consciousness, News2Result, Observation } from "@modules/inpatient/types";
import { calculateNews2, type LocalNews2Result } from "@shared/clinical/news2";


/**
 * NU-02 observation set. No escalate checkbox or Scale 2 toggle by design: the server
 * decides escalation, and Scale 2 is prescribed. A stated concern escalates on its own.
 */
const ACVPU: { value: Consciousness; label: string; hint: string }[] = [
  { value: "alert", label: "Alert", hint: "Awake, oriented" },
  { value: "confusion", label: "Confusion", hint: "New confusion" },
  { value: "voice", label: "Voice", hint: "Responds to voice" },
  { value: "pain", label: "Pain", hint: "Responds to pain" },
  { value: "unresponsive", label: "Unresponsive", hint: "No response" },
];

interface Props {
  admissionId: string;
  /** For the offline queue's label — "Observations · Sanjay Case". */
  patientName?: string;
  useScale2?: boolean;
  onRecorded?: (observation: Observation) => void;
}

type Draft = Record<string, string>;

/** Blank is missing, never zero: `Number("")` is 0 and would score an unmeasured parameter. */
function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ObservationForm({ admissionId, patientName, useScale2, onRecorded }: Props) {
  const [draft, setDraft] = useState<Draft>({});
  const [consciousness, setConsciousness] = useState<Consciousness | "">("");
  const [onOxygen, setOnOxygen] = useState<boolean | null>(null);
  const [concern, setConcern] = useState("");
  const [result, setResult] = useState<Observation | null>(null);
  /** A set kept on this device, scored here, not yet seen by the server. */
  const [queued, setQueued] = useState<{ local: LocalNews2Result; concern: boolean } | null>(null);

  const record = useRecordObservation();
  const set = (key: string) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));

  /** Missing NEWS2 parameters, shown while typing so the nurse can complete the set. */
  const missing = useMemo(() => {
    const out: string[] = [];
    if (num(draft.respiratoryRate) === null) out.push("respiratory rate");
    if (num(draft.spo2) === null) out.push("oxygen saturation");
    if (onOxygen === null) out.push("air or oxygen");
    if (num(draft.systolic) === null) out.push("blood pressure");
    if (num(draft.pulse) === null) out.push("pulse");
    if (!consciousness) out.push("consciousness");
    if (num(draft.temperatureC) === null) out.push("temperature");
    return out;
  }, [draft, onOxygen, consciousness]);

  const submit = async () => {
    const body = {
      admissionId,
      respiratoryRate: num(draft.respiratoryRate),
      spo2: num(draft.spo2),
      onOxygen,
      oxygenLitresPerMin: num(draft.oxygenLitresPerMin),
      oxygenDevice: draft.oxygenDevice || undefined,
      systolic: num(draft.systolic),
      diastolic: num(draft.diastolic),
      pulse: num(draft.pulse),
      consciousness: consciousness || null,
      temperatureC: num(draft.temperatureC),
      painScore: num(draft.painScore),
      bloodSugar: num(draft.bloodSugar),
      urineOutputMl: num(draft.urineOutputMl),
      clinicalConcern: concern.trim() || undefined,
    };
    const outcome = await record.mutateAsync({
      ...body,
      label: patientName ? `Observations · ${patientName}` : "Observations",
    });

    if (outcome.status === "sent") {
      setResult(outcome.data);
      setQueued(null);
      onRecorded?.(outcome.data);
    } else {
      setResult(null);
      setQueued({ local: calculateNews2({ ...body, useScale2 }), concern: Boolean(body.clinicalConcern) });
    }
    setDraft({});
    setConsciousness("");
    setOnOxygen(null);
    setConcern("");
  };

  const queuedWorrying =
    queued &&
    (queued.concern ||
      (queued.local.complete && (queued.local.band?.tier === "urgent" || queued.local.band?.tier === "critical")));

  return (
    <VStack gap={16}>
      { /* Queued offline: say it is unsent, show the local score, and if worrying, escalate in person. */ }
      {queued ? (
        <VStack gap={8} testID="observation-queued">
          <Banner
            tone="warning"
            title="Saved on this device — not yet sent"
            message="There is no connection to the hospital server. These observations will be sent automatically, in the order they were charted, when it returns."
          />
          <News2Score result={{ ...queued.local, delta: null, significantRise: false } as News2Result} size="lg" showResponse />
          <Text variant="caption" tone="tertiary">
            Score worked out on this device. The server scores the set again when it arrives, and that is the score filed.
          </Text>
          {queuedWorrying ? (
            <View testID="observation-queued-escalate">
              <Banner
                tone="danger"
                title="Escalate in person now"
                message={
                  queued.local.complete && queued.local.band && queued.local.band.tier !== "normal" && queued.local.band.tier !== "caution"
                    ? `NEWS2 ${queued.local.total} — ${queued.local.band.label}. The escalation board will not see this until the connection returns. ${queued.local.band.response}`
                    : "You recorded a concern. The escalation board will not see it until the connection returns — tell the nurse in charge or the doctor directly."
                }
              />
            </View>
          ) : null}
        </VStack>
      ) : null}

      {result ? (
        <VStack gap={8} testID="observation-result">
          <News2Score result={result.news2} size="lg" showResponse />
          {result.escalation.required ? (
            <View testID="escalation-banner">
              <Banner
                tone="danger"
                title="This patient has been escalated"
                message={result.escalation.reason}
              />
            </View>
          ) : null}
        </VStack>
      ) : null}

      <Card>
        <VStack gap={14}>
          <Text variant="h4">Observations</Text>
          {useScale2 ? (
            <Banner
              tone="info"
              title="NEWS2 Scale 2 is prescribed for this patient"
              message="Oxygen saturations are scored on the hypercapnic respiratory failure scale. A high saturation on oxygen scores as abnormal."
            />
          ) : null}

          <View style={styles.grid}>
            <Field
              label="Respiratory rate"
              unit="/min"
              value={draft.respiratoryRate}
              onChange={set("respiratoryRate")}
              testID="obs-respiratoryRate"
            />
            <Field
              label="SpO₂"
              unit="%"
              value={draft.spo2}
              onChange={set("spo2")}
              testID="obs-spo2"
            />
            <Field
              label="Systolic BP"
              unit="mmHg"
              value={draft.systolic}
              onChange={set("systolic")}
              testID="obs-systolic"
            />
            <Field
              label="Diastolic BP"
              unit="mmHg"
              value={draft.diastolic}
              onChange={set("diastolic")}
              testID="obs-diastolic"
            />
            <Field
              label="Pulse"
              unit="bpm"
              value={draft.pulse}
              onChange={set("pulse")}
              testID="obs-pulse"
            />
            <Field
              label="Temperature"
              unit="°C"
              value={draft.temperatureC}
              onChange={set("temperatureC")}
              testID="obs-temperatureC"
            />
          </View>

          { /* Air/oxygen starts unanswered: defaulting to air would under-score oxygen patients. */ }
          <VStack gap={6}>
            <Text variant="label">Air or oxygen</Text>
            <HStack gap={8}>
              <Choice
                label="Breathing air"
                selected={onOxygen === false}
                onPress={() => setOnOxygen(false)}
                testID="obs-air"
              />
              <Choice
                label="On oxygen"
                selected={onOxygen === true}
                onPress={() => setOnOxygen(true)}
                tone="urgent"
                testID="obs-oxygen"
              />
            </HStack>
            {onOxygen ? (
              <HStack gap={10}>
                <Field
                  label="Flow rate"
                  unit="L/min"
                  value={draft.oxygenLitresPerMin}
                  onChange={set("oxygenLitresPerMin")}
                  testID="obs-o2flow"
                />
                <Field
                  label="Device"
                  value={draft.oxygenDevice}
                  onChange={set("oxygenDevice")}
                  keyboard="default"
                  testID="obs-o2device"
                />
              </HStack>
            ) : null}
          </VStack>

          <VStack gap={6}>
            <Text variant="label">Consciousness (ACVPU)</Text>
            <HStack gap={8} wrap>
              {ACVPU.map((c) => (
                <Choice
                  key={c.value}
                  label={c.label}
                  hint={c.hint}
                  selected={consciousness === c.value}
                  onPress={() => setConsciousness(c.value)}
                  tone={c.value === "alert" ? "normal" : "critical"}
                  testID={`obs-acvpu-${c.value}`}
                />
              ))}
            </HStack>
          </VStack>

          <View style={styles.grid}>
            <Field
              label="Pain score"
              unit="0–10"
              value={draft.painScore}
              onChange={set("painScore")}
              testID="obs-painScore"
            />
            <Field
              label="Blood sugar"
              unit="mg/dL"
              value={draft.bloodSugar}
              onChange={set("bloodSugar")}
              testID="obs-bloodSugar"
            />
            <Field
              label="Urine output"
              unit="mL"
              value={draft.urineOutputMl}
              onChange={set("urineOutputMl")}
              testID="obs-urineOutputMl"
            />
          </View>

          <TextField
            label="Are you concerned about this patient?"
            placeholder="Anything that worries you, even if the numbers look fine"
            hint="A stated concern escalates on its own, whatever the score says."
            value={concern}
            onChangeText={setConcern}
            multiline
            testID="obs-concern"
          />

          {missing.length > 0 ? (
            <View style={styles.missing} testID="obs-missing">
              <Text variant="caption" tone="secondary">
                {missing.length === 7
                  ? "NEWS2 needs all seven parameters."
                  : `Still needed for a NEWS2 score: ${missing.join(", ")}.`}
              </Text>
              <Text variant="caption" tone="secondary">
                An incomplete set is still recorded — it just will not be given a
                score, because a partial score would be read as a whole one.
              </Text>
            </View>
          ) : null}

          {record.isError ? (
            <Banner
              tone="danger"
              title="Not recorded"
              message={
                (record.error as { response?: { data?: { error?: { message?: string } } } })
                  ?.response?.data?.error?.message ?? "Something went wrong. Try again."
              }
            />
          ) : null}

          <Button
            label={record.isPending ? "Recording…" : "Record observations"}
            onPress={submit}
            disabled={record.isPending}
            testID="obs-submit"
          />
        </VStack>
      </Card>
    </VStack>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  keyboard = "decimal-pad",
  testID,
}: {
  label: string;
  unit?: string;
  value?: string;
  onChange: (v: string) => void;
  keyboard?: "decimal-pad" | "default";
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <TextField
        label={label}
        suffix={unit}
        numericField={keyboard === "decimal-pad"}
        value={value ?? ""}
        onChangeText={onChange}
        testID={testID}
      />
    </View>
  );
}

function Choice({
  label,
  hint,
  selected,
  onPress,
  tone = "normal",
  testID,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  tone?: "normal" | "urgent" | "critical";
  testID?: string;
}) {
  const s = signal[tone];
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      {...checkable(selected, onPress)}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={[
        styles.choice,
        selected ? { borderColor: s.border, backgroundColor: s.bg } : null,
      ]}
    >
      <Text variant="label" style={selected ? { color: s.text } : undefined}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  field: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: 140,
  },
  choice: {
    minHeight: layout.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.raised,
  },
  missing: {
    gap: 4,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface.sunken,
  },
});
