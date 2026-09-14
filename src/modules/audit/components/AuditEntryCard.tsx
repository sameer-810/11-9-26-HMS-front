import React from "react";
import { signal, fonts } from "@shared/designSystem";
import { Card, HStack, SignalBadge, Text, VStack } from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { ROLE_LABELS } from "@shared/permissions";
import type { AuditEntry } from "@modules/audit/types";

export const roleLabel = (role: string) => (ROLE_LABELS as Record<string, string>)[role] ?? role;

/**
 * One audit entry.
 *
 * Emergency access is drawn to be found while scrolling, not read in passing:
 * a critical rule, a tinted card, a solid badge and the stated reason in full.
 * A refusal is flagged too — an administrator or billing clerk being turned
 * away from a record is exactly the line a reviewer is looking for.
 */
export function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const accent = entry.breakGlass
    ? signal.critical.color
    : entry.outcome === "denied"
      ? signal.urgent.color
      : entry.outcome === "failure"
        ? signal.caution.color
        : undefined;

  const who = [entry.user.name, entry.user.role ? roleLabel(entry.user.role) : "", entry.user.employeeId]
    .filter(Boolean)
    .join(" · ");
  const trace = [entry.entityType, entry.ip ? `IP ${entry.ip}` : "", entry.requestId ? `Request ${entry.requestId}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      compact
      accentColor={accent}
      style={entry.breakGlass ? { backgroundColor: signal.critical.bg, borderColor: signal.critical.border } : undefined}
      testID={`audit-entry-${entry.id}`}
    >
      <VStack gap={6}>
        <HStack gap={8} align="center" wrap>
          {/* Capitals match the server's own "EMERGENCY ACCESS" wording in the
              description, so the badge and the text below read as one thing. */}
          {entry.breakGlass ? <SignalBadge level="critical" size="sm" solid label="EMERGENCY ACCESS" /> : null}
          {entry.outcome === "denied" ? (
            <SignalBadge level="urgent" size="sm" label="Denied" />
          ) : entry.outcome === "failure" ? (
            <SignalBadge level="caution" size="sm" label="Failed" />
          ) : null}
          <Text variant="label" style={{ fontFamily: fonts.mono }}>
            {entry.action}
          </Text>
          <Text variant="caption" tone="tertiary" style={{ marginLeft: "auto" }}>
            {formatDateTime(entry.createdAt)}
          </Text>
        </HStack>

        {entry.description ? <Text variant="body-sm">{entry.description}</Text> : null}

        {entry.reason ? (
          <Text
            variant="body-sm"
            weight={entry.breakGlass ? "600" : undefined}
            style={entry.breakGlass ? { color: signal.critical.text } : undefined}
            tone={entry.breakGlass ? undefined : "secondary"}
          >
            Reason: {entry.reason}
          </Text>
        ) : null}

        <Text variant="caption" tone="secondary">
          {who}
        </Text>
        {trace ? (
          <Text variant="caption" tone="tertiary">
            {trace}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
