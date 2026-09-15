import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { OctagonAlert, FlaskConical } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  ChipsRow,
  Button,
  Skeleton,
  ErrorState,
  EmptyState,
} from "@shared/ui";
import { formatDateTime, formatDuration } from "@shared/format";
import { useLabInbox, useReviewLabResult } from "@modules/laboratory/hooks/useLaboratory";
import { LabFlagGlyph } from "@modules/laboratory/components/LabFlag";
import { UrgencyBadge } from "./LabQueueScreen";
import type { LabOrder } from "@modules/laboratory/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * LB-05: the doctor's laboratory results.
 *
 * Bucketed rather than listed. An unacknowledged critical potassium and a
 * normal TSH from last week are not the same kind of row, and a newest-first
 * list puts them one above the other.
 *
 * The critical bucket shows EVERY unacknowledged critical result in the
 * hospital, not only this doctor's. Escalation widens the audience to the
 * department and then to every doctor; a doctor being told about a result must
 * be able to find it.
 */
export default function LabResultsScreen() {
  const navigation = useNavigation<any>();
  const canOrder = useAuthStore((s) => s.hasPermission)(PERMISSIONS.LAB_REQUEST_CREATE);
  const [scope, setScope] = useState<"mine" | "all">(canOrder ? "mine" : "all");
  const { data, isLoading, isError, error, refetch, isRefetching } = useLabInbox(scope);
  const review = useReviewLabResult();

  const open = (o: LabOrder) => navigation.navigate("LabOrder", { orderId: o.id });

  return (
    <Screen
      overline="Laboratory"
      title="Lab results"
      subtitle={scope === "mine" ? "Tests you ordered" : "All results"}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="lab-results-inbox"
    >
      <VStack gap={16}>
        {canOrder ? (
          <ChipsRow
            chips={[
              { key: "mine", label: "My orders" },
              { key: "all", label: "Everyone's" },
            ]}
            active={scope}
            onChange={(k) => setScope(k as "mine" | "all")}
          />
        ) : null}

        {isLoading ? (
          <VStack gap={10}>
            <Skeleton height={90} />
            <Skeleton height={70} />
          </VStack>
        ) : isError || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            {data.critical.length > 0 ? (
              <View style={styles.criticalStrip} testID="inbox-critical">
                <VStack gap={10}>
                  <HStack gap={8} align="center">
                    <OctagonAlert size={18} color={signal.critical.text} />
                    <Text variant="h4" style={{ color: signal.critical.text }}>
                      {data.critical.length} critical result{data.critical.length === 1 ? "" : "s"} waiting for a clinician
                    </Text>
                  </HStack>
                  {data.critical.map((o) => (
                    <CriticalRow key={o.id} order={o} onOpen={() => open(o)} />
                  ))}
                </VStack>
              </View>
            ) : null}

            {data.needsReview.length > 0 ? (
              <Card testID="inbox-needs-review">
                <VStack gap={10}>
                  <SectionHeader title="Abnormal — needs your review" subtitle="Out of range, not critical" />
                  {data.needsReview.map((o) => (
                    <ResultRow key={o.id} order={o} onOpen={() => open(o)}>
                      {canOrder ? (
                        <Button
                          label="Reviewed"
                          size="sm"
                          variant="secondary"
                          loading={review.isPending && review.variables === o.id}
                          onPress={() => review.mutate(o.id)}
                          testID={`inbox-review-${o.orderNumber}`}
                        />
                      ) : null}
                    </ResultRow>
                  ))}
                </VStack>
              </Card>
            ) : null}

            <Card testID="inbox-pending">
              <VStack gap={10}>
                <SectionHeader title="Waiting for the laboratory" />
                {data.pending.length === 0 ? (
                  <Text variant="caption" tone="tertiary">
                    Nothing outstanding.
                  </Text>
                ) : (
                  data.pending.map((o) => (
                    <Row key={o.id} onOpen={() => open(o)} testID={`inbox-pending-${o.orderNumber}`}>
                      <HStack gap={8} align="center" wrap style={{ flex: 1 }}>
                        <UrgencyBadge urgency={o.urgency} />
                        <Text variant="label">{o.test.name}</Text>
                        <Text variant="caption" tone="secondary">
                          {(o.patient as PatientBanner).fullName}
                        </Text>
                      </HStack>
                      <Text
                        variant="caption"
                        style={o.turnaround.overdue ? { color: signal.urgent.text } : undefined}
                        tone={o.turnaround.overdue ? undefined : "tertiary"}
                      >
                        {o.statusLabel} · {formatDuration(o.turnaround.ageMinutes)}
                        {o.turnaround.overdue ? " · late" : ""}
                      </Text>
                    </Row>
                  ))
                )}
              </VStack>
            </Card>

            <Card testID="inbox-reported">
              <VStack gap={10}>
                <SectionHeader title="Reported" />
                {data.reported.length === 0 ? (
                  <EmptyState icon={FlaskConical} title="No reported results yet" />
                ) : (
                  data.reported.slice(0, 50).map((o) => <ResultRow key={o.id} order={o} onOpen={() => open(o)} />)
                )}
              </VStack>
            </Card>
          </>
        )}
      </VStack>
    </Screen>
  );
}

