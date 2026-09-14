import React, { useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { BarChart3, Download } from "lucide-react-native";

import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  StatTile,
  SectionHeader,
  type Column,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { addCalendarDays, formatNumber, formatRupees, shortDate, todayCalendarDate } from "@shared/format";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import { useExportReportCsv, useReport, useReportCatalogue } from "@modules/reports/hooks/useReports";
import { FilterChip } from "@modules/reports/components/FilterChip";
import { SeriesChart, firstNumericField } from "@modules/reports/components/SeriesChart";
import type { ReportCell, ReportResult, ReportRow, ReportSummaryItem } from "@modules/reports/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Presets are calendar strings built by string arithmetic on today's date.
 * Going through `toISOString()` would hand back the UTC date, which for the
 * first five and a half hours of every Indian morning is yesterday.
 */
const PRESETS: { key: string; label: string; range: (today: string) => { from: string; to: string } }[] = [
  { key: "today", label: "Today", range: (t) => ({ from: t, to: t }) },
  { key: "last-7-days", label: "Last 7 days", range: (t) => ({ from: addCalendarDays(t, -6), to: t }) },
  { key: "last-30-days", label: "Last 30 days", range: (t) => ({ from: addCalendarDays(t, -29), to: t }) },
  { key: "this-month", label: "This month", range: (t) => ({ from: `${t.slice(0, 8)}01`, to: t }) },
];

/** What each report's day-by-day series counts. */
const SERIES_TITLES: Record<string, string> = {
  registrations: "Registrations per day",
  opd: "Appointments per day",
  admissions: "Admissions per day",
  laboratory: "Tests ordered per day",
  pharmacy: "Dispensings per day",
  billing: "Collected per day",
  inventory: "Stock movements per day",
  emergency: "Arrivals per day",
};

/** The only series the server sends in rupees. */
const MONEY_SERIES_FIELDS = new Set(["collected"]);

function formatSummaryValue({ value, unit }: ReportSummaryItem): string {
  // Null is "nothing to measure", and a dash keeps it from reading as zero.
  if (value === null || value === undefined) return "—";
  switch (unit) {
    case "₹":
      return formatRupees(value);
    case "%":
      return `${formatNumber(value)}%`;
    case "min":
      return `${formatNumber(value)} min`;
    case "days":
      return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
    default:
      return formatNumber(value);
  }
}

function formatCell(key: string, value: ReportCell): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return formatNumber(value);
  if (key === "date" && DATE_RE.test(value)) return shortDate(value);
  return value;
}

/** Report rows carry no ids — they are aggregates — so the position is the key. */
interface IndexedRow {
  index: number;
  row: ReportRow;
}

