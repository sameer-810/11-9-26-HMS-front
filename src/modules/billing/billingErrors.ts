import { apiErrorCode, apiErrorMessage } from "@api/apiClient";

/**
 * Plain words for refusals on credit notes and refunds. Codes whose server message
 * already carries the specific figure (how much can be credited or refunded) keep it.
 */
const MESSAGES: Record<string, string> = {
  BILL_NOT_CREDITABLE:
    "Only a finalised bill can be corrected with a credit note. A draft's charges can still be changed directly.",
  CREDIT_NOTE_PENDING:
    "A credit note on this bill is already waiting for a decision. It needs to be approved or rejected before another is asked for.",
  SELF_APPROVAL:
    "You asked for this credit note, so someone else has to decide on it.",
  BALANCE_CHANGED:
    "A payment or refund was recorded on this bill a moment ago. The bill has been reloaded — check the figures and try again.",
  NO_PENDING_CREDIT_NOTE:
    "This credit note has already been decided. The bill has been reloaded.",
};

export function correctionErrorMessage(err: unknown): string {
  const code = apiErrorCode(err);
  return (code && MESSAGES[code]) || apiErrorMessage(err);
}
