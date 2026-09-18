import React from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius } from "@shared/designSystem";
import { Card, HStack, Text, VStack } from "@shared/ui";
import type { FluidBalance } from "@modules/inpatient/types";

/**
 * Intake and output over the last 24 hours, from the server. A part with nothing recorded
 * says so; it is never shown as 0 mL.
 */
export function FluidBalanceCard({
  balance,
  pendingWithFluids = 0,
}: {
  balance: FluidBalance | null | undefined;
  /** Sets on this device, not yet sent, that carry fluid amounts. */
  pendingWithFluids?: number;
}) {
  const empty =
    !balance || (balance.intakeMl === null && balance.outputMl === null);

  return (
    <Card testID="fluid-balance">
      <VStack gap={10}>
        <Text variant="h4">Fluid balance — last 24 hours</Text>
        {empty ? (
          <Text
            variant="body-sm"
            tone="secondary"
            testID="fluid-balance-empty"
          >
            Nothing recorded in the last 24 hours.
          </Text>
        ) : (
          <HStack gap={10} wrap>
            <Part
              label="Intake"
              value={balance.intakeMl}
              detail={`Oral ${ml(balance.oralIntakeMl)} · IV ${ml(balance.ivIntakeMl)}`}
              testID="fluid-intake"
            />
            <Part
              label="Output"
              value={balance.outputMl}
              detail="Urine"
              testID="fluid-output"
            />
            <View style={styles.part} testID="fluid-balance-total">
              <Text variant="caption" tone="tertiary">
                Balance
              </Text>
              {balance.balanceMl === null ? (
                <Text variant="body-sm" tone="secondary">
                  Not worked out — needs both intake and output
                </Text>
              ) : (
                <Text
                  variant="h3"
                  tabular
                  accessibilityLabel={`Balance ${balance.balanceMl < 0 ? "minus" : balance.balanceMl > 0 ? "plus" : ""} ${Math.abs(balance.balanceMl)} millilitres`}
                >
                  {signed(balance.balanceMl)} mL
                </Text>
              )}
            </View>
          </HStack>
        )}
        {pendingWithFluids > 0 ? (
          <Text variant="caption" tone="tertiary">
            {pendingWithFluids === 1
              ? "One set on this device is not counted until it is sent."
              : `${pendingWithFluids} sets on this device are not counted until they are sent.`}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

function Part({
  label,
  value,
  detail,
  testID,
}: {
  label: string;
  value: number | null;
  detail: string;
  testID: string;
}) {
  return (
    <View style={styles.part} testID={testID}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      {value === null ? (
        <Text variant="body-sm" tone="secondary">
          Nothing recorded
        </Text>
      ) : (
        <Text variant="h3" tabular>
          {value} mL
        </Text>
      )}
      <Text variant="caption" tone="tertiary">
        {detail}
      </Text>
    </View>
  );
}

const ml = (v: number | null) => (v === null ? "not recorded" : `${v} mL`);

function signed(v: number): string {
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

const styles = StyleSheet.create({
  part: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 150,
    gap: 2,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface.sunken,
  },
});
