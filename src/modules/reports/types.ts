/** AD-03 report types; reports are aggregate only and never name a patient. */

export type SummaryUnit = "%" | "min" | "days" | "₹";

/** One entry from GET /reports — only the reports this user may run. */
export interface ReportDefinition {
  key: string;
  title: string;
  /** What the department filter means for this report, in a sentence. */
  departmentBasis: string;
}

export interface ReportSummaryItem {
  label: string;
  /** Null means nothing to measure — a median of no waits — not zero. */
  value: number | null;
  unit?: SummaryUnit;
}

export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

/** One calendar day, gap-free across the range, with one or more counts. */
export interface ReportSeriesPoint {
  date: string;
  [field: string]: number | string;
}

export interface ReportResult {
  key: string;
  title: string;
  range: { from: string; to: string; days: number; timeZone: string };
  department: { id: string; name: string } | null;
  departmentBasis: string;
  summary: ReportSummaryItem[];
  series?: ReportSeriesPoint[];
  table: { columns: { key: string; label: string }[]; rows: ReportRow[] };
}

/** Calendar dates in the hospital's calendar, "YYYY-MM-DD". */
export interface ReportFilters {
  from: string;
  to: string;
  departmentId?: string;
}
