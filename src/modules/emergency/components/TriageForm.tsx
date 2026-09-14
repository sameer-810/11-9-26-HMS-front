import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";

import { palette, radius } from "@shared/designSystem";
import { Text, VStack, HStack, Card, Button, TextField, Banner, SectionHeader, Skeleton } from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { useEsiPreview, useTriage } from "@modules/emergency/hooks/useEmergency";
import { EsiBadge } from "@modules/emergency/components/EsiBadge";
import { ChoiceChips, YesNo } from "@modules/emergency/components/Choices";
import type { EdMeta, EdVisit, EsiAnswers, EsiPreviewBody, EsiVitals, VitalKey } from "@modules/emergency/types";

/** The server's validation ranges. Outside them a reading is a typo, not a patient. */
const VITALS: { key: VitalKey; label: string; suffix: string; min: number; max: number }[] = [
  { key: "pulse", label: "Pulse", suffix: "/min", min: 20, max: 300 },
  { key: "respiratoryRate", label: "Respiratory rate", suffix: "/min", min: 2, max: 90 },
  { key: "spo2", label: "SpO₂", suffix: "%", min: 20, max: 100 },
  { key: "systolic", label: "Systolic BP", suffix: "mmHg", min: 30, max: 300 },
  { key: "temperatureC", label: "Temperature", suffix: "°C", min: 25, max: 45 },
  { key: "painScore", label: "Pain score", suffix: "/10", min: 0, max: 10 },
];

const EMPTY_VITALS: Record<VitalKey, string> = {
  pulse: "",
  respiratoryRate: "",
  spo2: "",
  systolic: "",
  temperatureC: "",
  painScore: "",
};