function ReportTable({ table }: { table: ReportResult["table"] }) {
  const rows: IndexedRow[] = table.rows.map((row, index) => ({ index, row }));
  const columns = table.columns.map((c): Column<IndexedRow> => {
    const numeric = table.rows.some((r) => typeof r[c.key] === "number");
    return {
      key: c.key,
      header: c.label,
      align: numeric ? "right" : "left",
      sortable: true,
      sortValue: ({ row }) => {
        const v = row[c.key];
        if (typeof v === "number") return v;
        return numeric ? -Infinity : String(v ?? "");
      },
      render: ({ row }) => (
        <Text variant="body-sm" tabular={numeric}>
          {formatCell(c.key, row[c.key])}
        </Text>
      ),
    };
  });

  return (
    // The testID sits on a wrapper so it exists for an empty table too, which
    // DataTable renders as an EmptyState with nowhere to put one.
    <View testID="report-table">
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(r) => String(r.index)}
        emptyIcon={BarChart3}
        emptyTitle="No activity in this range"
        emptyMessage="Widen the dates or clear the department filter."
        mobileCard={({ row }) => (
          <Card compact>
            <VStack gap={4}>
              {table.columns.map((c) => (
                <HStack key={c.key} gap={12} justify="space-between">
                  <Text variant="caption" tone="tertiary">
                    {c.label}
                  </Text>
                  <Text variant="body-sm" tabular>
                    {formatCell(c.key, row[c.key])}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Card>
        )}
      />
    </View>
  );
}

/** Web only: hand the browser the file through a throwaway link. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download asynchronously
  // and a URL revoked in the same tick downloads nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * AD-03: hospital activity by date range and department.
 *
 * The list of reports comes from the server, which offers each user only what
 * their role runs — administration all nine, billing its own, the store its
 * own — so there is no client-side guess about who sees which.
 */
export default function ReportsScreen() {
  const today = useMemo(() => todayCalendarDate(), []);
  const catalogue = useReportCatalogue();
  const { data: departments } = useDepartments();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [from, setFrom] = useState(() => addCalendarDays(today, -29));
  const [to, setTo] = useState(today);
  const [departmentId, setDepartmentId] = useState("");
  const [notice, setNotice] = useState<{ tone: "info" | "success"; message: string } | null>(null);

  const reports = catalogue.data ?? [];
  const active = reports.find((r) => r.key === selectedKey) ?? reports[0];
  const fromValid = DATE_RE.test(from);
  const toValid = DATE_RE.test(to);
  const filters = useMemo(() => ({ from, to, departmentId: departmentId || undefined }), [from, to, departmentId]);

  const report = useReport(active?.key, filters, fromValid && toValid);
  const exportCsv = useExportReportCsv();
  const data = report.isError ? undefined : report.data;

  const activePreset = PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === from && r.to === to;
  })?.key;

  const onExport = () => {
    if (!active) return;
    setNotice(null);
    exportCsv.reset();
    if (Platform.OS !== "web") {
      setNotice({ tone: "info", message: "CSV export is available on the web and desktop app." });
      return;
    }
    exportCsv.mutate(
      { key: active.key, filters },
      {
        onSuccess: ({ blob, filename }) => {
          saveBlob(blob, filename);
          setNotice({ tone: "success", message: `Downloaded ${filename}` });
        },
      },
    );
  };

  const seriesField = data?.series?.length ? firstNumericField(data.series) : null;

  return (
    <Screen
      overline="Oversight"
      title="Reports"
      subtitle="Hospital activity by date range and department"
      refreshing={report.isRefetching}
      onRefresh={() => {
        catalogue.refetch();
        report.refetch();
      }}
      testID="reports-screen"
      right={
        <Button
          label="Export CSV"
          size="sm"
          variant="secondary"
          icon={<Download size={15} />}
          disabled={!active || !fromValid || !toValid}
          loading={exportCsv.isPending}
          onPress={onExport}
          testID="report-export-csv"
        />
      }
    >
      {catalogue.isLoading ? (
        <Skeleton height={200} />
      ) : catalogue.isError ? (
        <ErrorState error={catalogue.error} title="Couldn't load the list of reports" onRetry={catalogue.refetch} />
      ) : reports.length === 0 || !active ? (
        <EmptyState
          icon={BarChart3}
          title="No reports for your role"
          message="Administration runs every report; billing and store staff run the report for their own area."
        />
      ) : (
        <VStack gap={16}>
          <Banner tone="info" message="Reports are aggregate — counts, rates, times and amounts. No report names a patient." />

          <HStack gap={8} wrap>
            {reports.map((r) => (
              <FilterChip
                key={r.key}
                label={r.title}
                active={r.key === active.key}
                onPress={() => setSelectedKey(r.key)}
                testID={`report-chip-${r.key}`}
              />
            ))}
          </HStack>

          <Card>
            <VStack gap={12}>
              <HStack gap={8} wrap>
                {PRESETS.map((p) => (
                  <FilterChip
                    key={p.key}
                    label={p.label}
                    active={activePreset === p.key}
                    onPress={() => {
                      const r = p.range(today);
                      setFrom(r.from);
                      setTo(r.to);
                    }}
                    testID={`report-preset-${p.key}`}
                  />
                ))}
              </HStack>
              <HStack gap={12} wrap align="flex-start">
                <TextField
                  label="From"
                  value={from}
                  onChangeText={setFrom}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                  error={fromValid ? undefined : "Use YYYY-MM-DD"}
                  containerStyle={{ flex: 1, minWidth: 150 }}
                  testID="report-from"
                />
                <TextField
                  label="To"
                  value={to}
                  onChangeText={setTo}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                  error={toValid ? undefined : "Use YYYY-MM-DD"}
                  containerStyle={{ flex: 1, minWidth: 150 }}
                  testID="report-to"
                />
                {/* Select takes no testID, so the wrapper carries it. */}
                <View style={{ flex: 2, minWidth: 220 }} testID="report-department">
                  <Select
                    label="Department"
                    value={departmentId}
                    placeholder="All departments"
                    options={[
                      { value: "", label: "All departments" },
                      ...(departments ?? []).map((d) => ({ value: d.id, label: d.name })),
                    ]}
                    onChange={setDepartmentId}
                    // Stated every time: "department" means something different
                    // in each report, and an unstated filter gets misread.
                    hint={`What the department filter counts: ${active.departmentBasis}`}
                  />
                </View>
              </HStack>
            </VStack>
          </Card>

          {report.isError || exportCsv.isError ? (
            <VStack gap={8} testID="report-error">
              {report.isError ? (
                <Banner tone="danger" title="Couldn't run this report" message={apiErrorMessage(report.error)} />
              ) : null}
              {exportCsv.isError ? (
                <Banner tone="danger" title="Couldn't export the CSV" message={apiErrorMessage(exportCsv.error)} />
              ) : null}
            </VStack>
          ) : null}
          {notice ? <Banner tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}

          {!fromValid || !toValid ? null : report.isLoading ? (
            <VStack gap={10}>
              <Skeleton height={90} />
              <Skeleton height={180} />
            </VStack>
          ) : data ? (
            <VStack gap={16} style={{ opacity: report.isPlaceholderData ? 0.6 : 1 }}>
              <SectionHeader
                title={data.title}
                subtitle={`${shortDate(data.range.from)} – ${shortDate(data.range.to)} · ${data.range.days} ${
                  data.range.days === 1 ? "day" : "days"
                } · ${data.department?.name ?? "All departments"} · ${data.range.timeZone}`}
              />
              <HStack gap={10} wrap testID="report-summary">
                {data.summary.map((s) => (
                  <StatTile
                    key={s.label}
                    label={s.label}
                    value={formatSummaryValue(s)}
                    sublabel={s.value === null ? "Nothing to measure" : undefined}
                  />
                ))}
              </HStack>
              {data.series && seriesField ? (
                <SeriesChart
                  series={data.series}
                  field={seriesField}
                  title={SERIES_TITLES[data.key] ?? "Per day"}
                  formatValue={MONEY_SERIES_FIELDS.has(seriesField) ? formatRupees : formatNumber}
                />
              ) : null}
              <ReportTable table={data.table} />
            </VStack>
          ) : null}
        </VStack>
      )}
    </Screen>
  );
}
