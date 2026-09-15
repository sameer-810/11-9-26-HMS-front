import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Lock } from "lucide-react-native";

import { palette, radius, layout } from "@shared/designSystem";
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
  Select,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
} from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime, formatRupees } from "@shared/format";
import {
  useBill,
  useTariff,
  useRefreshBill,
  useAddService,
  useRemoveLine,
  useRequestDiscount,
  useDecideDiscount,
  useFinaliseBill,
  useCancelBill,
  useRecordPayment,
  useVoidPayment,
} from "@modules/billing/hooks/useBilling";
import { ChargeTable } from "@modules/billing/components/ChargeTable";
import { BillStatusText } from "@modules/billing/components/BillStatusText";
import { PAYMENT_METHOD_LABELS, type Bill, type Charge, type PaymentMethod } from "@modules/billing/types";

/**
 * One bill — BL-02 to BL-04.
 *
 * While it is a draft, charges can be refreshed, removed with a reason, or
 * added from the tariff, and a discount can be requested. Once finalised, the
 * charges section locks and only payments move. Section 7: "Finalised bills
 * accept payment, not edits" — the screen offers no edit, and the server would
 * refuse one.
 */
export default function BillDetailScreen() {
  const route = useRoute<any>();
  const billId: string = route.params?.billId;
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.BILLING_MANAGE);
  const canPay = hasPermission(PERMISSIONS.PAYMENT_RECORD);
  const canApprove = hasPermission(PERMISSIONS.HOSPITAL_CONFIG);

  const { data: bill, isLoading, isError, error, refetch, isRefetching } = useBill(billId);
  const [removing, setRemoving] = useState<Charge | null>(null);

  if (isLoading || !bill) {
    return (
      <Screen title="Bill">
        {isError ? <ErrorState error={error} onRetry={refetch} /> : <Skeleton height={240} />}
      </Screen>
    );
  }

  const draft = bill.status === "draft";
  const payable = bill.status === "finalised" || bill.status === "partially_paid";

  return (
    <Screen
      overline={bill.billType === "ipd" ? "Inpatient bill" : "Outpatient bill"}
      title={bill.billNumber}
      subtitle={`${bill.patient.fullName} · ${bill.patient.patientId} · ${bill.patient.mobile}`}
      right={<BillStatusText status={bill.status} testID="bill-status" />}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="bill-detail"
    >
      <VStack gap={14}>
        {bill.status === "cancelled" ? (
          <Banner tone="info" title="Cancelled draft" message={`${bill.cancelReason}. Its charges were released for another bill.`} />
        ) : null}

        <Card testID="bill-charges">
          <VStack gap={10}>
            <SectionHeader
              title="Charges"
              subtitle={draft ? "Draft — charges can still change" : "Fixed when the bill was finalised"}
              right={!draft ? <Lock size={15} color={palette.text.tertiary} /> : undefined}
            />
            {bill.hasUnpriced ? (
              <Banner tone="warning" title="A charge has no price" message="Administration must price it before this bill can be finalised. Refresh the bill once it is priced." />
            ) : null}
            <ChargeTable lines={bill.lines} onRemove={draft && canManage ? setRemoving : undefined} testID="bill-charge-table" />
            {removing ? <RemoveLine bill={bill} line={removing} onDone={() => setRemoving(null)} /> : null}
            {bill.removedLines.length ? (
              <VStack gap={2}>
                {bill.removedLines.map((r, i) => (
                  <Text key={i} variant="caption" tone="tertiary">
                    Removed {r.description} ({formatRupees(r.amount)}) — {r.reason} · {r.byName}
                  </Text>
                ))}
              </VStack>
            ) : null}
          </VStack>
        </Card>

        <Totals bill={bill} />

        {draft && canManage ? <DraftActions bill={bill} /> : null}
        {draft && canApprove && bill.discount.status === "pending" ? <DiscountDecision bill={bill} /> : null}
        {payable && canPay ? <PaymentForm key={`${bill.balanceDue}`} bill={bill} /> : null}
        <Payments bill={bill} canVoid={canManage} />
      </VStack>
    </Screen>
  );
}

