import React from "react";
import { View } from "react-native";
import {
  Users,
  BedDouble,
  Building2,
  Activity,
  ShieldCheck,
} from "lucide-react-native";

import { palette } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { ROLE_LABELS } from "@shared/permissions";
import {
  Screen,
  StatTile,
  HStack,
  VStack,
  SectionHeader,
  Card,
  Text,
  Skeleton,
  ErrorState,
  Banner,
} from "@shared/ui";
import { useDashboardSummary } from "@modules/dashboard/hooks/useDashboard";

/**
 * AC-02: the dashboard is built from the role.
 *
 * The tiles rendered here are exactly the tiles the server chose to compute for
 * this user — nothing is fetched and then hidden, so a figure a receptionist
 * must not see never reaches their device at all.
 */
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const hospital = useAuthStore((s) => s.hospital);
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboardSummary();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tiles = data?.tiles;

  return (
    <Screen
      overline={hospital?.name}
      title={`${greeting}${user ? `, ${user.firstName}` : ""}`}
      subtitle={user ? user.designation || ROLE_LABELS[user.role] : undefined}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="dashboard"
    >
      <VStack gap={24}>
        {isError ? (
          <ErrorState error={error} title="Couldn't load your dashboard" onRetry={refetch} />
        ) : (
          <View>
            <SectionHeader title="Today" subtitle="What you can see is decided by your role" />
            {isLoading ? (
              <HStack gap={12} wrap>
                {[0, 1, 2].map((i) => (
                  <Card key={i} compact style={{ flex: 1, minWidth: 150 }}>
                    <VStack gap={10}>
                      <Skeleton width="60%" height={11} />
                      <Skeleton width="40%" height={24} />
                    </VStack>
                  </Card>
                ))}
              </HStack>
            ) : (
              <HStack gap={12} wrap>
                {tiles?.beds ? (
                  <>
                    <StatTile
                      label="Beds available"
                      value={tiles.beds.available}
                      sublabel={`of ${tiles.beds.total}`}
                      icon={BedDouble}
                      accent="green"
                      // Nearly full is an operational problem the ward needs to
                      // see before the next admission arrives, not after.
                      attention={tiles.beds.occupancyPercent >= 90}
                    />
                    <StatTile
                      label="Occupancy"
                      value={`${tiles.beds.occupancyPercent}%`}
                      sublabel={`${tiles.beds.occupied} occupied`}
                      icon={Activity}
                      accent="clinical"
                    />
                  </>
                ) : null}

                {tiles?.staff ? (
                  <StatTile
                    label="Active staff"
                    value={tiles.staff.active}
                    sublabel={
                      tiles.staff.inactive ? `${tiles.staff.inactive} deactivated` : undefined
                    }
                    icon={Users}
                    accent="violet"
                  />
                ) : null}

                {tiles?.departments !== undefined ? (
                  <StatTile
                    label="Departments"
                    value={tiles.departments}
                    icon={Building2}
                    accent="teal"
                  />
                ) : null}

                {!tiles || Object.keys(tiles).length === 0 ? (
                  <Card style={{ flex: 1 }}>
                    <Text variant="body-sm" tone="tertiary">
                      Your role does not have any dashboard figures yet. The modules you work in
                      arrive in later phases.
                    </Text>
                  </Card>
                ) : null}
              </HStack>
            )}
          </View>
        )}

        {data?.pending?.length ? (
          <Banner
            tone="info"
            title="Modules still to come"
            message={`${data.pending.join(", ")} land in later phases. The routes are already registered and permission-guarded.`}
          />
        ) : null}

        <Card>
          <HStack gap={12} align="flex-start">
            <ShieldCheck size={18} color={palette.clinical[600]} strokeWidth={2} />
            <VStack gap={4} flex={1}>
              <Text variant="h3" tone="primary">
                Everything here is recorded
              </Text>
              <Text variant="body-sm" tone="secondary">
                Every record you open, and every change you make, is written to an audit trail with
                your name and the time. That trail cannot be edited by anyone, including
                administrators.
              </Text>
            </VStack>
          </HStack>
        </Card>
      </VStack>
    </Screen>
  );
}
