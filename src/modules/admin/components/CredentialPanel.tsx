import React from "react";
import { View, StyleSheet } from "react-native";
import { KeyRound } from "lucide-react-native";

import { palette, radius, fonts } from "@shared/designSystem";
import { Text, VStack, HStack, Banner } from "@shared/ui";

interface Props {
  name: string;
  employeeId: string;
  email: string;
  password: string;
  /** "created" for a new account, "reset" for a replaced credential. */
  kind: "created" | "reset";
}

/**
 * the one moment a temporary password is visible; selectable text as there is no
 * clipboard dependency, set large and monospaced for reading aloud.
 */
export function CredentialPanel({ name, employeeId, email, password, kind }: Props) {
  return (
    <VStack gap={12} testID="user-credential">
      <Banner
        tone="warning"
        title="This password will not be shown again"
        message={`Give it to ${name} now. It is not stored anywhere it can be read back, so if it is lost, reset the credential again.`}
      />
      <View style={styles.box}>
        <HStack gap={8} align="center">
          <KeyRound size={16} color={palette.clinical[700]} strokeWidth={2.2} />
          <Text variant="label" tone="secondary">
            {kind === "created" ? "Temporary password" : "New temporary password"}
          </Text>
        </HStack>
        <Text
          selectable
          variant="display-sm"
          style={styles.password}
          testID="user-temp-password"
          accessibilityLabel={`Temporary password ${password.split("").join(" ")}`}
        >
          {password}
        </Text>
        <Text variant="caption" tone="tertiary">
          Select the text to copy it. {name} signs in with {email} (employee ID {employeeId}) and
          must choose their own password before anything else opens.
        </Text>
      </View>
    </VStack>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.clinical[200],
    backgroundColor: palette.clinical[50],
  },
  password: {
    fontFamily: fonts.mono,
    letterSpacing: 1.5,
    color: palette.text.primary,
  },
});