function Totals({ bill }: { bill: Bill }) {
  const d = bill.discount;
  return (
    <Card testID="bill-totals">
      <VStack gap={6}>
        <Row label="Subtotal" value={formatRupees(bill.subtotal)} />
        {d.status !== "none" ? (
          <Row
            label={`Discount (${d.status === "approved" ? `approved by ${d.decidedByName}` : d.status === "pending" ? "waiting for approval" : "rejected"})`}
            value={d.status === "approved" ? `− ${formatRupees(bill.discountAmount)}` : formatRupees(d.amount)}
            muted={d.status !== "approved"}
            testID="bill-discount"
          />
        ) : null}
        <Row label="Tax" value={formatRupees(bill.tax)} />
        <View style={styles.divider} />
        <Row label="Total" value={formatRupees(bill.total)} strong testID="bill-total" />
        {bill.status !== "draft" && bill.status !== "cancelled" ? (
          <>
            <Row label="Paid" value={formatRupees(bill.amountPaid)} testID="bill-paid" />
            <Row label="Balance due" value={formatRupees(bill.balanceDue)} strong testID="bill-balance" />
          </>
        ) : null}
      </VStack>
    </Card>
  );
}

function Row({ label, value, strong, muted, testID }: { label: string; value: string; strong?: boolean; muted?: boolean; testID?: string }) {
  return (
    <HStack justify="space-between" align="center">
      <Text variant={strong ? "label" : "body-sm"} tone={muted ? "tertiary" : "secondary"}>{label}</Text>
      <Text variant={strong ? "label-lg" : "body-sm"} tabular tone={muted ? "tertiary" : "primary"} testID={testID}>{value}</Text>
    </HStack>
  );
}

