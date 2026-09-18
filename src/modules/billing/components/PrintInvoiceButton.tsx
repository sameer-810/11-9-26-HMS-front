import React from "react";

import { useAuthStore } from "@shared/store/useAuthStore";
import { PrintButton } from "@modules/printing/components/PrintButton";
import { buildInvoice } from "@modules/printing/documents/invoice";
import { billingApi } from "@modules/billing/api/billingApi";
import type { Bill } from "@modules/billing/types";

/**
 * A4 invoice for a finalised bill. Drafts are refused, not watermarked: their charges can
 * still change. Letterhead and footer are read at press time so the print is current.
 */
export function PrintInvoiceButton({ bill }: { bill: Bill }) {
  const hospitalName = useAuthStore((s) => s.hospital?.name ?? "");
  const printedBy = useAuthStore((s) => s.user?.fullName ?? "");
  const draft = bill.status === "draft";

  return (
    <PrintButton
      label="Print invoice"
      printerClass="page"
      disabled={draft}
      disabledReason="A draft can still change. Finalise the bill to print its invoice."
      testID="print-invoice"
      build={async () => {
        const [hospital, settings] = await Promise.all([
          // Without the hospital profile the invoice still prints, under the name alone.
          billingApi.hospital().catch(() => null),
          billingApi.settings().catch(() => null),
        ]);
        const a = hospital?.address;
        return buildInvoice({
          hospital: {
            name: hospital?.name || hospitalName,
            address: a
              ? [a.line1, a.line2, a.city, a.state, a.pincode]
                  .filter(Boolean)
                  .join(", ")
              : "",
            phone: hospital?.phone ?? "",
            email: hospital?.email ?? "",
            gstin: hospital?.gstin ?? "",
            registrationNumber: hospital?.registrationNumber ?? "",
          },
          bill,
          footer: settings?.receiptFooter ?? "",
          printedBy,
          printedAt: new Date(),
        });
      }}
    />
  );
}
