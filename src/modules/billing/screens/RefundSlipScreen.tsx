import React from "react";
import { View, Platform, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Printer } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { formatDateTime, formatRupees } from "@shared/format";
import { useRefundReceipt } from "@modules/billing/hooks/useBilling";

/**
 * Printable refund slip, the counterpart of the payment receipt: amount in figures and
 * words, and a line for the patient to sign that they received the money.
 */
export default function RefundSlipScreen() {
  const route = useRoute<any>();
  const {
    data: r,
    isLoading,
    isError,
    error,
    refetch,
  } = useRefundReceipt(route.params?.refundId);

  if (isLoading || !r) {
    return (
      <Screen title="Refund slip">
        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <Skeleton height={320} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      overline="Billing"
      title={`Refund slip ${r.refund.refundNumber}`}
      right={
        Platform.OS === "web" ? (
          <Button
            label="Print"
            size="sm"
            variant="secondary"
            icon={<Printer size={15} />}
            onPress={() => window.print()}
            testID="print-refund-slip"
          />
        ) : null
      }
      testID="refund-slip-screen"
    >
      <View style={styles.paper} testID="refund-slip">
        <VStack gap={14}>
          <VStack gap={2} align="center">
            <Text variant="h3">{r.hospital.name}</Text>
            {r.hospital.address ? (
              <Text variant="caption" tone="secondary">
                {r.hospital.address}
              </Text>
            ) : null}
            <Text variant="caption" tone="secondary">
              {[
                r.hospital.phone,
                r.hospital.gstin ? `GSTIN ${r.hospital.gstin}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </VStack>

          <Text variant="h4">Refund slip</Text>

          <Line label="Refund number" value={r.refund.refundNumber} />
          <Line label="Date" value={formatDateTime(r.refund.paidOutAt)} />
          <Line
            label="Patient"
            value={`${r.patient.fullName} (${r.patient.patientId})`}
          />
          {r.bill ? <Line label="Bill" value={r.bill.billNumber} /> : null}
          <Line
            label="Paid back by"
            value={`${r.refund.methodLabel}${r.refund.reference ? ` · ${r.refund.reference}` : ""}`}
          />
          <Line label="Reason" value={r.refund.reason} />

          <View style={styles.amount}>
            <Text variant="display-sm" tabular testID="refund-slip-amount">
              {formatRupees(r.refund.amount)}
            </Text>
            <Text variant="body-sm" tone="secondary" testID="refund-slip-words">
              {r.amountInWords}
            </Text>
          </View>

          {r.bill ? (
            <Line
              label="Bill total / credit notes / refunded"
              value={`${formatRupees(r.bill.total)} / ${formatRupees(r.bill.credited)} / ${formatRupees(r.bill.refunded)}`}
            />
          ) : null}
          <Line label="Paid out by" value={r.refund.paidOutByName} />

          <VStack gap={6} style={styles.signature} testID="refund-slip-signature">
            <Text variant="body-sm">
              I received {formatRupees(r.refund.amount)} ({r.amountInWords})
              from {r.hospital.name || "the hospital"}.
            </Text>
            <View style={styles.signLine} />
            <HStack justify="space-between" wrap gap={8}>
              <Text variant="caption" tone="secondary">
                Signature of patient or representative
              </Text>
              <Text variant="caption" tone="secondary">
                Date
              </Text>
            </HStack>
          </VStack>

          {r.footer ? (
            <Text variant="caption" tone="tertiary">
              {r.footer}
            </Text>
          ) : null}
        </VStack>
      </View>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" gap={12} wrap>
      <Text variant="body-sm" tone="secondary">
        {label}
      </Text>
      <Text variant="label-sm">{value}</Text>
    </HStack>
  );
}

const styles = StyleSheet.create({
  paper: {
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
    padding: 24,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.raised,
  },
  amount: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.border.subtle,
    gap: 4,
  },
  signature: { marginTop: 8 },
  signLine: {
    marginTop: 36,
    height: 1,
    backgroundColor: palette.text.primary,
  },
});