function RemoveLine({ bill, line, onDone }: { bill: Bill; line: Charge; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const remove = useRemoveLine(bill.id);
  return (
    <VStack gap={8} style={styles.subform} testID="remove-line-form">
      <Text variant="label">Remove {line.description}?</Text>
      <TextField label="Why" hint="The charge is released and will be compiled onto the next bill." value={reason} onChangeText={setReason} testID="remove-reason" />
      {remove.isError ? <Banner tone="danger" message={apiErrorMessage(remove.error)} /> : null}
      <HStack gap={8}>
        <Button label="Remove charge" size="sm" variant="destructive" disabled={reason.trim().length < 5} loading={remove.isPending} onPress={() => remove.mutate({ lineId: line.id!, reason: reason.trim() }, { onSuccess: onDone })} testID="remove-submit" />
        <Button label="Keep it" size="sm" variant="ghost" onPress={onDone} />
      </HStack>
    </VStack>
  );
}

function DraftActions({ bill }: { bill: Bill }) {
  const { data: tariff = [] } = useTariff();
  const refresh = useRefreshBill(bill.id);
  const addService = useAddService(bill.id);
  const discount = useRequestDiscount(bill.id);
  const finalise = useFinaliseBill(bill.id);
  const cancel = useCancelBill(bill.id);

  const [tariffId, setTariffId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const error = [refresh, addService, discount, finalise, cancel].find((m) => m.isError)?.error;

  return (
    <Card testID="draft-actions">
      <VStack gap={14}>
        <SectionHeader title="Draft" subtitle="Check the charges, then finalise" />
        {error ? (
          <View testID="draft-error">
            <Banner tone="danger" message={apiErrorMessage(error)} />
          </View>
        ) : null}

        <HStack gap={8} wrap>
          <Button label="Refresh charges" size="sm" variant="secondary" loading={refresh.isPending} onPress={() => refresh.mutate(undefined as never)} testID="refresh-bill" />
        </HStack>

        <VStack gap={8}>
          <Text variant="label">Add a procedure or service</Text>
          <HStack gap={8} wrap align="flex-end">
            <View style={{ flex: 1, minWidth: 220 }}>
              <Select
                label="From the tariff"
                value={tariffId}
                onChange={setTariffId}
                options={tariff.map((t) => ({ value: t.id, label: t.name, sublabel: formatRupees(t.price) }))}
                placeholder="Choose a service"
              />
            </View>
            <TextField label="Quantity" numericField value={quantity} onChangeText={setQuantity} containerStyle={{ width: 110 }} />
            <Button
              label="Add"
              size="sm"
              disabled={!tariffId || !(Number(quantity) >= 1)}
              loading={addService.isPending}
              onPress={() => addService.mutate({ tariffId: tariffId!, quantity: Math.floor(Number(quantity)) }, { onSuccess: () => setTariffId(null) })}
              testID="add-service"
            />
          </HStack>
          <Text variant="caption" tone="tertiary">Prices come from the tariff set by administration.</Text>
        </VStack>

        {bill.discount.status === "none" || bill.discount.status === "rejected" ? (
          <VStack gap={8}>
            <Text variant="label">Request a discount</Text>
            {bill.discount.status === "rejected" ? (
              <Text variant="caption" tone="warning">
                The last request was rejected by {bill.discount.decidedByName}: {bill.discount.decisionNote || "no note"}
              </Text>
            ) : null}
            <HStack gap={8} wrap>
              <TextField label="Amount" numericField suffix="₹" value={discountAmount} onChangeText={setDiscountAmount} containerStyle={{ width: 140 }} testID="discount-amount" />
              <TextField label="Reason" value={discountReason} onChangeText={setDiscountReason} containerStyle={{ flex: 1, minWidth: 220 }} testID="discount-reason" />
            </HStack>
            <Button
              label="Send for approval"
              size="sm"
              variant="secondary"
              disabled={!(Number(discountAmount) > 0) || discountReason.trim().length < 10}
              loading={discount.isPending}
              onPress={() => discount.mutate({ amount: Number(discountAmount), reason: discountReason.trim() })}
              testID="discount-submit"
            />
            <Text variant="caption" tone="tertiary">A discount is applied only once someone else approves it.</Text>
          </VStack>
        ) : bill.discount.status === "pending" ? (
          <Text variant="caption" tone="warning" testID="discount-pending">
            Discount of {formatRupees(bill.discount.amount)} waiting for approval — {bill.discount.reason}
          </Text>
        ) : null}

        <HStack gap={8} wrap>
          <Button label="Finalise bill" onPress={() => setConfirm(true)} testID="finalise-open" />
          {!cancelling ? <Button label="Cancel draft" variant="ghost" onPress={() => setCancelling(true)} /> : null}
        </HStack>
        {cancelling ? (
          <HStack gap={8} wrap align="flex-end">
            <TextField label="Why cancel" value={cancelReason} onChangeText={setCancelReason} containerStyle={{ flex: 1, minWidth: 220 }} />
            <Button label="Cancel draft" size="sm" variant="destructive" disabled={cancelReason.trim().length < 5} loading={cancel.isPending} onPress={() => cancel.mutate(cancelReason.trim())} />
          </HStack>
        ) : null}
      </VStack>

      <ConfirmDialog
        visible={confirm}
        title="Finalise this bill?"
        message={`${formatRupees(bill.total)} for ${bill.patient.fullName}. Once finalised, the bill accepts payment but its charges cannot change.`}
        confirmLabel="Finalise"
        cancelLabel="Not yet"
        loading={finalise.isPending}
        onConfirm={() => finalise.mutate(undefined as never, { onSettled: () => setConfirm(false) })}
        onCancel={() => setConfirm(false)}
      />
    </Card>
  );
}

function DiscountDecision({ bill }: { bill: Bill }) {
  const [note, setNote] = useState("");
  const decide = useDecideDiscount(bill.id);
  return (
    <Card testID="discount-decision">
      <VStack gap={10}>
        <SectionHeader title="Discount approval" subtitle={`Requested by ${bill.discount.requestedByName}`} />
        <Text variant="body">
          {formatRupees(bill.discount.amount)} — {bill.discount.reason}
        </Text>
        <TextField label="Note" value={note} onChangeText={setNote} />
        {decide.isError ? <Banner tone="danger" message={apiErrorMessage(decide.error)} /> : null}
        <HStack gap={8}>
          <Button label="Approve" size="sm" loading={decide.isPending} onPress={() => decide.mutate({ approve: true, note })} testID="discount-approve" />
          <Button label="Reject" size="sm" variant="secondary" loading={decide.isPending} onPress={() => decide.mutate({ approve: false, note })} testID="discount-reject" />
        </HStack>
      </VStack>
    </Card>
  );
}

const METHODS: PaymentMethod[] = ["cash", "card", "upi", "bank_transfer", "cheque"];

function PaymentForm({ bill }: { bill: Bill }) {
  const [amount, setAmount] = useState(String(bill.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const pay = useRecordPayment(bill.id);

  const value = Number(amount);
  const tooMuch = value > bill.balanceDue;
  const needsReference = method !== "cash";
  const ready =
    value > 0 &&
    !tooMuch &&
    (!needsReference || reference.trim()) &&
    (method !== "cheque" || (bankName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(chequeDate)));

  return (
    <Card testID="payment-form">
      <VStack gap={10}>
        <SectionHeader title="Record payment" subtitle={`Balance due ${formatRupees(bill.balanceDue)}`} />
        {pay.isError ? (
          <View testID="payment-error">
            <Banner tone="danger" message={apiErrorMessage(pay.error)} />
          </View>
        ) : null}
        <HStack gap={8} wrap>
          {METHODS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              style={[styles.method, method === m ? styles.methodOn : null]}
              accessibilityRole="radio"
              accessibilityState={{ checked: method === m }}
              {...checkable(method === m, () => setMethod(m))}
              testID={`pay-method-${m}`}
            >
              <Text variant="label-sm">{PAYMENT_METHOD_LABELS[m]}</Text>
            </Pressable>
          ))}
        </HStack>
        <HStack gap={8} wrap>
          <TextField
            label="Amount"
            numericField
            suffix="₹"
            value={amount}
            onChangeText={setAmount}
            error={tooMuch ? `More than the balance of ${formatRupees(bill.balanceDue)}` : undefined}
            containerStyle={{ width: 180 }}
            testID="pay-amount"
          />
          {needsReference ? (
            <TextField
              label={method === "card" ? "Approval code or last 4" : method === "upi" ? "UPI reference" : method === "cheque" ? "Cheque number" : "Transfer reference (UTR)"}
              value={reference}
              onChangeText={setReference}
              containerStyle={{ flex: 1, minWidth: 180 }}
              testID="pay-reference"
            />
          ) : null}
        </HStack>
        {method === "cheque" ? (
          <HStack gap={8} wrap>
            <TextField label="Bank" value={bankName} onChangeText={setBankName} containerStyle={{ flex: 1, minWidth: 160 }} />
            <TextField label="Cheque date" placeholder="YYYY-MM-DD" value={chequeDate} onChangeText={setChequeDate} containerStyle={{ width: 160 }} />
          </HStack>
        ) : null}
        <Button
          label={`Record ${value > 0 ? formatRupees(value) : "payment"}`}
          disabled={!ready}
          loading={pay.isPending}
          onPress={() =>
            pay.mutate({
              amount: value,
              method,
              reference: reference.trim() || undefined,
              bankName: bankName.trim() || undefined,
              chequeDate: chequeDate || undefined,
            })
          }
          testID="pay-submit"
        />
      </VStack>
    </Card>
  );
}

function Payments({ bill, canVoid }: { bill: Bill; canVoid: boolean }) {
  const navigation = useNavigation<any>();
  const voidPayment = useVoidPayment();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const payments = bill.payments ?? [];
  if (payments.length === 0) return null;

  return (
    <Card testID="bill-payments">
      <SectionHeader title="Payments" />
      <VStack gap={0}>
        {payments.map((p) => (
          <View key={p.id} style={styles.payment} testID={`payment-${p.receiptNumber}`}>
            <HStack gap={10} align="center" wrap>
              <VStack gap={1} style={{ flex: 1, minWidth: 200 }}>
                <Text variant="label-sm" style={p.isVoid ? { textDecorationLine: "line-through" } : undefined}>
                  {p.receiptNumber} · {formatRupees(p.amount)} · {p.methodLabel}
                  {p.reference ? ` · ${p.reference}` : ""}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatDateTime(p.receivedAt)} · {p.receivedByName}
                  {p.isVoid ? ` · VOID: ${p.voidReason} (${p.voidedByName})` : ""}
                </Text>
              </VStack>
              <Button label="Receipt" size="xs" variant="secondary" onPress={() => navigation.navigate("Receipt", { paymentId: p.id })} testID={`receipt-${p.receiptNumber}`} />
              {canVoid && !p.isVoid ? <Button label="Void" size="xs" variant="ghost" onPress={() => { setVoiding(p.id); setReason(""); }} /> : null}
            </HStack>
            {voiding === p.id ? (
              <HStack gap={8} wrap align="flex-end" style={{ marginTop: 6 }}>
                <TextField label="Why void it" value={reason} onChangeText={setReason} containerStyle={{ flex: 1, minWidth: 200 }} />
                <Button
                  label="Void payment"
                  size="sm"
                  variant="destructive"
                  disabled={reason.trim().length < 5}
                  loading={voidPayment.isPending}
                  onPress={() => voidPayment.mutate({ paymentId: p.id, reason: reason.trim() }, { onSuccess: () => setVoiding(null) })}
                />
              </HStack>
            ) : null}
          </View>
        ))}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: palette.border.default, marginVertical: 4 },
  subform: { paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border.subtle },
  method: {
    minHeight: layout.minTouchTarget,
    minWidth: 90,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
  },
  methodOn: { borderColor: palette.border.focus, backgroundColor: palette.surface.secondary },
  payment: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.border.subtle },
});
