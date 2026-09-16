import React from "react";
import { SignalBadge } from "@shared/ui";
import type { ExpiryStatus } from "@modules/inventory/types";
import type { StockStatus } from "@modules/pharmacy/types";
import { formatExpiry } from "@modules/inventory/utils/expiry";

/** the three stock states on the signal ramp, so each carries a shape as well as a colour. */
export function StockStatusBadge({ status, label }: { status: StockStatus; label?: string }) {
  const level = status === "out_of_stock" ? "urgent" : status === "low_stock" ? "caution" : "normal";
  const text = label ?? (status === "out_of_stock" ? "Out of stock" : status === "low_stock" ? "Low stock" : "In stock");
  return <SignalBadge level={level} label={text} size="sm" />;
}

/** expiry as text. "expired" sits at the critical tier: it must not be misread in a dispensing list. */
export function ExpiryBadge({ status, date, days }: { status: ExpiryStatus; date: string; days: number }) {
  if (status === "expired") return <SignalBadge level="critical" label={`Expired ${formatExpiry(date)}`} size="sm" />;
  if (status === "short_dated") {
    return (
      <SignalBadge
        level="caution"
        label={days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`}
        size="sm"
      />
    );
  }
  // a badge, not a bare date: a green date would carry its meaning in colour alone.
  return <SignalBadge level="normal" label={formatExpiry(date)} size="sm" />;
}
