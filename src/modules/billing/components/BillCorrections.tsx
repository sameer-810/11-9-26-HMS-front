import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { palette, radius, layout } from "@shared/designSystem";
import {
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  TextField,
  Banner,
} from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { formatDateTime, formatRupees } from "@shared/format";
import {
  useDecideCreditNote,
  useRecordRefund,
  useRequestCreditNote,
} from "@modules/billing/hooks/useBilling";
import { correctionErrorMessage } from "@modules/billing/billingErrors";
import {
  CREDIT_NOTE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type Bill,
  type CreditNote,
  type PaymentMethod,
} from "@modules/billing/types";

const MIN_CREDIT_REASON = 10;
const MIN_REFUND_REASON = 5;

/** Rupees and paise both count; the server works in paise. */
const toPaise = (rupees: number) => Math.round(rupees * 100);

/**
 * "Correct this bill": billing asks for a credit note on a finalised bill.
 * The charges stay as they are; an approved credit note lowers what is owed.
 */
export function CreditNoteRequest({ bill }: { bill: Bill }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const request = useRequestCreditNote(bill.id);

  const pending = bill.creditNotes.find((c) => c.status === "pending");
  const creditable = Math.max(0, toPaise(bill.total) - toPaise(bill.credited)) / 100;
  const value = Number(amount);
  const tooMuch = amount.trim() !== "" && toPaise(value) > toPaise(creditable);
  const shortReason =
    reason.trim().length > 0 && reason.trim().length < MIN_CREDIT_REASON;
  const ready =
    value > 0 && !tooMuch && reason.trim().length >= MIN_CREDIT_REASON;

  return (
    <Card testID="credit-note-form">
      <VStack gap={10}>
        <SectionHeader
          title="Correct this bill"
          subtitle="Raise a credit note if something was charged in error"
        />
        <Text variant="body-sm" tone="secondary">
          The charges on a finalised bill never change. A credit note lowers
          what the patient owes instead, and counts only once administration
          approves it. If the patient has already paid more than the new
          total, the difference is shown as a refund due.
        </Text>

        {pending ? (
          <Text variant="body-sm" tone="warning" testID="credit-note-waiting">
            {pending.creditNoteNumber} for {formatRupees(pending.amount)} is
            waiting for approval. Another credit note can be asked for once it
            is decided.
          </Text>
        ) : creditable <= 0 ? (
          <Text variant="body-sm" tone="tertiary">
            The whole bill has already been credited.
          </Text>
        ) : (
          <>
            {request.isError ? (
              <View testID="credit-note-error">
                <Banner
                  tone="danger"
                  message={correctionErrorMessage(request.error)}
                />
              </View>
            ) : null}
            <HStack gap={8} wrap>
              <TextField
                label="Amount to credit"
                numericField
                prefix="₹"
                value={amount}
                onChangeText={setAmount}
                hint={`At most ${formatRupees(creditable)}`}
                error={
                  tooMuch
                    ? `At most ${formatRupees(creditable)} can still be credited on this bill`
                    : undefined
                }
                containerStyle={{ width: 220 }}
                testID="credit-note-amount"
              />
              <TextField
                label="What was wrong"
                value={reason}
                onChangeText={setReason}
                placeholder="For example, ECG charged but not done"
                error={
                  shortReason
                    ? `Say what was wrong in a sentence — at least ${MIN_CREDIT_REASON} characters. It is what an auditor reads.`
                    : undefined
                }
                containerStyle={{ flex: 1, minWidth: 240 }}
                testID="credit-note-reason"
              />
            </HStack>
            <Button
              label="Send for approval"
              size="sm"
              variant="secondary"
              disabled={!ready}
              loading={request.isPending}
              onPress={() =>
                request.mutate(
                  { amount: value, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setAmount("");
                      setReason("");
                    },
                  },
                )
              }
              testID="credit-note-submit"
            />
          </>
        )}
      </VStack>
    </Card>
  );
}

