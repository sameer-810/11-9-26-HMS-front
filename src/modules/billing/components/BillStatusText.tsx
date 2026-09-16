import React from "react";
import { Text } from "@shared/ui";
import { BILL_STATUS_LABELS, type BillStatus } from "@modules/billing/types";

/** A bill's status in the operational palette, never the clinical signal colours. */
export function BillStatusText({
  status,
  testID,
}: {
  status: BillStatus;
  testID?: string;
}) {
  const tone =
    status === "paid"
      ? "success"
      : status === "draft"
        ? "info"
        : status === "cancelled"
          ? "tertiary"
          : "warning";
  return (
    <Text variant="label-sm" tone={tone} testID={testID}>
      {BILL_STATUS_LABELS[status]}
    </Text>
  );
}
