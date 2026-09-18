import React from "react";
import { View, StyleSheet } from "react-native";
import { palette } from "@shared/designSystem";
import { Card, Text, VStack, HStack, Skeleton } from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { useAdmission } from "@modules/inpatient/hooks/useInpatient";

/** Every bed this admission has used, oldest first, with who moved the patient and why. */
export function BedHistoryCard({ admissionId }: { admissionId: string }) {
  const { data, isLoading, isError, fetchStatus } = useAdmission(admissionId);
  const movements = data?.bedMovements ?? [];

  return (
    <Card testID="bed-history">
      <VStack gap={10}>
        <Text variant="h4">Bed history</Text>
        {isLoading && fetchStatus !== "paused" ? (
          <Skeleton height={40} />
        ) : isError || (!data && fetchStatus === "paused") ? (
          <Text variant="caption" tone="secondary">
            The bed history could not be loaded just now.
          </Text>
        ) : movements.length === 0 ? (
          <Text variant="caption" tone="secondary">
            No bed movements recorded.
          </Text>
        ) : (
          movements.map((m, i) => (
            <View
              key={m.id}
              style={i > 0 ? styles.row : undefined}
              testID={`bed-movement-${i}`}
            >
              <VStack gap={2}>
                <HStack gap={8} align="center" wrap>
                  <Text variant="label">
                    {m.wardName || "Ward"} · bed {m.bedNumber}
                  </Text>
                  {m.roomNumber ? (
                    <Text variant="caption" tone="tertiary">
                      room {m.roomNumber}
                    </Text>
                  ) : null}
                  {!m.to ? (
                    <Text variant="caption" tone="secondary" weight="600">
                      current
                    </Text>
                  ) : null}
                </HStack>
                <Text variant="caption" tone="secondary" tabular>
                  {formatDateTime(m.from)} –{" "}
                  {m.to ? formatDateTime(m.to) : "now"}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {m.reason || "No reason recorded"}
                  {m.movedBy ? ` · ${m.movedBy}` : ""}
                </Text>
              </VStack>
            </View>
          ))
        )}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});
