import React, { useState } from "react";
import { View, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { Hospital, Mail, Lock } from "lucide-react-native";
import { palette, radius, layout, gradients } from "@shared/designSystem";
import { LinearGradient } from "expo-linear-gradient";
import { Text, VStack, HStack, Button, TextField, Banner, Card } from "@shared/ui";

/**
 * Sign-in.
 *
 * Wired to the real auth endpoint in the next phase; the form, validation and
 * error surface are built now so the shell is exercised end to end.
 */
export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      {isWide ? (
        <LinearGradient colors={[...gradients.hero]} style={styles.hero}>
          <VStack gap={14} style={{ maxWidth: 400 }}>
            <View style={styles.heroMark}>
              <Hospital size={26} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <Text variant="display" style={{ color: "#FFFFFF" }}>
              One patient, one record
            </Text>
            <Text variant="body-lg" style={{ color: "rgba(255,255,255,0.85)" }}>
              Reception, consultation, wards, laboratory, pharmacy and billing on one connected
              platform.
            </Text>
          </VStack>
        </LinearGradient>
      ) : null}

      <ScrollView
        style={styles.pane}
        contentContainerStyle={styles.paneContent}
        keyboardShouldPersistTaps="handled"
      >
        <VStack gap={20} style={{ width: "100%", maxWidth: 380 }}>
          {!isWide ? (
            <HStack gap={10} align="center">
              <View style={styles.mark}>
                <Hospital size={20} color={palette.clinical[700]} strokeWidth={2.2} />
              </View>
              <Text variant="h1" tone="primary">
                HMS
              </Text>
            </HStack>
          ) : null}

          <VStack gap={4}>
            <Text variant="display-sm" tone="primary">
              Sign in
            </Text>
            <Text variant="body-sm" tone="tertiary">
              Use the credentials issued by your hospital administrator.
            </Text>
          </VStack>

          {error ? <Banner tone="danger" message={error} /> : null}

          <VStack gap={14}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@hospital.in"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              leading={<Mail size={16} color={palette.text.tertiary} strokeWidth={1.9} />}
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoComplete="current-password"
              leading={<Lock size={16} color={palette.text.tertiary} strokeWidth={1.9} />}
            />
            <Button label="Sign in" onPress={() => {}} />
          </VStack>

          <Card compact>
            <Text variant="caption" tone="tertiary">
              Every action you take is recorded against your account. Do not sign in on behalf of a
              colleague.
            </Text>
          </Card>
        </VStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: palette.surface.secondary },
  hero: { flex: 1, padding: 48, justifyContent: "center" },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  pane: { flex: 1, backgroundColor: palette.surface.primary },
  paneContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: palette.clinical[50],
    alignItems: "center",
    justifyContent: "center",
  },
});