function CriticalRow({ order, onOpen }: { order: LabOrder; onOpen: () => void }) {
  const patient = order.patient as PatientBanner;
  const last = order.critical.escalations.at(-1);
  return (
    <View style={styles.criticalRow} testID={`inbox-critical-${order.orderNumber}`}>
      <VStack gap={6}>
        <HStack gap={8} align="center" wrap>
          <Text variant="label-lg">{patient.fullName}</Text>
          <Text variant="caption" tone="secondary">
            {patient.patientId} · {order.test.name} · ordered by {order.doctor.fullName}
          </Text>
        </HStack>
        <HStack gap={12} wrap>
          {order.results
            .filter((r) => r.isCritical)
            .map((r) => (
              <HStack key={r.code} gap={4} align="center">
                <Text variant="label" style={{ color: signal.critical.text }}>
                  {r.name} {r.valueText} {r.unit}
                </Text>
                <LabFlagGlyph flag={r.flag} />
              </HStack>
            ))}
        </HStack>
        <Text variant="caption" tone="secondary">
          Reported {formatDateTime(order.reportedAt)}
          {last ? ` · now escalated to ${last.notified.at(-1)}` : ""}
        </Text>
        <Button label="Open and acknowledge" size="sm" variant="critical" onPress={onOpen} testID={`inbox-open-${order.orderNumber}`} />
      </VStack>
    </View>
  );
}

function ResultRow({ order, onOpen, children }: { order: LabOrder; onOpen: () => void; children?: React.ReactNode }) {
  const patient = order.patient as PatientBanner;
  const flagged = order.results.filter((r) => r.isAbnormal);
  return (
    <Row onOpen={onOpen} testID={`inbox-result-${order.orderNumber}`} actions={children}>
      <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
        <HStack gap={8} align="center" wrap>
          <Text variant="label">{order.test.name}</Text>
          <Text variant="caption" tone="secondary">
            {patient.fullName} · {formatDateTime(order.reportedAt)}
          </Text>
        </HStack>
        {flagged.length ? (
          <HStack gap={10} wrap>
            {flagged.map((r) => (
              <HStack key={r.code} gap={4} align="center">
                <Text variant="caption" tabular>
                  {r.name} {r.valueText}
                </Text>
                <LabFlagGlyph flag={r.flag} />
              </HStack>
            ))}
          </HStack>
        ) : (
          <Text variant="caption" tone="tertiary">
            All within range
          </Text>
        )}
      </VStack>
    </Row>
  );
}

function Row({
  children,
  actions,
  onOpen,
  testID,
}: {
  children: React.ReactNode;
  /** Buttons beside the row — "Reviewed". Never inside the row's own press target. */
  actions?: React.ReactNode;
  onOpen: () => void;
  testID?: string;
}) {
  if (!actions) {
    return (
      <Card compact onPress={onOpen} testID={testID}>
        <HStack gap={10} align="center" wrap>
          {children}
        </HStack>
      </Card>
    );
  }
  // A row that opens AND carries its own button is two controls side by side.
  // A button inside a button cannot be reached by a screen reader, and
  // pressing it on the web also fires the row.
  return (
    <Card compact>
      <HStack gap={10} align="center" wrap>
        <Pressable onPress={onOpen} testID={testID} accessibilityRole="button" style={{ flex: 1, minWidth: 200 }}>
          <HStack gap={10} align="center" wrap>
            {children}
          </HStack>
        </Pressable>
        {actions}
      </HStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  criticalStrip: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
  },
  criticalRow: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface.raised,
    borderWidth: 1,
    borderColor: palette.border.subtle,
  },
});
