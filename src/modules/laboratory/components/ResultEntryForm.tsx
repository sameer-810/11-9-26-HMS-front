import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { palette, radius, signal, layout } from "@shared/designSystem";
import { Text, HStack, VStack, Card, SectionHeader, TextField, Button, Banner } from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { apiErrorMessage } from "@api/apiClient";
import { useSaveResults } from "@modules/laboratory/hooks/useLaboratory";
import { LabFlagGlyph, previewFlag, flagPresentation } from "./LabFlag";
import type { LabOrder, LabEntryParameter } from "@modules/laboratory/types";

/**
 * LB-04: entering results against reference ranges.
 *
 * Each field shows the range for THIS patient — sex and age applied — with the
 * basis stated, and a flag that appears as the value is typed. The flag that
 * is saved is the server's; the one on screen exists so a technician sees a
 * potassium of 6.9 turn critical before they press save rather than after.
 *
 * Mount with a `key` that changes when the server's results change. The form
 * then starts from what was saved, without copying server state into local
 * state inside an effect.
 *
 * The confirmation banners after a save are derived from the SAVED ORDER, not
 * held in local state. They were held in state once, and the remount that a
 * save causes threw them away — so the technician typed a critical potassium,
 * pressed save, and the server's confirmation vanished before it was read.
 */
export function ResultEntryForm({ order }: { order: LabOrder }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.results.map((r) => [r.code, r.valueText])),
  );
  const [comment, setComment] = useState(order.labComment || "");
  const [edited, setEdited] = useState(false);
  const save = useSaveResults(order.id);

  const setValue = (code: string, v: string) => {
    setValues((s) => ({ ...s, [code]: v }));
    setEdited(true);
  };

  const invalid = order.parameters.filter((p) => previewFlag(p, values[p.code] ?? "") === "invalid");

  // What the server said about the last save, read from the order itself.
  const saved = Boolean(order.resultsEnteredAt) && !edited;
  const critical = order.results.filter((r) => r.isCritical).map((r) => r.name);
  const entered = new Set(order.results.map((r) => r.code));
  const missing = order.parameters.filter((p) => p.required && !entered.has(p.code)).map((p) => p.name);

  return (
    <Card testID="result-entry">
      <VStack gap={14}>
        <SectionHeader title="Enter results" subtitle="Ranges shown are for this patient's age and sex" />

        {order.parameters.map((p) => (
          <ParameterField
            key={p.code}
            parameter={p}
            value={values[p.code] ?? ""}
            onChange={(v) => setValue(p.code, v)}
          />
        ))}

        <TextField
          label="Laboratory comment"
          hint="Sample quality, repeats, anything the doctor should read beside the numbers."
          value={comment}
          onChangeText={(v) => {
            setComment(v);
            setEdited(true);
          }}
          multiline
          testID="lab-comment"
        />

        {saved && critical.length > 0 ? (
          <View testID="result-critical-banner">
            <Banner
              tone="danger"
              title={`Critical: ${critical.join(", ")}`}
              message="Complete and report this result now. Reporting alerts the ordering doctor, and it keeps escalating until a clinician acknowledges it."
            />
          </View>
        ) : null}
        {saved && missing.length > 0 ? (
          <Banner tone="warning" title="Saved, not complete" message={`Still to enter: ${missing.join(", ")}.`} />
        ) : null}
        {saved && order.significantDeltas.length > 0 ? (
          <Banner
            tone="info"
            title="Changed since the last result"
            message={`${order.significantDeltas.join(", ")} moved significantly since this patient's previous report.`}
          />
        ) : null}
        {saved && critical.length === 0 && missing.length === 0 ? (
          <Banner tone="success" message="Results saved." />
        ) : null}
        {save.isError ? <Banner tone="danger" message={apiErrorMessage(save.error, "Results not saved")} /> : null}

        <Button
          label="Save results"
          onPress={() => save.mutate({ values, labComment: comment })}
          loading={save.isPending}
          disabled={invalid.length > 0}
          testID="save-results"
        />
      </VStack>
    </Card>
  );
}

function ParameterField({
  parameter: p,
  value,
  onChange,
}: {
  parameter: LabEntryParameter;
  value: string;
  onChange: (v: string) => void;
}) {
  const preview = previewFlag(p, value);
  const rangeLine = p.range
    ? `${p.range.text}${p.range.basis && p.range.basis !== "all patients" ? ` (${p.range.basis})` : ""}`
    : p.rangeNote || "No reference range";
  const panic = [
    p.criticalLow !== null ? `≤ ${p.criticalLow}` : null,
    p.criticalHigh !== null ? `≥ ${p.criticalHigh}` : null,
  ].filter(Boolean);

  if (p.type === "choice") {
    return (
      <VStack gap={6} testID={`param-${p.code}`}>
        <HStack gap={6} align="center">
          <Text variant="label">
            {p.name}
            {p.required ? "" : " (optional)"}
          </Text>
          {preview && preview !== "invalid" ? <LabFlagGlyph flag={preview} /> : null}
        </HStack>
        <HStack gap={6} wrap>
          {p.choices.map((choice) => {
            const selected = value === choice;
            const tier = p.criticalValues.includes(choice)
              ? signal.critical
              : p.abnormalValues.includes(choice)
                ? signal.urgent
                : signal.normal;
            return (
              <Pressable
                key={choice}
                onPress={() => onChange(selected ? "" : choice)}
                style={[styles.choice, selected ? { backgroundColor: tier.bg, borderColor: tier.border } : null]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                {...checkable(selected, () => onChange(selected ? "" : choice))}
                testID={`param-${p.code}-${choice}`}
              >
                <Text variant="label-sm" style={selected ? { color: tier.text } : undefined}>
                  {choice}
                </Text>
              </Pressable>
            );
          })}
        </HStack>
        {p.range?.text ? (
          <Text variant="caption" tone="tertiary">
            Normal: {p.range.text}
          </Text>
        ) : null}
      </VStack>
    );
  }

  const flagText =
    preview && preview !== "invalid" && preview !== "normal" ? flagPresentation(preview).label : "";

  return (
    <View style={styles.numericRow} testID={`param-${p.code}`}>
      <View style={{ flex: 1 }}>
        <TextField
          label={`${p.name}${p.required ? "" : " (optional)"}`}
          suffix={p.unit || undefined}
          numericField={p.type === "numeric"}
          value={value}
          onChangeText={onChange}
          hint={`${rangeLine}${panic.length ? ` · critical ${panic.join(" or ")}` : ""}`}
          error={preview === "invalid" ? "Not a number. Enter the value alone — no units or commas." : undefined}
          testID={`param-${p.code}-input`}
        />
      </View>
      <VStack gap={2} align="center" style={styles.previewCell}>
        {preview && preview !== "invalid" ? <LabFlagGlyph flag={preview} testID={`param-${p.code}-preview`} /> : null}
        {flagText ? (
          <Text variant="caption" style={{ color: preview?.startsWith("critical") ? signal.critical.text : palette.text.secondary }}>
            {flagText}
          </Text>
        ) : null}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  numericRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  previewCell: { width: 92, paddingTop: 28 },
  choice: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.raised,
  },
});