/** Every credit note on the bill; an approver decides the waiting one here. */
export function CreditNotes({
  bill,
  canDecide,
}: {
  bill: Bill;
  canDecide: boolean;
}) {
  if (bill.creditNotes.length === 0) return null;
  return (
    <Card testID="bill-credit-notes">
      <SectionHeader
        title="Credit notes"
        subtitle="Corrections to this bill. Only approved ones change what is owed."
      />
      <VStack gap={0}>
        {[...bill.creditNotes].reverse().map((c) => (
          <CreditNoteRow
            key={c.id}
            bill={bill}
            note={c}
            canDecide={canDecide && c.status === "pending"}
          />
        ))}
      </VStack>
    </Card>
  );
}

function CreditNoteRow({
  bill,
  note: c,
  canDecide,
}: {
  bill: Bill;
  note: CreditNote;
  canDecide: boolean;
}) {
  const [decisionNote, setDecisionNote] = useState("");
  const decide = useDecideCreditNote(bill.id);
  const tone =
    c.status === "pending"
      ? "warning"
      : c.status === "approved"
        ? "success"
        : "tertiary";

  return (
    <View style={styles.row} testID={`credit-note-${c.creditNoteNumber}`}>
      <VStack gap={2}>
        <HStack gap={8} align="center" wrap>
          <Text variant="label-sm">
            {c.creditNoteNumber} · {formatRupees(c.amount)}
          </Text>
          <Text
            variant="label-sm"
            tone={tone}
            testID={`credit-note-status-${c.creditNoteNumber}`}
          >
            {CREDIT_NOTE_STATUS_LABELS[c.status]}
          </Text>
        </HStack>
        <Text variant="body-sm">{c.reason}</Text>
        <Text variant="caption" tone="tertiary">
          Asked by {c.requestedByName} · {formatDateTime(c.requestedAt)}
        </Text>
        {c.status !== "pending" && c.decidedByName ? (
          <Text variant="caption" tone="tertiary">
            {c.status === "approved" ? "Approved" : "Rejected"} by{" "}
            {c.decidedByName} · {formatDateTime(c.decidedAt)}
            {c.decisionNote ? ` — ${c.decisionNote}` : ""}
          </Text>
        ) : null}
      </VStack>

      {canDecide ? (
        <VStack gap={8} style={styles.decision} testID="credit-note-decision">
          <Text variant="body-sm" tone="secondary">
            Approving lowers the amount owed on {bill.billNumber} by{" "}
            {formatRupees(c.amount)}. Anything already paid beyond the new
            total becomes a refund due.
          </Text>
          <TextField
            label="Note (optional)"
            value={decisionNote}
            onChangeText={setDecisionNote}
            containerStyle={{ maxWidth: 480 }}
            testID="credit-note-decision-note"
          />
          {decide.isError ? (
            <View testID="credit-note-decision-error">
              <Banner
                tone="danger"
                message={correctionErrorMessage(decide.error)}
              />
            </View>
          ) : null}
          <HStack gap={8}>
            <Button
              label="Approve"
              size="sm"
              loading={decide.isPending}
              onPress={() =>
                decide.mutate({
                  creditNoteId: c.id,
                  approve: true,
                  note: decisionNote.trim() || undefined,
                })
              }
              testID="credit-note-approve"
            />
            <Button
              label="Reject"
              size="sm"
              variant="secondary"
              loading={decide.isPending}
              onPress={() =>
                decide.mutate({
                  creditNoteId: c.id,
                  approve: false,
                  note: decisionNote.trim() || undefined,
                })
              }
              testID="credit-note-reject"
            />
          </HStack>
        </VStack>
      ) : null}
    </View>
  );
}

const METHODS: PaymentMethod[] = [
  "cash",
  "card",
  "upi",
  "bank_transfer",
  "cheque",
];

const REFERENCE_LABELS: Record<Exclude<PaymentMethod, "cash">, string> = {
  card: "Card reversal reference",
  upi: "UPI reference",
  bank_transfer: "Transfer reference (UTR)",
  cheque: "Cheque number",
};

