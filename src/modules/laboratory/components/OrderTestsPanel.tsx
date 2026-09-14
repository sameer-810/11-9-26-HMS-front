import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { FlaskConical, X } from "lucide-react-native";
import { palette, radius, signal, layout } from "@shared/designSystem";
import {
  Text,
  HStack,
  VStack,
  Card,
  SectionHeader,
  Button,
  TextField,
  SearchInput,
  Banner,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useLabTests, useOrderTests } from "@modules/laboratory/hooks/useLaboratory";
import type { DuplicateOrder, LabTest, LabUrgency } from "@modules/laboratory/types";

/**
 * LB-01: order tests from where the doctor already is.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately missing
 * ---------------------------------------------------------------------------
 * There is no patient field. The patient is the one whose record or
 * consultation this panel sits inside, passed as an id. "No free-typing of
 * patient identity" is kept by there being nothing to type into.
 *
 * There is no price. The doctor chooses a test for what it answers.
 *
 * ---------------------------------------------------------------------------
 * The duplicate pause
 * ---------------------------------------------------------------------------
 * If the same test was ordered recently the server answers with the earlier
 * order. The panel shows it — who ordered it, when, and where it has got to —
 * and the doctor either stops or presses "Order again anyway". Repeats are
 * sometimes exactly right; the point is that they are chosen.
 */

const URGENCIES: { key: LabUrgency; label: string; hint: string }[] = [
  { key: "routine", label: "Routine", hint: "Today" },
  { key: "urgent", label: "Urgent", hint: "Within hours" },
  { key: "stat", label: "STAT", hint: "Now" },
];

interface Props {
  patientId: string;
  consultationId?: string;
  admissionId?: string;
  disabled?: boolean;
  onOrdered?: (summary: string) => void;
}

