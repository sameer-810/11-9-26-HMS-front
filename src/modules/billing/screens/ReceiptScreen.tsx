import React from "react";
import { View, Platform, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Printer } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import { Screen, Text, VStack, HStack, Button, Skeleton, ErrorState } from "@shared/ui";
import { formatDateTime, formatRupees } from "@shared/format";
import { useReceipt } from "@modules/billing/hooks/useBilling";

/**
 * BL-04: a printable receipt for a payment.
 *
 * The amount appears in figures AND in words, because the words are what is
 * checked against the figure — "₹1,250" misread as "₹12,50" is caught by
 * "One Thousand Two Hundred Fifty". A voided payment's receipt still opens, and
 * says VOID across it; a receipt that simply disappears is one a patient
 * cannot use to show what happened.
 */
export default function ReceiptScreen() {
  const route = useRoute<any>();
  const { data: r, isLoading, isError, error, refetch } = useReceipt(route.params?.paymentId);

  if (isLoading || !r) {
    return <Screen title="Receipt">{isError ? <ErrorState error={error} onRetry={refetch} /> : <Skeleton height={320} />}</Screen>;
  }

  return (
    <Screen
      overline="Billing"
      title={`Receipt ${r.payment.receiptNumber}`}
      right={
        Platform.OS === "web" ? (
          <Button label="Print" size="sm" variant="secondary" icon={<Printer size={15} />} onPress={() => window.print()} testID="print-receipt" />
        ) : null
      }
      testID="receipt-screen"
    >
      <View style={styles.paper} testID="receipt">
        <VStack gap={14}>
          <VStack gap={2} align="center">
            <Text variant="h3">{r.hospital.name}</Text>
            {r.hospital.address ? <Text variant="caption" tone="secondary">{r.hospital.address}</Text> : null}
            <Text variant="caption" tone="secondary">
              {[r.hospital.phone, r.hospital.gstin ? `GSTIN ${r.hospital.gstin}` : ""].filter(Boolean).join(" · ")}
            </Text>
          </VStack>

          <HStack justify="space-between" wrap gap={8}>
            <Text variant="h4">Payment receipt</Text>
            {r.payment.isVoid ? (
              <Text variant="h4" tone="danger" testID="receipt-void">VOID</Text>
            ) : null}
          </HStack>

          <Line label="Receipt number" value={r.payment.receiptNumber} />
          <Line label="Date" value={formatDateTime(r.payment.receivedAt)} />
          <Line label="Patient" value={`${r.patient.fullName} (${r.patient.patientId})`} />
          {r.bill ? <Line label="Bill" value={r.bill.billNumber} /> : null}
          <Line label="Paid by" value={`${r.payment.methodLabel}${r.payment.reference ? ` · ${r.payment.reference}` : ""}${r.payment.bankName ? ` · ${r.payment.bankName}` : ""}`} />

          <View style={styles.amount}>
            <Text variant="display-sm" tabular testID="receipt-amount">{formatRupees(r.payment.amount)}</Text>
            <Text variant="body-sm" tone="secondary" testID="receipt-words">{r.amountInWords}</Text>
          </View>

          {r.bill ? (
            <Line label="Bill total / balance now" value={`${formatRupees(r.bill.total)} / ${formatRupees(r.bill.balanceDue)}`} />
          ) : null}
          <Line label="Received by" value={r.payment.receivedByName} />
          {r.payment.isVoid ? <Line label="Voided" value={`${r.payment.voidReason} — ${r.payment.voidedByName}`} /> : null}
          {r.footer ? <Text variant="caption" tone="tertiary">{r.footer}</Text> : null}
        </VStack>
      </View>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" gap={12} wrap>
      <Text variant="body-sm" tone="secondary">{label}</Text>
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
});
