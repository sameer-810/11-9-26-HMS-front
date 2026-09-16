import React from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, layout } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { useBreakpoint } from "./useBreakpoint";
import { PatientBanner, type PatientBannerData } from "./PatientBanner";

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  overline?: string;
  right?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Identity band, pinned outside the scroll view so it cannot scroll away. */
  patient?: PatientBannerData;
  patientRight?: React.ReactNode;
  onPatientPress?: () => void;
  /** Rendered above the content, inside the scroll — offline strips, alerts. */
  banner?: React.ReactNode;
  /** Pinned to the bottom — a totals bar, a save footer. */
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Screen container: patient band outside the scroll, content capped at `contentMaxWidth`. */
export function Screen({
  children,
  title,
  subtitle,
  overline,
  right,
  scroll = true,
  refreshing,
  onRefresh,
  patient,
  patientRight,
  onPatientPress,
  banner,
  footer,
  contentStyle,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isWide, screenPadding } = useBreakpoint();

  const header =
    title || overline || right ? (
      <HStack
        gap={12}
        align="flex-start"
        justify="space-between"
        wrap={!isWide}
        style={{ marginBottom: title || subtitle ? 16 : 0 }}
      >
        { /* Shrinks on narrow screens so long subtitles wrap (WCAG 1.4.10). */ }
        <VStack gap={2} flex={isWide ? 1 : undefined} style={isWide ? undefined : { flexShrink: 1, minWidth: 0 }}>
          {overline ? (
            <Text variant="overline" tone="tertiary">
              {overline}
            </Text>
          ) : null}
          {title ? (
            <Text variant={isWide ? "display-sm" : "h1"} tone="primary" heading={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body-sm" tone="tertiary">
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      </HStack>
    ) : null;

  const inner = (
    <View
      style={[
        {
          width: "100%",
          maxWidth: layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: screenPadding,
          paddingTop: 20,
        },
        contentStyle,
      ]}
    >
      {header}
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingBottom: (footer ? 0 : layout.tabBarClearance) + insets.bottom,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={palette.clinical[600]}
            colors={[palette.clinical[600]]}
          />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{inner}</View>
  );

  return (
    // The main landmark wraps the band, banners and footer too.
    <View style={styles.root} testID={testID} role="main">
      {patient ? (
        <PatientBanner patient={patient} right={patientRight} onPress={onPatientPress} />
      ) : null}
      {banner}
      { /* No KeyboardAvoidingView on web: the browser adjusts itself (avoids a double jump). */ }
      {Platform.OS === "web" ? (
        body
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surface.secondary },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: palette.surface.primary,
    borderTopWidth: 1,
    borderTopColor: palette.border.default,
  },
});
