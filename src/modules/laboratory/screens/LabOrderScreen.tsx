import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { OctagonAlert, Phone, CircleCheck, Square, SquareCheck } from "lucide-react-native";

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
  Button,
  TextField,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime, formatDuration } from "@shared/format";
import {
  useLabOrder,
  useAdvanceLabOrder,
  useRejectSample,
  useAcknowledgeCritical,
  useRecordCriticalCall,
  useReviewLabResult,
  useCancelLabOrder,
} from "@modules/laboratory/hooks/useLaboratory";
import { StageStepper } from "@modules/laboratory/components/StageStepper";
import { ResultTable } from "@modules/laboratory/components/ResultTable";
import { ResultEntryForm } from "@modules/laboratory/components/ResultEntryForm";
import { LabFlagGlyph } from "@modules/laboratory/components/LabFlag";
import { UrgencyBadge } from "./LabQueueScreen";
import type { LabOrder, LabStatus } from "@modules/laboratory/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * One laboratory order — the bench workspace for the lab, the result view for
 * the doctor.
 *
 * Flow 3 in order, top to bottom: who and why (identity pinned, indication
 * first), how to collect it, where it is, the results, and — once reported —
 * what happened about a critical value.
 *
 * A doctor opening an order that is not yet reported sees no values. The same
 * rule as the record: a number typed on the bench and not yet reported has
 * been checked by nobody, and the doctor would act on it.
 */

const NEXT_ACTION: Partial<Record<LabStatus, { to: LabStatus; label: string }>> = {
  requested: { to: "sample_collected", label: "Sample collected" },
  sample_collected: { to: "in_progress", label: "Start test" },
  in_progress: { to: "completed", label: "Complete" },
  completed: { to: "reported", label: "Report result" },
};

