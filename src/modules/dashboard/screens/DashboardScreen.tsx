import React from "react";
import { View } from "react-native";
import {
  Users,
  CalendarDays,
  BedDouble,
  FlaskConical,
  Pill,
  Receipt,
} from "lucide-react-native";
import { useAuthStore } from "@shared/store/useAuthStore";
import { ROLE_LABELS } from "@shared/permissions";
import { Screen, StatTile, HStack, VStack, SectionHeader, Card, Text } from "@shared/ui";

/**
 * Placeholder dashboard for the foundation phase.
 *
 * Real role-specific dashboards arrive with their modules. What this proves now
 * is that the shell, the design tokens and the permission-driven navigation
 * hold together end to end.
 */
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const hospital = useAuthStore((s) => s.hospital);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <Screen
      overline={hospital?.name}
      title={`${greeting}${user ? `, ${user.firstName}` : ""}`}
      subtitle={user ? ROLE_LABELS[user.role] : undefined}
    >
      <VStack gap={24}>
        <View>
          <SectionHeader title="Today" subtitle="Hospital activity at a glance" />
          <HStack gap={12} wrap>
            <StatTile label="Registered patients" value="—" icon={Users} accent="clinical" />
            <StatTile label="Appointments today" value="—" icon={CalendarDays} accent="teal" />
            <StatTile label="Beds available" value="—" icon={BedDouble} accent="green" />
            <StatTile label="Tests pending" value="—" icon={FlaskConical} accent="amber" />
            <StatTile label="Prescriptions waiting" value="—" icon={Pill} accent="violet" />
            <StatTile label="Outstanding bills" value="—" icon={Receipt} accent="neutral" />
          </HStack>
        </View>

        <Card>
          <VStack gap={6}>
            <Text variant="h3" tone="primary">
              Foundation ready
            </Text>
            <Text variant="body-sm" tone="secondary">
              Design system, permission-driven navigation and the API shell are in place. Modules
              are added phase by phase — each one wires its own tiles into this dashboard.
            </Text>
          </VStack>
        </Card>
      </VStack>
    </Screen>
  );
}