export function OrderTestsPanel({ patientId, consultationId, admissionId, disabled, onOrdered }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LabTest[]>([]);
  const [indication, setIndication] = useState("");
  const [urgency, setUrgency] = useState<LabUrgency>("routine");
  const [duplicates, setDuplicates] = useState<DuplicateOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: catalogue = [] } = useLabTests();
  const order = useOrderTests();

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogue
      .filter(
        (t) =>
          !selected.some((s) => s.id === t.id) &&
          (t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [catalogue, search, selected]);

  const reset = () => {
    setSelected([]);
    setIndication("");
    setUrgency("routine");
    setDuplicates(null);
    setError(null);
  };

  const submit = async (acknowledgeDuplicates = false) => {
    setError(null);
    try {
      const result = await order.mutateAsync({
        patientId,
        consultationId,
        admissionId,
        testIds: selected.map((t) => t.id),
        clinicalIndication: indication.trim(),
        urgency,
        acknowledgeDuplicates,
      });
      onOrdered?.(`${result.orders.map((o) => o.test.name).join(", ")} (${result.groupNumber})`);
      reset();
    } catch (err) {
      const data = (err as { response?: { data?: { error?: { code?: string; details?: { duplicates?: DuplicateOrder[] } } } } })
        ?.response?.data?.error;
      if (data?.code === "DUPLICATE_ORDER" && data.details?.duplicates) {
        setDuplicates(data.details.duplicates);
        return;
      }
      setError(apiErrorMessage(err, "The tests could not be ordered"));
    }
  };

  const ready = selected.length > 0 && indication.trim().length >= 5 && !disabled;
  const preparation = selected.filter((t) => t.preparation && !/^No fasting required\.?$/i.test(t.preparation));

  return (
    <Card testID="order-tests-panel">
      <VStack gap={12}>
        <SectionHeader title="Order laboratory tests" subtitle="Sent straight to the laboratory queue" />

        {disabled ? (
          <Text variant="caption" tone="tertiary">
            This consultation is signed. Tests can still be ordered from the patient&apos;s record.
          </Text>
        ) : (
          <>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tests — CBC, potassium, troponin…"
              testID="lab-test-search"
            />

            {matches.length > 0 ? (
              <VStack gap={4}>
                {matches.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setSelected((s) => [...s, t]);
                      setSearch("");
                      setDuplicates(null);
                    }}
                    style={styles.match}
                    testID={`lab-test-option-${t.code}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${t.name}`}
                  >
                    <HStack gap={8} align="center">
                      <FlaskConical size={15} color={palette.text.tertiary} />
                      <VStack gap={0} style={{ flex: 1 }}>
                        <Text variant="label">{t.name}</Text>
                        <Text variant="caption" tone="tertiary">
                          {t.code} · {t.category} · {t.sampleType}
                        </Text>
                      </VStack>
                    </HStack>
                  </Pressable>
                ))}
              </VStack>
            ) : null}

            {selected.length > 0 ? (
              <HStack gap={6} wrap testID="lab-selected-tests">
                {selected.map((t) => (
                  <View key={t.id} style={styles.chip}>
                    <Text variant="label-sm">{t.name}</Text>
                    <Pressable
                      onPress={() => {
                        setSelected((s) => s.filter((x) => x.id !== t.id));
                        setDuplicates(null);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${t.name}`}
                    >
                      <X size={14} color={palette.text.secondary} />
                    </Pressable>
                  </View>
                ))}
              </HStack>
            ) : null}

            {preparation.length > 0 ? (
              <Banner
                tone="info"
                title="Preparation"
                message={preparation.map((t) => `${t.name}: ${t.preparation}`).join(" ")}
              />
            ) : null}

            <VStack gap={6}>
              <Text variant="label">Urgency</Text>
              <HStack gap={8} wrap>
                {URGENCIES.map((u) => {
                  const active = urgency === u.key;
                  const s = u.key === "stat" ? signal.critical : u.key === "urgent" ? signal.urgent : null;
                  return (
                    <Pressable
                      key={u.key}
                      onPress={() => setUrgency(u.key)}
                      style={[
                        styles.urgency,
                        active
                          ? s
                            ? { borderColor: s.border, backgroundColor: s.bg }
                            : { borderColor: palette.border.focus, backgroundColor: palette.surface.secondary }
                          : null,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      testID={`lab-urgency-${u.key}`}
                    >
                      <Text variant="label" style={active && s ? { color: s.text } : undefined}>
                        {u.label}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {u.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </HStack>
            </VStack>

            <TextField
              label="Clinical indication"
              required
              hint="Why the test is needed. The laboratory interprets the result against it — and it is all of the history they are allowed to see."
              value={indication}
              onChangeText={setIndication}
              multiline
              testID="lab-indication"
            />

            {duplicates ? (
              <View style={styles.duplicate} testID="lab-duplicate-warning">
                <VStack gap={8}>
                  <Text variant="label" style={{ color: signal.caution.text }}>
                    {duplicates.length === 1 ? "Already ordered recently" : "Some of these were ordered recently"}
                  </Text>
                  {duplicates.map((d) => (
                    <Text key={d.orderNumber} variant="body-sm">
                      {d.testName} — {d.orderNumber}, ordered {d.ago} by {d.doctorName}. {d.statusLabel}.
                    </Text>
                  ))}
                  <Text variant="caption" tone="secondary">
                    Order again only if a repeat is clinically needed.
                  </Text>
                  <HStack gap={8} wrap>
                    <Button
                      label="Order again anyway"
                      variant="secondary"
                      size="sm"
                      onPress={() => submit(true)}
                      loading={order.isPending}
                      testID="lab-order-anyway"
                    />
                    <Button label="Don't order" variant="ghost" size="sm" onPress={() => setDuplicates(null)} />
                  </HStack>
                </VStack>
              </View>
            ) : null}

            {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

            <Button
              label={selected.length > 1 ? `Order ${selected.length} tests` : "Order test"}
              onPress={() => submit(false)}
              disabled={!ready || Boolean(duplicates)}
              loading={order.isPending && !duplicates}
              testID="lab-order-submit"
            />
          </>
        )}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  match: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.subtle,
    minHeight: layout.minTouchTarget,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
  urgency: {
    minWidth: 96,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    justifyContent: "center",
  },
  duplicate: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: signal.caution.border,
    backgroundColor: signal.caution.bg,
  },
});