/** "Pay back ₹X": money handed back once credit notes leave the patient in credit. */
export function RefundForm({ bill }: { bill: Bill }) {
  const [amount, setAmount] = useState(String(bill.refundDue));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const refund = useRecordRefund(bill.id);

  const value = Number(amount);
  const tooMuch = toPaise(value) > toPaise(bill.refundDue);
  const needsReference = method !== "cash";
  const missingReference = needsReference && !reference.trim();
  const ready =
    value > 0 &&
    !tooMuch &&
    !missingReference &&
    reason.trim().length >= MIN_REFUND_REASON;

  return (
    <Card testID="refund-form">
      <VStack gap={10}>
        <SectionHeader
          title={`Pay back ${formatRupees(bill.refundDue)}`}
          subtitle="The patient has paid more than the bill now comes to"
        />
        <Text variant="body-sm" tone="secondary">
          Record the money as it is handed back. The refund slip is then
          ready to print for the patient to sign.
        </Text>
        {refund.isError ? (
          <View testID="refund-error">
            <Banner tone="danger" message={correctionErrorMessage(refund.error)} />
          </View>
        ) : null}
        <HStack
          gap={8}
          wrap
          role="radiogroup"
          accessibilityLabel="How the money is paid back"
        >
          {METHODS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              style={[styles.method, method === m ? styles.methodOn : null]}
              accessibilityRole="radio"
              accessibilityLabel={`Pay back by ${PAYMENT_METHOD_LABELS[m]}`}
              accessibilityState={{ checked: method === m }}
              {...checkable(method === m, () => setMethod(m))}
              testID={`refund-method-${m}`}
            >
              <Text variant="label-sm">{PAYMENT_METHOD_LABELS[m]}</Text>
            </Pressable>
          ))}
        </HStack>
        <HStack gap={8} wrap>
          <TextField
            label="Amount"
            numericField
            prefix="₹"
            value={amount}
            onChangeText={setAmount}
            error={
              tooMuch
                ? `Only ${formatRupees(bill.refundDue)} is owed back on this bill`
                : undefined
            }
            containerStyle={{ width: 180 }}
            testID="refund-amount"
          />
          {method !== "cash" ? (
            <TextField
              label={REFERENCE_LABELS[method]}
              value={reference}
              onChangeText={setReference}
              hint={
                missingReference
                  ? "Needed for anything but cash, so the refund can be traced"
                  : undefined
              }
              containerStyle={{ flex: 1, minWidth: 200 }}
              testID="refund-reference"
            />
          ) : null}
        </HStack>
        <TextField
          label="Why the money is being paid back"
          value={reason}
          onChangeText={setReason}
          placeholder="For example, credit note for ECG not done"
          containerStyle={{ maxWidth: 560 }}
          testID="refund-reason"
        />
        <Button
          label={`Pay back ${value > 0 ? formatRupees(value) : ""}`.trim()}
          disabled={!ready}
          loading={refund.isPending}
          onPress={() =>
            refund.mutate({
              amount: value,
              method,
              reference: reference.trim() || undefined,
              reason: reason.trim(),
            })
          }
          testID="refund-submit"
        />
      </VStack>
    </Card>
  );
}

export function Refunds({ bill }: { bill: Bill }) {
  const navigation = useNavigation<any>();
  const refunds = bill.refunds ?? [];
  if (refunds.length === 0) return null;
  return (
    <Card testID="bill-refunds">
      <SectionHeader title="Refunds" />
      <VStack gap={0}>
        {refunds.map((r) => (
          <View key={r.id} style={styles.row} testID={`refund-${r.refundNumber}`}>
            <HStack gap={10} align="center" wrap>
              <VStack gap={1} style={{ flex: 1, minWidth: 200 }}>
                <Text variant="label-sm">
                  {r.refundNumber} · {formatRupees(r.amount)} · {r.methodLabel}
                  {r.reference ? ` · ${r.reference}` : ""}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatDateTime(r.paidOutAt)} · {r.paidOutByName} · {r.reason}
                </Text>
              </VStack>
              <Button
                label="Refund slip"
                size="xs"
                variant="secondary"
                accessibilityHint={`Opens the slip for ${r.refundNumber}`}
                onPress={() =>
                  navigation.navigate("RefundSlip", { refundId: r.id })
                }
                testID={`refund-slip-${r.refundNumber}`}
              />
            </HStack>
          </View>
        ))}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
  decision: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
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
  methodOn: {
    borderColor: palette.border.focus,
    backgroundColor: palette.surface.secondary,
  },
});