function parseVital(raw: string, min: number, max: number): { value: number | null; invalid: boolean } {
  if (raw.trim() === "") return { value: null, invalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

interface Props {
  visit: EdVisit;
  meta: EdMeta;
  onSaved: (message: string) => void;
}

/**
 * ESI v4 triage, asked in the handbook's order.
 *
 * Each decision point only appears once the one before it has not settled the
 * level — a patient who needs intubating does not need their resources counted.
 * Hidden answers are sent as "no", so what is recorded is what the nurse saw.
 *
 * The screen never computes the level. It shows the server's preview, and on
 * save either accepts the server's own computation (no level sent) or sends a
 * different level with the reason for it.
 */
export function TriageForm({ visit, meta, onSaved }: Props) {
  const prior = visit.triage;

  // Answers carry over into a re-triage: usually one thing has changed. Vital
  // signs do not — a pulse from an hour ago saved as a new reading is a false record.
  const [lifeSaving, setLifeSaving] = useState(Boolean(prior?.answers.lifeSavingIntervention));
  const [highRisk, setHighRisk] = useState(Boolean(prior?.answers.highRisk));
  const [altered, setAltered] = useState(Boolean(prior?.answers.alteredMentalStatus));
  const [severe, setSevere] = useState(Boolean(prior?.answers.severePainOrDistress));
  const [resources, setResources] = useState<string[]>(prior?.answers.expectedResources ?? []);
  const [vitalText, setVitalText] = useState<Record<VitalKey, string>>(EMPTY_VITALS);

  /** null = accept whatever the algorithm suggests. */
  const [chosenLevel, setChosenLevel] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const triage = useTriage(visit.id);

  const parsed = VITALS.map((f) => ({ ...f, ...parseVital(vitalText[f.key], f.min, f.max) }));
  const anyInvalid = parsed.some((p) => p.invalid);
  const vitals: EsiVitals = {};
  for (const p of parsed) if (p.value !== null) vitals[p.key] = p.value;

  const pain = vitals.painScore ?? null;
  const showB = !lifeSaving;
  // Pain of 7 or more is severe pain under decision B whether or not the box was ticked.
  const bSettles = showB && (highRisk || altered || severe || (pain !== null && pain >= 7));
  const showC = showB && !bSettles;
  const resourceWeight = resources.reduce((n, k) => n + (meta.resources.find((r) => r.key === k)?.weight ?? 0), 0);

  const answers: EsiAnswers = {
    lifeSavingIntervention: lifeSaving,
    highRisk: showB ? highRisk : false,
    alteredMentalStatus: showB ? altered : false,
    severePainOrDistress: showB ? severe : false,
    expectedResources: showC ? resources : [],
  };

  // Sent so the danger zone uses the paediatric limits when the patient is a child.
  const body: EsiPreviewBody = { patientId: visit.patient.id, answers, vitals };

  // Debounced as a string: the object is rebuilt every render, and debouncing
  // its identity would re-arm the timer forever.
  const bodyKey = JSON.stringify(body);
  const settledKey = useDebouncedValue(bodyKey, 400);
  const previewBody = useMemo(() => JSON.parse(settledKey) as EsiPreviewBody, [settledKey]);
  const preview = useEsiPreview(previewBody, true);
  const suggestion = preview.data;
  const previewCurrent = bodyKey === settledKey && !preview.isFetching && Boolean(suggestion);

  const effectiveLevel = chosenLevel ?? suggestion?.level ?? null;
  const isOverride = Boolean(suggestion && chosenLevel !== null && chosenLevel !== suggestion.level);
  const reasonShort = overrideReason.trim().length < 10;

  const canSave = previewCurrent && !anyInvalid && !(isOverride && reasonShort);

  const levelLabel = (n: number) => meta.levels.find((l) => l.level === n)?.label ?? "";

  const toggleResource = (key: string) =>
    setResources((r) => (r.includes(key) ? r.filter((k) => k !== key) : [...r, key]));

  const save = () =>
    triage.mutate(
      {
        answers,
        vitals,
        ...(isOverride && chosenLevel !== null ? { esiLevel: chosenLevel, overrideReason: overrideReason.trim() } : {}),
      },
      {
        onSuccess: (saved) => {
          setChosenLevel(null);
          setOverrideReason("");
          onSaved(
            saved.esiLevel === saved.suggestion.level
              ? `Triaged ESI ${saved.esiLevel} (${saved.esiLabel}).`
              : `Triaged ESI ${saved.esiLevel} (${saved.esiLabel}) — the algorithm suggested ESI ${saved.suggestion.level}.`,
          );
        },
      },
    );

  return (
    <Card testID="triage-form">
      <VStack gap={16}>
        <SectionHeader
          title={prior ? "Re-triage" : "Triage"}
          subtitle="Emergency Severity Index v4 — answer in order"
        />

        {/* ---- A ---- */}
        <Step letter="A" title="Life-saving intervention">
          <YesNo
            question="Does this patient need an immediate life-saving intervention?"
            hint="Airway, breathing, circulation support, emergency medication — now, not soon."
            value={lifeSaving}
            onChange={setLifeSaving}
            testIDPrefix="triage-q-lifesaving"
          />
        </Step>

        {/* ---- B ---- */}
        {showB ? (
          <Step letter="B" title="Should this patient not wait?">
            <VStack gap={12}>
              <YesNo
                question="High-risk situation?"
                hint="Chest pain suggesting ACS, stroke signs, suicidal intent, a presentation that could deteriorate fast."
                value={highRisk}
                onChange={setHighRisk}
                testIDPrefix="triage-q-highrisk"
              />
              <YesNo
                question="New confusion, lethargy or disorientation?"
                value={altered}
                onChange={setAltered}
                testIDPrefix="triage-q-altered"
              />
              <YesNo
                question="Severe pain or distress?"
                hint="A pain score of 7 or more counts, whether or not this is ticked."
                value={severe}
                onChange={setSevere}
                testIDPrefix="triage-q-pain"
              />
              <VitalField
                field={parsed.find((p) => p.key === "painScore")!}
                value={vitalText.painScore}
                onChange={(v) => setVitalText((s) => ({ ...s, painScore: v }))}
              />
            </VStack>
          </Step>
        ) : (
          <SkippedNote text="Decision A settles the level. B to D are not asked." />
        )}

        {/* ---- C ---- */}
        {showC ? (
          <Step letter="C" title="How many different resources?">
            <VStack gap={8}>
              <Text variant="caption" tone="tertiary">
                Counted by category, not by test. History, examination, oral medication, simple dressings and splints are not
                resources.
              </Text>
              <ChoiceChips
                multi
                options={meta.resources.map((r) => ({ key: r.key, label: r.weight > 1 ? `${r.label} (counts ${r.weight})` : r.label }))}
                isSelected={(k) => resources.includes(k)}
                onPress={toggleResource}
                testIDPrefix="triage-resource"
              />
            </VStack>
          </Step>
        ) : showB ? (
          <SkippedNote text="Decision B settles the level. Resources are not counted." />
        ) : null}

        {/* ---- D ---- */}
        <Step letter="D" title="Vital signs">
          <VStack gap={8}>
            <Text variant="caption" tone="tertiary">
              {showC && resourceWeight >= 2
                ? "Two or more resources: danger-zone vital signs will suggest ESI 2."
                : "Recorded with the triage. The danger zone only changes the level when two or more resources are expected."}
            </Text>
            <HStack gap={10} wrap>
              {parsed
                .filter((p) => p.key !== "painScore")
                .map((p) => (
                  <VitalField
                    key={p.key}
                    field={p}
                    value={vitalText[p.key]}
                    onChange={(v) => setVitalText((s) => ({ ...s, [p.key]: v }))}
                  />
                ))}
            </HStack>
          </VStack>
        </Step>

        {/* ---- Suggestion ---- */}
        <View testID="triage-preview" style={styles.preview}>
          {preview.isError ? (
            <Text variant="body-sm" tone="danger">
              {apiErrorMessage(preview.error, "Could not compute a suggestion")}
            </Text>
          ) : !suggestion ? (
            <Skeleton width="60%" height={18} />
          ) : (
            <VStack gap={6}>
              <HStack gap={10} align="center" wrap>
                <Text variant="label" tone="secondary">
                  Algorithm suggests
                </Text>
                <EsiBadge level={suggestion.level} label={levelLabel(suggestion.level)} testID="triage-preview-level" />
                <Text variant="caption" tone="tertiary">
                  {previewCurrent ? `Settled at decision ${suggestion.decisionPoint}` : "Updating…"}
                </Text>
              </HStack>
              {suggestion.reasons.map((r) => (
                <Text key={r} variant="body-sm" tone="secondary">
                  • {r}
                </Text>
              ))}
            </VStack>
          )}
        </View>

        {/* ---- Decision ---- */}
        <VStack gap={10}>
          <HStack gap={10} align="center" wrap>
            <Button
              label={suggestion ? `Accept ESI ${suggestion.level}` : "Accept suggestion"}
              variant={isOverride ? "secondary" : "primary"}
              size="sm"
              fullWidth={false}
              disabled={!suggestion}
              onPress={() => {
                setChosenLevel(null);
                setOverrideReason("");
              }}
              testID="triage-accept"
            />
            <Text variant="caption" tone="tertiary">
              or set a different level:
            </Text>
          </HStack>
          <ChoiceChips
            options={[1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `ESI ${n}` }))}
            isSelected={(k) => effectiveLevel === Number(k)}
            onPress={(k) => setChosenLevel(Number(k))}
            testIDPrefix="triage-level"
            disabled={!suggestion}
          />
          {isOverride && suggestion && chosenLevel !== null ? (
            <TextField
              label={`Why ESI ${chosenLevel} and not ESI ${suggestion.level}?`}
              required
              multiline
              value={overrideReason}
              onChangeText={setOverrideReason}
              hint="At least 10 characters. Recorded beside the suggested level."
              error={overrideReason.length > 0 && reasonShort ? "Say a little more — at least 10 characters." : undefined}
              testID="triage-override-reason"
            />
          ) : null}
        </VStack>

        {triage.isError ? (
          <Banner tone="danger" title="Triage not saved" message={apiErrorMessage(triage.error)} />
        ) : null}

        <Button
          label="Save triage"
          onPress={save}
          loading={triage.isPending}
          disabled={!canSave}
          testID="triage-save"
        />
      </VStack>
    </Card>
  );
}

function Step({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <HStack gap={12} align="flex-start">
      <View style={styles.letter}>
        <Text variant="label" weight="600" style={{ color: palette.clinical[700] }}>
          {letter}
        </Text>
      </View>
      <VStack gap={8} flex={1}>
        <Text variant="h4" tone="primary">
          {title}
        </Text>
        {children}
      </VStack>
    </HStack>
  );
}

function SkippedNote({ text }: { text: string }) {
  return (
    <Text variant="caption" tone="tertiary" style={{ marginLeft: 40 }}>
      {text}
    </Text>
  );
}

function VitalField({
  field,
  value,
  onChange,
}: {
  field: { key: VitalKey; label: string; suffix: string; min: number; max: number; invalid: boolean };
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      label={field.label}
      suffix={field.suffix}
      numericField
      value={value}
      onChangeText={onChange}
      error={field.invalid ? `${field.min}–${field.max}` : undefined}
      containerStyle={{ flex: 1, minWidth: 130, maxWidth: 220 }}
      testID={`triage-vital-${field.key}`}
    />
  );
}

const styles = StyleSheet.create({
  letter: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: palette.clinical[50],
    borderWidth: 1,
    borderColor: palette.clinical[200],
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
});
