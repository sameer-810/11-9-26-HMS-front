import React from "react";
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { TriangleAlert, Scale, ShieldAlert } from "lucide-react-native";
import { palette, layout, radius, signal, numeric } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";

/**
 * Patient identity band against wrong-patient errors: never scrolls or collapses.
 * Order: name, identifiers, allergies (tri-state), then location and status.
 */
export interface PatientBannerAllergy {
  substance: string;
  severity: "mild" | "moderate" | "severe" | "anaphylaxis";
  reaction?: string;
}

export interface PatientBannerData {
  id: string;
  patientId: string;
  fullName: string;
  age: string;
  gender: string;
  bloodGroup?: string;
  /** `undefined` means never asked. `[]` means asked and none. Not the same. */
  allergies?: PatientBannerAllergy[];
  allergiesRecorded: boolean;
  ward?: string;
  bed?: string;
  status?: string;
  /** Medico-legal case — carries reporting duties and restricts some actions. */
  isMlc?: boolean;
  photoUrl?: string;
}

interface Props {
  patient: PatientBannerData;
  onPress?: () => void;
  /** Extra content on the right — a "Break glass" notice, a discharge button. */
  right?: React.ReactNode;
}

export function PatientBanner({ patient, onPress, right }: Props) {
  const { width } = useWindowDimensions();
  const isPhone = width < layout.wideBreakpoint;

  const severe = (patient.allergies || []).filter(
    (a) => a.severity === "severe" || a.severity === "anaphylaxis",
  );
  const hasAllergies = (patient.allergies || []).length > 0;

  const body = (
    <View
      style={[
        styles.wrap,
        {
          minHeight: isPhone
            ? layout.patientBannerHeightPhone
            : layout.patientBannerHeight,
          paddingHorizontal: isPhone
            ? layout.screenPaddingPhone
            : layout.screenPadding,
        },
        // A severe allergy is the only condition allowed to restyle the band.
        severe.length > 0 && styles.wrapSevere,
      ]}
      accessibilityRole="header"
      accessibilityLabel={buildA11yLabel(patient)}
    >
      <HStack gap={isPhone ? 10 : 16} align="center" wrap={isPhone}>
        {/* 1. Identity */}
        <VStack
          gap={2}
          style={{ minWidth: isPhone ? "100%" : 200, flexShrink: 0 }}
        >
          <Text
            variant={isPhone ? "h3" : "h2"}
            tone="primary"
            numberOfLines={1}
          >
            {patient.fullName}
          </Text>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-sm" tone="secondary" style={numeric}>
              {patient.patientId}
            </Text>
            <Dot />
            <Text variant="label-sm" tone="secondary">
              {patient.age}
            </Text>
            <Dot />
            <Text variant="label-sm" tone="secondary">
              {patient.gender}
            </Text>
            {patient.bloodGroup && patient.bloodGroup !== "unknown" ? (
              <>
                <Dot />
                <Text variant="label-sm" tone="secondary" weight="600">
                  {patient.bloodGroup}
                </Text>
              </>
            ) : null}
          </HStack>
        </VStack>

        {/* 2. Allergies */}
        <View
          style={{
            flexShrink: 1,
            flexGrow: 1,
            minWidth: isPhone ? "100%" : 180,
          }}
        >
          <AllergyStrip
            allergies={patient.allergies || []}
            recorded={patient.allergiesRecorded}
            hasAny={hasAllergies}
          />
        </View>

        {/* 3. Location, status, flags */}
        <HStack gap={8} align="center" style={{ flexShrink: 0 }} wrap>
          {patient.isMlc ? (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: palette.warning.bg,
                  borderColor: palette.warning.border,
                },
              ]}
            >
              <Scale size={12} color={palette.warning.text} strokeWidth={2.2} />
              <Text
                variant="label-sm"
                weight="600"
                style={{ color: palette.warning.text }}
              >
                MLC
              </Text>
            </View>
          ) : null}
          {patient.ward ? (
            <View style={styles.flag}>
              <Text variant="label-sm" tone="secondary">
                {patient.ward}
                {patient.bed ? ` · Bed ${patient.bed}` : ""}
              </Text>
            </View>
          ) : null}
          {patient.status ? (
            <View style={styles.flag}>
              <Text variant="label-sm" tone="secondary">
                {patient.status}
              </Text>
            </View>
          ) : null}
          {right}
        </HStack>
      </HStack>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}

function AllergyStrip({
  allergies,
  recorded,
  hasAny,
}: {
  allergies: PatientBannerAllergy[];
  recorded: boolean;
  hasAny: boolean;
}) {
  // Never asked: say so explicitly, as silence would read as "no allergies".
  if (!recorded) {
    return (
      <HStack gap={6} align="center">
        <ShieldAlert size={14} color={palette.warning.text} strokeWidth={2.2} />
        <Text
          variant="label"
          weight="600"
          style={{ color: palette.warning.text }}
        >
          Allergies not recorded
        </Text>
      </HStack>
    );
  }

  // Asked, and the answer was none.
  if (!hasAny) {
    return (
      <HStack gap={6} align="center">
        <Text
          variant="label"
          weight="600"
          style={{ color: signal.normal.text }}
        >
          No known allergies
        </Text>
      </HStack>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <HStack gap={6} align="center">
        <TriangleAlert
          size={14}
          color={signal.critical.color}
          strokeWidth={2.4}
        />
        <Text
          variant="label"
          weight="600"
          style={{ color: signal.critical.text }}
        >
          Allergies
        </Text>
        {allergies.map((a) => {
          const severe =
            a.severity === "severe" || a.severity === "anaphylaxis";
          return (
            <View
              key={a.substance}
              style={[
                styles.allergyChip,
                severe
                  ? {
                      backgroundColor: signal.critical.bg,
                      borderColor: signal.critical.border,
                    }
                  : {
                      backgroundColor: signal.urgent.bg,
                      borderColor: signal.urgent.border,
                    },
              ]}
            >
              <Text
                variant="label-sm"
                weight="600"
                style={{
                  color: severe ? signal.critical.text : signal.urgent.text,
                }}
              >
                {a.substance}
                {a.severity === "anaphylaxis" ? " · anaphylaxis" : ""}
              </Text>
            </View>
          );
        })}
      </HStack>
    </ScrollView>
  );
}

function Dot() {
  return <View style={styles.dot} />;
}

/** Screen-reader label with the band's safety information in the same order. */
function buildA11yLabel(p: PatientBannerData) {
  const parts = [p.fullName, `patient ${p.patientId}`, p.age, p.gender];
  if (p.bloodGroup && p.bloodGroup !== "unknown")
    parts.push(`blood group ${p.bloodGroup}`);
  if (!p.allergiesRecorded) parts.push("Allergies not recorded");
  else if (!p.allergies?.length) parts.push("No known allergies");
  else
    parts.push(
      `Allergic to ${p.allergies.map((a) => `${a.substance}, ${a.severity}`).join("; ")}`,
    );
  if (p.isMlc) parts.push("Medico-legal case");
  if (p.ward) parts.push(`${p.ward}${p.bed ? ` bed ${p.bed}` : ""}`);
  if (p.status) parts.push(p.status);
  return parts.join(". ");
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.surface.primary,
    borderBottomWidth: 1,
    borderBottomColor: palette.border.default,
    justifyContent: "center",
    paddingVertical: 10,
  },
  wrapSevere: {
    borderLeftWidth: 4,
    borderLeftColor: signal.critical.color,
    backgroundColor: signal.critical.bg,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.text.tertiary,
  },
  flag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
  allergyChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
