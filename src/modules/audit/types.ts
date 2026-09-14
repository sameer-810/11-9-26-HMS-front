/** The audit trail is read-only: entries are written by the actions they record. */

export type AuditOutcome = "success" | "failure" | "denied";

export const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  success: "Success",
  failure: "Failed",
  denied: "Denied",
};

export interface AuditEntry {
  id: string;
  /** Dotted, prefix-searchable: "auth.login.failed", "record.break_glass". */
  action: string;
  user: { id: string | null; name: string; role: string; employeeId: string };
  entityType: string;
  entityId: string | null;
  patientId: string | null;
  description: string;
  outcome: AuditOutcome;
  breakGlass: boolean;
  reason: string;
  requestId: string;
  ip: string;
  createdAt: string;
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: string;
  patientId?: string;
  action?: string;
  entityType?: string;
  outcome?: AuditOutcome;
  /** A query string, so the server's enum is "true" | "false", not a boolean. */
  breakGlass?: "true" | "false";
  /** Instants (ISO). The server compares them against createdAt. */
  from?: string;
  to?: string;
}

/** Note `pages`: the audit controller names it differently from the grants route. */
export interface AuditListResponse {
  data: AuditEntry[];
  meta: { total: number; pages: number; page: number };
}

export type GrantStatus = "pending" | "appropriate" | "inappropriate";
export type GrantOutcome = Exclude<GrantStatus, "pending">;

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  pending: "Awaiting review",
  appropriate: "Reviewed: appropriate",
  inappropriate: "Reviewed: inappropriate",
};

/** An emergency ("break the glass") access to one restricted record. */
export interface BreakGlassGrant {
  id: string;
  userName: string;
  userRole: string;
  /** Only `id` when the patient could not be populated. */
  patient: { id: string; patientId?: string; fullName?: string };
  category: string;
  categoryLabel: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  active: boolean;
  viewCount: number;
  review: { status: GrantStatus; reviewedByName: string; reviewedAt: string | null; note: string };
}

export interface GrantListResponse {
  data: BreakGlassGrant[];
  meta: { total: number; page: number; totalPages: number };
}

export interface GrantReviewBody {
  outcome: GrantOutcome;
  note?: string;
}

/** Mirrors the server's NOTE_REQUIRED rule for an inappropriate finding. */
export const REVIEW_NOTE_MIN = 10;
