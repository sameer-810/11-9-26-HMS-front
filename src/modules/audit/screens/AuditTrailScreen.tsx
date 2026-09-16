import React, { useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { ScrollText, ShieldAlert } from "lucide-react-native";

import { signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SearchInput,
  TextField,
  Skeleton,
  ErrorState,
  EmptyState,
  Pagination,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { FilterChip } from "@modules/reports/components/FilterChip";
import {
  AUDIT_PAGE_SIZE,
  GRANT_PAGE_SIZE,
  useAuditLog,
  useGrants,
  usePendingGrantCount,
} from "@modules/audit/hooks/useAudit";
import { AuditEntryCard } from "@modules/audit/components/AuditEntryCard";
import { GrantCard } from "@modules/audit/components/GrantCard";
import { OUTCOME_LABELS, type AuditOutcome, type GrantStatus } from "@modules/audit/types";

type Tab = "activity" | "grants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES: AuditOutcome[] = ["success", "failure", "denied"];
const GRANT_STATUSES: { key: GrantStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "appropriate", label: "Appropriate" },
  { key: "inappropriate", label: "Inappropriate" },
];

/**
 * Converts a YYYY-MM-DD to a local-day boundary instant. Built from parts because
 * `new Date("YYYY-MM-DD")` is UTC midnight and would drop the start of an IST day.
 */
function localDayBoundary(dateStr: string, end: boolean): string | undefined {
  if (!DATE_RE.test(dateStr)) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const at = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

function ActivityTab() {
  const [outcome, setOutcome] = useState<"all" | AuditOutcome>("all");
  const [breakGlassOnly, setBreakGlassOnly] = useState(false);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedAction = useDebouncedValue(action, 300);

  const fromError = from && !DATE_RE.test(from) ? "Use YYYY-MM-DD" : undefined;
  const toError =
    to && !DATE_RE.test(to)
      ? "Use YYYY-MM-DD"
      : from && to && !fromError && to < from
        ? "Ends before it starts"
        : undefined;

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAuditLog({
    page,
    outcome: outcome === "all" ? undefined : outcome,
    breakGlass: breakGlassOnly ? "true" : undefined,
    action: debouncedAction.trim() || undefined,
    from: fromError ? undefined : localDayBoundary(from, false),
    to: toError ? undefined : localDayBoundary(to, true),
  });
  const rows = data?.data ?? [];

  // Filter changes reset to page 1, since the current page may no longer exist.
  const refilter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <VStack gap={12}>
      <Card compact>
        <VStack gap={10}>
          <HStack gap={8} wrap>
            { /* Outcome tablist; the switch beside it must stay outside. */ }
            <HStack gap={8} wrap role="tablist" accessibilityLabel="Outcome">
              <FilterChip label="All outcomes" active={outcome === "all"} onPress={() => refilter(setOutcome)("all")} testID="audit-outcome-all" />
              {OUTCOMES.map((o) => (
                <FilterChip
                  key={o}
                  label={OUTCOME_LABELS[o]}
                  active={outcome === o}
                  onPress={() => refilter(setOutcome)(o)}
                  testID={`audit-outcome-${o}`}
                />
              ))}
            </HStack>
            <FilterChip
              label="Emergency access only"
              role="switch"
              active={breakGlassOnly}
              accentColor={breakGlassOnly ? undefined : signal.critical.border}
              onPress={() => refilter(setBreakGlassOnly)(!breakGlassOnly)}
              testID="audit-breakglass-only"
            />
          </HStack>
          <HStack gap={10} wrap align="flex-start">
            <SearchInput
              value={action}
              onChangeText={refilter(setAction)}
              placeholder="Action prefix — auth.login, record., user."
              style={{ flex: 2, minWidth: 220 }}
              testID="audit-action-search"
            />
            <TextField
              value={from}
              onChangeText={refilter(setFrom)}
              placeholder="From YYYY-MM-DD"
              accessibilityLabel="From date"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              error={fromError}
              containerStyle={{ flex: 1, minWidth: 150 }}
              testID="audit-from"
            />
            <TextField
              value={to}
              onChangeText={refilter(setTo)}
              placeholder="To YYYY-MM-DD"
              accessibilityLabel="To date"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              error={toError}
              containerStyle={{ flex: 1, minWidth: 150 }}
              testID="audit-to"
            />
          </HStack>
        </VStack>
      </Card>

      {isLoading ? (
        <VStack gap={8}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </VStack>
      ) : isError ? (
        <ErrorState error={error} title="Couldn't load the audit trail" onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No matching activity" message="Nothing in the audit trail matches these filters." />
      ) : (
        <VStack gap={8} testID="audit-entries" style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          {rows.map((e) => (
            <AuditEntryCard key={e.id} entry={e} />
          ))}
        </VStack>
      )}
      {data && data.meta.pages > 1 ? (
        <Pagination
          page={page}
          totalPages={data.meta.pages}
          total={data.meta.total}
          totalCapped={data.meta.totalCapped}
          limit={AUDIT_PAGE_SIZE}
          onPageChange={setPage}
          label="entries"
        />
      ) : null}
    </VStack>
  );
}

function GrantsTab() {
  const [status, setStatus] = useState<GrantStatus>("pending");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGrants({ status, page });
  const rows = data?.data ?? [];

  return (
    <VStack gap={12}>
      <Text variant="body-sm" tone="tertiary">
        Every emergency access to a restricted record waits here until someone other than the person who used it
        decides whether it was appropriate.
      </Text>
      <HStack gap={8} wrap role="tablist" accessibilityLabel="Review status">
        {GRANT_STATUSES.map((s) => (
          <FilterChip
            key={s.key}
            label={s.label}
            active={status === s.key}
            onPress={() => {
              setStatus(s.key);
              setPage(1);
            }}
            testID={`grant-status-${s.key}`}
          />
        ))}
      </HStack>

      {isLoading ? (
        <VStack gap={8}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </VStack>
      ) : isError ? (
        <ErrorState error={error} title="Couldn't load emergency access" onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={status === "pending" ? "Nothing awaiting review" : `No access reviewed as ${status}`}
          message={status === "pending" ? "Every emergency access has been reviewed." : undefined}
        />
      ) : (
        <VStack gap={10} testID="grant-rows">
          {rows.map((g) => (
            <GrantCard key={g.id} grant={g} />
          ))}
        </VStack>
      )}
      {data && data.meta.totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          total={data.meta.total}
          limit={GRANT_PAGE_SIZE}
          onPageChange={setPage}
          label="grants"
        />
      ) : null}
    </VStack>
  );
}

/** AD-04: audit trail plus the break-glass review queue, on one screen since reviewers use both. */
export default function AuditTrailScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("activity");
  const { data: pendingCount } = usePendingGrantCount();
  const queryKey = [tab === "activity" ? "audit" : "access-grants"];
  const fetching = useIsFetching({ queryKey }) > 0;

  return (
    <Screen
      overline="Oversight"
      title="Audit trail"
      subtitle="Who did and saw what. Read-only."
      refreshing={fetching}
      onRefresh={() => qc.invalidateQueries({ queryKey })}
      testID="audit-screen"
    >
      <VStack gap={14}>
        <HStack gap={8} wrap role="tablist" accessibilityLabel="Audit views">
          <FilterChip label="Activity" active={tab === "activity"} onPress={() => setTab("activity")} testID="audit-tab-activity" />
          <FilterChip
            label="Emergency access"
            count={pendingCount}
            accentColor={pendingCount ? signal.critical.color : undefined}
            active={tab === "grants"}
            onPress={() => setTab("grants")}
            testID="audit-tab-grants"
          />
        </HStack>
        {tab === "activity" ? <ActivityTab /> : <GrantsTab />}
      </VStack>
    </Screen>
  );
}