export default function LabOrderScreen() {
  const route = useRoute<any>();
  const { orderId } = (route.params ?? {}) as { orderId: string };
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canWork = hasPermission(PERMISSIONS.LAB_RESULTS_MANAGE);
  const canOrder = hasPermission(PERMISSIONS.LAB_REQUEST_CREATE);
  const canAcknowledge = hasPermission(PERMISSIONS.CONSULTATION_MANAGE);

  const { data: order, isLoading, isError, error, refetch, isRefetching } = useLabOrder(orderId);
  const advance = useAdvanceLabOrder(orderId);
  const [confirmReport, setConfirmReport] = useState(false);

  if (isLoading || !order) {
    return (
      <Screen title="Laboratory order">
        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <VStack gap={10}>
            <Skeleton height={90} />
            <Skeleton height={180} />
          </VStack>
        )}
      </Screen>
    );
  }

  const patient = order.patient as PatientBanner;
  const next = NEXT_ACTION[order.status];
  const showResults =
    order.results.length > 0 && (order.status === "reported" || (canWork && order.status === "completed"));

  const doAdvance = () => {
    if (!next) return;
    if (next.to === "reported" && order.hasCritical) {
      setConfirmReport(true);
      return;
    }
    advance.mutate({ to: next.to });
  };

  return (
    <Screen
      patient={patient?.fullName ? patient : undefined}
      overline="Laboratory"
      title={order.test.name}
      subtitle={`${order.orderNumber} · ${order.statusLabel}`}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="lab-order"
      right={<UrgencyBadge urgency={order.urgency} />}
    >
      <VStack gap={14}>
        {canWork && order.status === "completed" && order.hasCritical ? (
          <View testID="critical-unreported">
            <Banner
              tone="danger"
              title="Critical value — not yet reported"
              message="Only the laboratory knows about this result. Report it now; reporting alerts the ordering doctor."
            />
          </View>
        ) : null}

        <RequestCard order={order} />

        <Card>
          <VStack gap={10}>
            <SectionHeader title="Progress" />
            <StageStepper order={order} />
            {order.sampleRejections.length > 0 ? (
              <VStack gap={4} testID="sample-rejections">
                {order.sampleRejections.map((r, i) => (
                  <Text key={i} variant="caption" style={{ color: signal.caution.text }}>
                    Sample {r.sampleId || ""} rejected {formatDateTime(r.at)} by {r.byName}: {r.reason}
                  </Text>
                ))}
              </VStack>
            ) : null}

            {advance.isError ? (
              <Banner tone="danger" message={apiErrorMessage(advance.error, "The test could not be moved on")} />
            ) : null}

            {canWork && next ? (
              <HStack gap={8} wrap>
                <Button
                  label={next.label}
                  variant={next.to === "reported" && order.hasCritical ? "critical" : "primary"}
                  onPress={doAdvance}
                  loading={advance.isPending}
                  testID={`advance-${next.to}`}
                />
                {order.status === "sample_collected" || order.status === "in_progress" ? (
                  <RejectSample order={order} />
                ) : null}
              </HStack>
            ) : null}
          </VStack>
        </Card>

        {canWork && order.status === "in_progress" ? (
          <ResultEntryForm key={`${order.id}-${order.resultsEnteredAt ?? "new"}`} order={order} />
        ) : null}

        {showResults ? (
          <Card testID="lab-results">
            <VStack gap={10}>
              <SectionHeader
                title="Results"
                subtitle={[
                  order.performedByName ? `Performed by ${order.performedByName}` : "",
                  order.reportedByName ? `reported by ${order.reportedByName} ${formatDateTime(order.reportedAt)}` : "",
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <ResultTable results={order.results} testID="lab-result-table" />
              {order.labComment ? (
                <Text variant="body-sm" tone="secondary">
                  Laboratory comment: {order.labComment}
                </Text>
              ) : null}
            </VStack>
          </Card>
        ) : !canWork && order.status !== "reported" && order.status !== "cancelled" ? (
          <Card>
            <Text variant="body-sm" tone="secondary" testID="results-not-reported">
              Results appear here when the laboratory reports them. Values on the bench have not been checked yet.
            </Text>
          </Card>
        ) : null}

        {order.critical.status !== "none" ? (
          <CriticalPanel order={order} canCall={canWork} canAcknowledge={canAcknowledge} />
        ) : null}

        {canOrder && order.status === "reported" && order.abnormalCount > 0 && order.critical.status === "none" ? (
          <ReviewButton order={order} />
        ) : null}

        {canOrder && ["requested", "sample_collected", "in_progress"].includes(order.status) ? (
          <CancelOrder order={order} />
        ) : null}

        {order.prior.length > 0 ? <PriorResults order={order} /> : null}
      </VStack>

      <ConfirmDialog
        visible={confirmReport}
        title="Report a critical result?"
        message={`This result contains a critical value. Reporting it alerts ${order.doctor.fullName} now, and it escalates to more clinicians every few minutes until someone acknowledges it.`}
        confirmLabel="Report and alert"
        cancelLabel="Not yet"
        loading={advance.isPending}
        onConfirm={() => {
          advance.mutate({ to: "reported" }, { onSettled: () => setConfirmReport(false) });
        }}
        onCancel={() => setConfirmReport(false)}
      />
    </Screen>
  );
}

function RequestCard({ order }: { order: LabOrder }) {
  return (
    <Card testID="lab-request">
      <VStack gap={10}>
        <SectionHeader
          title="The request"
          subtitle={`Ordered by ${order.doctor.fullName}, ${formatDateTime(order.requestedAt)}`}
        />
        {/* The indication first: it is the question the result answers. */}
        <View style={styles.indication}>
          <Text variant="caption" tone="tertiary">
            Clinical indication
          </Text>
          <Text variant="body" testID="lab-indication-text">
            {order.clinicalIndication}
          </Text>
        </View>
        <HStack gap={16} wrap>
          <Fact label="Sample" value={order.test.sampleType} />
          <Fact label="Container" value={order.test.container} />
          {order.sampleId ? <Fact label="Sample number" value={order.sampleId} testID="lab-sample-id" /> : null}
          <Fact
            label="Turnaround"
            value={`${formatDuration(order.turnaround.ageMinutes)} of ${formatDuration(order.turnaround.targetMinutes)}${order.turnaround.overdue && order.status !== "reported" ? " — late" : ""}`}
          />
        </HStack>
        {order.test.preparation ? (
          <Text variant="body-sm" tone="secondary">
            Preparation: {order.test.preparation}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <VStack gap={0} style={{ minWidth: 140 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="label-sm" testID={testID}>
        {value}
      </Text>
    </VStack>
  );
}

function RejectSample({ order }: { order: LabOrder }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reject = useRejectSample(order.id);

  if (!open) {
    return <Button label="Reject sample" variant="secondary" onPress={() => setOpen(true)} testID="reject-sample-open" />;
  }
  return (
    <VStack gap={8} style={{ flexBasis: "100%" }}>
      <TextField
        label="What is wrong with the sample?"
        hint={order.results.length ? "Results entered from this sample will be discarded." : "The test returns to the collection list."}
        value={reason}
        onChangeText={setReason}
        testID="reject-reason"
      />
      {reject.isError ? <Banner tone="danger" message={apiErrorMessage(reject.error)} /> : null}
      <HStack gap={8}>
        <Button
          label="Reject and recollect"
          variant="destructive"
          disabled={reason.trim().length < 5}
          loading={reject.isPending}
          onPress={() => reject.mutate(reason.trim(), { onSuccess: () => setOpen(false) })}
          testID="reject-sample-submit"
        />
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </HStack>
    </VStack>
  );
}

/**
 * LB-05 after the report.
 *
 * The laboratory records who it told and whether they read the value back —
 * read-back is what catches "6.5" heard as "5.6". A doctor acknowledges with a
 * sentence about what they are doing. Telling someone and someone taking
 * responsibility are different events, and only the second stops escalation.
 */
function CriticalPanel({ order, canCall, canAcknowledge }: { order: LabOrder; canCall: boolean; canAcknowledge: boolean }) {
  const c = order.critical;
  const open = c.status === "unacknowledged";
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [readBack, setReadBack] = useState(false);
  const acknowledge = useAcknowledgeCritical();
  const call = useRecordCriticalCall(order.id);
  const criticalValues = order.results.filter((r) => r.isCritical);

  return (
    <Card accentColor={open ? signal.critical.color : signal.normal.color} testID="critical-panel">
      <VStack gap={12}>
        <HStack gap={8} align="center">
          {open ? (
            <OctagonAlert size={18} color={signal.critical.text} />
          ) : (
            <CircleCheck size={18} color={signal.normal.text} />
          )}
          <Text variant="h4" style={{ color: open ? signal.critical.text : signal.normal.text }}>
            {open ? "Critical result — not yet acknowledged" : `Acknowledged by ${c.acknowledgedByName}`}
          </Text>
        </HStack>

        <HStack gap={12} wrap>
          {criticalValues.map((r) => (
            <HStack key={r.code} gap={6} align="center">
              <Text variant="label">
                {r.name} {r.valueText} {r.unit}
              </Text>
              <LabFlagGlyph flag={r.flag} />
            </HStack>
          ))}
        </HStack>

        {!open ? (
          <Text variant="body-sm" testID="critical-acknowledgement">
            {formatDateTime(c.acknowledgedAt)}: {c.acknowledgementNote}
          </Text>
        ) : null}

        <VStack gap={4} testID="critical-escalations">
          {c.escalations.map((e) => (
            <Text key={`${e.level}-${e.at}`} variant="caption" tone="secondary">
              {formatDateTime(e.at)} · level {e.level}: {e.notified.join(", ")}
            </Text>
          ))}
        </VStack>

        {c.communications.length > 0 ? (
          <VStack gap={4}>
            {c.communications.map((m, i) => (
              <HStack key={i} gap={6} align="center">
                <Phone size={12} color={palette.text.tertiary} />
                <Text variant="caption" tone="secondary">
                  {formatDateTime(m.at)} · {m.byName} told {m.to}
                  {m.readBack ? ", read back" : ", not read back"}
                  {m.note ? ` — ${m.note}` : ""}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {open && canCall ? (
          <VStack gap={8} style={styles.subform} testID="critical-call-form">
            <Text variant="label">Record the telephone call</Text>
            <TextField label="Given to" value={to} onChangeText={setTo} testID="critical-call-to" />
            <Pressable
              onPress={() => setReadBack((v) => !v)}
              style={styles.checkbox}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: readBack }}
              testID="critical-call-readback"
            >
              {readBack ? (
                <SquareCheck size={20} color={palette.text.accent} />
              ) : (
                <Square size={20} color={palette.text.tertiary} />
              )}
              <Text variant="body-sm">They read the value back to me</Text>
            </Pressable>
            {call.isError ? <Banner tone="danger" message={apiErrorMessage(call.error)} /> : null}
            <Button
              label="Record call"
              variant="secondary"
              disabled={to.trim().length < 2}
              loading={call.isPending}
              onPress={() =>
                call.mutate(
                  { to: to.trim(), method: "phone", readBack },
                  {
                    onSuccess: () => {
                      setTo("");
                      setReadBack(false);
                    },
                  },
                )
              }
              testID="critical-call-submit"
            />
          </VStack>
        ) : null}

        {open && canAcknowledge ? (
          <VStack gap={8} style={styles.subform} testID="critical-acknowledge-form">
            <TextField
              label="What are you doing about it?"
              hint={'A sentence, not "seen". This is what anyone reviewing this patient will read.'}
              value={note}
              onChangeText={setNote}
              multiline
              testID="critical-acknowledge-note"
            />
            {acknowledge.isError ? <Banner tone="danger" message={apiErrorMessage(acknowledge.error)} /> : null}
            <Button
              label="Acknowledge critical result"
              variant="critical"
              disabled={note.trim().length < 10}
              loading={acknowledge.isPending}
              onPress={() => acknowledge.mutate({ id: order.id, note: note.trim() })}
              testID="critical-acknowledge-submit"
            />
          </VStack>
        ) : null}
      </VStack>
    </Card>
  );
}

function ReviewButton({ order }: { order: LabOrder }) {
  const review = useReviewLabResult();
  if (order.reviewedAt) {
    return (
      <Text variant="caption" tone="tertiary">
        Reviewed by {order.reviewedByName} {formatDateTime(order.reviewedAt)}
      </Text>
    );
  }
  return (
    <Button
      label="Mark abnormal result as reviewed"
      variant="secondary"
      loading={review.isPending}
      onPress={() => review.mutate(order.id)}
      testID="review-result"
    />
  );
}

function CancelOrder({ order }: { order: LabOrder }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useCancelLabOrder();
  if (!open) {
    return <Button label="Cancel this test" variant="ghost" onPress={() => setOpen(true)} testID="cancel-order-open" />;
  }
  return (
    <Card>
      <VStack gap={8}>
        <TextField label="Why is the test being cancelled?" value={reason} onChangeText={setReason} testID="cancel-reason" />
        {cancel.isError ? <Banner tone="danger" message={apiErrorMessage(cancel.error)} /> : null}
        <HStack gap={8}>
          <Button
            label="Cancel test"
            variant="destructive"
            disabled={reason.trim().length < 5}
            loading={cancel.isPending}
            onPress={() => cancel.mutate({ id: order.id, reason: reason.trim() }, { onSuccess: () => setOpen(false) })}
            testID="cancel-order-submit"
          />
          <Button label="Keep it" variant="ghost" onPress={() => setOpen(false)} />
        </HStack>
      </VStack>
    </Card>
  );
}

/** MR-03: prior results for the same test. */
function PriorResults({ order }: { order: LabOrder }) {
  return (
    <Card testID="prior-results">
      <VStack gap={10}>
        <SectionHeader title="Previous results for this test" />
        {order.prior.map((p) => (
          <VStack key={p.id} gap={4}>
            <Text variant="label-sm" tone="secondary">
              {formatDateTime(p.reportedAt)} · {p.orderNumber}
            </Text>
            <HStack gap={12} wrap>
              {p.results.map((r) => (
                <HStack key={r.code} gap={4} align="center">
                  <Text variant="body-sm" tabular>
                    {r.name} {r.valueText} {r.unit}
                  </Text>
                  <LabFlagGlyph flag={r.flag} />
                </HStack>
              ))}
            </HStack>
          </VStack>
        ))}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  indication: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface.secondary,
    gap: 2,
  },
  subform: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
  checkbox: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
});
