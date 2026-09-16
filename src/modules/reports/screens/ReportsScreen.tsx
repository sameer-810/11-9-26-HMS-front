import React, { useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BarChart3, Download, FileSpreadsheet, FileText } from "lucide-react-native";

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
import { useExportReport, useReport, useReportCatalogue } from "@modules/reports/hooks/useReports";
import { EXPORT_TYPES, type ExportFormat } from "@modules/reports/api/reportsApi";
import { FilterChip } from "@modules/reports/components/FilterChip";
import { SeriesChart, firstNumericField } from "@modules/reports/components/SeriesChart";
import type { ReportCell, ReportResult, ReportRow, ReportSummaryItem } from "@modules/reports/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar-string arithmetic, not `toISOString()`, which gives yesterday's UTC date early in IST. */
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
  doctor_activity: "Consultations signed per day",
};

/** The only series the server sends in rupees. */
const MONEY_SERIES_FIELDS = new Set(["collected"]);

const EXPORT_BUTTONS: { format: ExportFormat; label: string; icon: typeof Download }[] = [
  { format: "csv", label: "Export CSV", icon: Download },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { format: "pdf", label: "PDF", icon: FileText },
];

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
    // testID on a wrapper so it also exists when DataTable renders its EmptyState.
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

/**
 * Reports (AD-03, US-39–41) with CSV/Excel/PDF export. The server filters the catalogue by role;
 * other screens can preselect a report via the `report` route param.
 */
export default function ReportsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const today = useMemo(() => todayCalendarDate(), []);
  const catalogue = useReportCatalogue();
  const { data: departments } = useDepartments();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [from, setFrom] = useState(() => addCalendarDays(today, -29));
  const [to, setTo] = useState(today);
  const [departmentId, setDepartmentId] = useState("");
  const [notice, setNotice] = useState<{ tone: "info" | "success"; message: string } | null>(null);

  // A requested report wins until a chip is pressed, which clears the route param.
  const requested: string | undefined = route.params?.report;
  const choose = (key: string) => {
    setSelectedKey(key);
    if (requested) navigation.setParams({ report: undefined });
  };

  const reports = catalogue.data ?? [];
  const active = reports.find((r) => r.key === (requested ?? selectedKey)) ?? reports[0];
  const fromValid = DATE_RE.test(from);
  const toValid = DATE_RE.test(to);
  const filters = useMemo(() => ({ from, to, departmentId: departmentId || undefined }), [from, to, departmentId]);

  const report = useReport(active?.key, filters, fromValid && toValid);
  const exportReport = useExportReport();
  const data = report.isError ? undefined : report.data;

  const activePreset = PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === from && r.to === to;
  })?.key;

  const onExport = (format: ExportFormat) => {
    if (!active) return;
    setNotice(null);
    exportReport.reset();
    exportReport.mutate(
      { key: active.key, filters, format },
      {
        onSuccess: ({ filename }) =>
          setNotice({
            tone: "success",
            message: Platform.OS === "web" ? `Downloaded ${filename}` : `${filename} is ready to save or send`,
          }),
      },
    );
  };

  const seriesField = data?.series?.length ? firstNumericField(data.series) : null;
  const failedFormat = exportReport.variables?.format;

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
        <HStack gap={6} wrap role="group" accessibilityLabel="Export this report">
          {EXPORT_BUTTONS.map(({ format, label, icon: Icon }) => (
            <Button
              key={format}
              label={label}
              size="sm"
              variant="secondary"
              fullWidth={false}
              icon={<Icon size={15} />}
              disabled={!active || !fromValid || !toValid || exportReport.isPending}
              loading={exportReport.isPending && exportReport.variables?.format === format}
              onPress={() => onExport(format)}
              testID={`report-export-${format}`}
            />
          ))}
        </HStack>
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

          <HStack gap={8} wrap role="tablist" accessibilityLabel="Report">
            {reports.map((r) => (
              <FilterChip
                key={r.key}
                label={r.title}
                active={r.key === active.key}
                onPress={() => choose(r.key)}
                testID={`report-chip-${r.key}`}
              />
            ))}
          </HStack>

          <Card>
            <VStack gap={12}>
              <HStack gap={8} wrap role="tablist" accessibilityLabel="Date range">
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
                { /* Select takes no testID, so the wrapper carries it. */ }
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
                    // "Department" means something different in each report, so always state it.
                    hint={`What the department filter counts: ${active.departmentBasis}`}
                  />
                </View>
              </HStack>
            </VStack>
          </Card>

          {report.isError || exportReport.isError ? (
            <VStack gap={8} testID="report-error">
              {report.isError ? (
                <Banner tone="danger" title="Couldn't run this report" message={apiErrorMessage(report.error)} />
              ) : null}
              {exportReport.isError ? (
                <Banner
                  tone="danger"
                  title={`Couldn't export the ${failedFormat ? EXPORT_TYPES[failedFormat].label : "report"}`}
                  message={apiErrorMessage(exportReport.error)}
                />
              ) : null}
            </VStack>
          ) : null}
          {notice ? (
            <View testID="report-export-notice">
              <Banner tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} />
            </View>
          ) : null}

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
