import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius, signal } from "@shared/designSystem";
import { Text, HStack, VStack, Card, Button, TextField, Select, Banner, SignalBadge } from "@shared/ui";
import { useHandovers, useSubmitHandover, useReceiveHandover } from "@modules/inpatient/hooks/useInpatient";
import type { Shift, Handover } from "@modules/inpatient/types";


/**
 * NU-05: SBAR shift handover form and history.
 * Four separate required fields so the Recommendation is not dropped; unreceived handovers stay flagged.
 */
const SHIFTS: { value: Shift; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

const PROMPTS = {
  situation: "Why is this patient here right now? One or two sentences.",
  background: "What led to this? Relevant history, what has been done so far.",
  assessment: "What do you think is going on? Your clinical judgement, not just numbers.",
  recommendation: "What does the next shift need to DO? Be specific and name the times.",
} as const;

interface Props {
  admissionId: string;
  /** Prefilled when the ward knows the current shift. */
  defaultFrom?: Shift;
  defaultTo?: Shift;
}

export function SbarPanel({ admissionId, defaultFrom = "morning", defaultTo = "evening" }: Props) {
  const { data: handovers } = useHandovers(admissionId);
  const submit = useSubmitHandover();
  const receive = useReceiveHandover();

  const [open, setOpen] = useState(false);
  const [fromShift, setFromShift] = useState<Shift>(defaultFrom);
  const [toShift, setToShift] = useState<Shift>(defaultTo);
  const [situation, setSituation] = useState("");
  const [background, setBackground] = useState("");
  const [assessment, setAssessment] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [tasks, setTasks] = useState("");
  const [alerts, setAlerts] = useState("");

  const parts = { situation, background, assessment, recommendation };
  const incomplete = Object.entries(parts)
    .filter(([, v]) => v.trim().length < 5)
    .map(([k]) => k);

  const send = async () => {
    await submit.mutateAsync({
      admissionId,
      fromShift,
      toShift,
      situation: situation.trim(),
      background: background.trim(),
      assessment: assessment.trim(),
      recommendation: recommendation.trim(),
      outstandingTasks: splitLines(tasks),
      alerts: splitLines(alerts),
    });
    setSituation("");
    setBackground("");
    setAssessment("");
    setRecommendation("");
    setTasks("");
    setAlerts("");
    setOpen(false);
  };

  const outstanding = (handovers ?? []).filter((h) => h.outstanding);

  return (
    <VStack gap={12} testID="sbar-panel">
      {outstanding.map((h) => (
        <View key={h.id} style={styles.outstanding} testID={`handover-outstanding-${h.id}`}>
          <VStack gap={8}>
            <HStack gap={8} align="center" wrap>
              <SignalBadge level="caution" label="Handover not yet received" size="sm" />
              <Text variant="caption" tone="secondary">
                {h.fromShift} → {h.toShift}, given by {h.givenBy}
              </Text>
            </HStack>
            <Text variant="body-sm">{h.recommendation}</Text>
            <Button
              label="I have taken this handover"
              size="sm"
              onPress={() => receive.mutate(h.id)}
              disabled={receive.isPending}
              testID={`receive-handover-${h.id}`}
            />
          </VStack>
        </View>
      ))}

      {open ? (
        <Card testID="sbar-form">
          <VStack gap={12}>
            <Text variant="h4">Shift handover</Text>

            <HStack gap={10}>
              <View style={{ flex: 1 }}>
                <Select
                  label="From shift"
                  value={fromShift}
                  options={SHIFTS}
                  onChange={(v) => setFromShift(v as Shift)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Select
                  label="To shift"
                  value={toShift}
                  options={SHIFTS}
                  onChange={(v) => setToShift(v as Shift)}
                />
              </View>
            </HStack>

            <TextField
              label="S — Situation"
              hint={PROMPTS.situation}
              value={situation}
              onChangeText={setSituation}
              multiline
              testID="sbar-situation"
            />
            <TextField
              label="B — Background"
              hint={PROMPTS.background}
              value={background}
              onChangeText={setBackground}
              multiline
              testID="sbar-background"
            />
            <TextField
              label="A — Assessment"
              hint={PROMPTS.assessment}
              value={assessment}
              onChangeText={setAssessment}
              multiline
              testID="sbar-assessment"
            />
            <TextField
              label="R — Recommendation"
              hint={PROMPTS.recommendation}
              value={recommendation}
              onChangeText={setRecommendation}
              multiline
              testID="sbar-recommendation"
            />

            <TextField
              label="Outstanding tasks"
              hint="One per line. These are the things that get lost at 8am."
              value={tasks}
              onChangeText={setTasks}
              multiline
              testID="sbar-tasks"
            />
            <TextField
              label="Alerts"
              hint="One per line. Poor IV access, falls risk, family expecting a call."
              value={alerts}
              onChangeText={setAlerts}
              multiline
              testID="sbar-alerts"
            />

            {incomplete.length > 0 ? (
              <Banner
                tone="warning"
                title="SBAR is not complete"
                message={`Still needed: ${incomplete.join(", ")}. The recommendation is the part that gets left out, and it is the part the next shift acts on.`}
              />
            ) : null}

            <HStack gap={8}>
              <Button
                label={submit.isPending ? "Sending…" : "Give handover"}
                onPress={send}
                disabled={incomplete.length > 0 || submit.isPending}
                testID="sbar-submit"
              />
              <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
            </HStack>
          </VStack>
        </Card>
      ) : (
        <Button
          label="Give shift handover"
          variant="secondary"
          onPress={() => setOpen(true)}
          testID="sbar-open"
        />
      )}

      {(handovers ?? []).length > 0 ? (
        <Card>
          <VStack gap={10}>
            <Text variant="overline" tone="secondary">
              Previous handovers
            </Text>
            {(handovers ?? []).map((h) => (
              <HandoverEntry key={h.id} handover={h} />
            ))}
          </VStack>
        </Card>
      ) : null}
    </VStack>
  );
}

function HandoverEntry({ handover: h }: { handover: Handover }) {
  return (
    <View style={styles.entry}>
      <VStack gap={6}>
        <HStack gap={8} align="center" wrap>
          <Text variant="label">
            {h.fromShift} → {h.toShift}
          </Text>
          {h.bandAtHandover ? (
            <SignalBadge
              level={h.bandAtHandover.tier}
              label={`NEWS ${h.news2AtHandover} at handover`}
              size="sm"
            />
          ) : null}
          <Text variant="caption" tone="tertiary">
            {h.givenBy}
            {h.receivedBy ? ` → ${h.receivedBy}` : " · not yet received"}
          </Text>
        </HStack>
        <Line label="S" text={h.situation} />
        <Line label="B" text={h.background} />
        <Line label="A" text={h.assessment} />
        <Line label="R" text={h.recommendation} />
        {h.outstandingTasks.length > 0 ? (
          <VStack gap={2}>
            <Text variant="caption" weight="600" tone="secondary">
              Outstanding
            </Text>
            {h.outstandingTasks.map((t, i) => (
              <Text key={i} variant="caption" tone="secondary">
                • {t}
              </Text>
            ))}
          </VStack>
        ) : null}
        {h.alerts.length > 0 ? (
          <View style={styles.alerts}>
            {h.alerts.map((a, i) => (
              <Text key={i} variant="caption" style={{ color: signal.caution.text }}>
                ⚠ {a}
              </Text>
            ))}
          </View>
        ) : null}
      </VStack>
    </View>
  );
}

function Line({ label, text }: { label: string; text: string }) {
  return (
    <HStack gap={8} align="flex-start">
      <View style={styles.letter}>
        <Text variant="label-sm" tone="secondary">
          {label}
        </Text>
      </View>
      <Text variant="body-sm" style={{ flex: 1 }}>
        {text}
      </Text>
    </HStack>
  );
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const styles = StyleSheet.create({
  outstanding: {
    borderWidth: 1,
    borderColor: signal.caution.border,
    backgroundColor: signal.caution.bg,
    borderRadius: radius.md,
    padding: 12,
  },
  entry: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
  letter: {
    width: 18,
    alignItems: "center",
  },
  alerts: {
    gap: 2,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: signal.caution.bg,
  },
});
