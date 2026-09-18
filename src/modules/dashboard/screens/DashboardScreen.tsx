import React from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Users,
  BedDouble,
  Building2,
  Activity,
  ShieldCheck,
  FlaskConical,
  OctagonAlert,
  Pill,
  Boxes,
  Receipt,
  Ambulance,
  CalendarDays,
  ListOrdered,
  HeartPulse,
  ClipboardList,
  ClipboardCheck,
} from "lucide-react-native";
import { formatRupees } from "@shared/format";

import { palette } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS, ROLE_LABELS } from "@shared/permissions";
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
} from "@shared/ui";
import { useDashboardSummary } from "@modules/dashboard/hooks/useDashboard";
import { useVisibleNavItems } from "@navigation/navItems";

/** Where a tile leads: a drawer route, optionally a screen inside it. */
interface Target {
  route: string;
  params?: Record<string, unknown>;
  /** Read out by a screen reader before the tile is pressed. */
  hint: string;
}

/**
 * Role-based dashboard (AC-02): renders only the tiles the server computed for this user.
 * Tiles open their list when reachable (US-05), else a report, else stay plain numbers.
 */
export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const hospital = useAuthStore((s) => s.hospital);
  const canApprove = useAuthStore((s) => s.hasPermission)(
    PERMISSIONS.HOSPITAL_CONFIG,
  );
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useDashboardSummary();
  const reachable = new Set(useVisibleNavItems().map((i) => i.name));

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tiles = data?.tiles;

  /** The first target this user can reach, as tile props. */
  const open = (...targets: (Target | false | null | undefined)[]) => {
    const target = targets.find(
      (t): t is Target => Boolean(t) && reachable.has((t as Target).route),
    );
    if (!target) return {};
    return {
      onPress: () => navigation.navigate(target.route, target.params),
      hint: target.hint,
    };
  };
  const report = (key: string, title: string): Target => ({
    route: "Reports",
    params: { report: key },
    hint: `Opens the ${title} report`,
  });

  const appts = tiles?.appointments;

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
          <ErrorState
            error={error}
            title="Couldn't load your dashboard"
            onRetry={refetch}
          />
        ) : (
          <View>
            <SectionHeader
              title="Today"
              subtitle="Decided by your role. Tap a card to open the list behind it."
            />
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
                {tiles?.patients ? (
                  <StatTile
                    label="Total patients"
                    value={tiles.patients.total}
                    sublabel={`${tiles.patients.registeredToday} registered today`}
                    icon={Users}
                    accent="clinical"
                    testID="tile-patients"
                    {...open(
                      { route: "Patients", hint: "Opens patient search" },
                      report("registrations", "patient registrations"),
                    )}
                  />
                ) : null}

                {appts ? (
                  <>
                    <StatTile
                      label={
                        appts.mine
                          ? "My appointments today"
                          : "Today's appointments"
                      }
                      value={appts.total}
                      sublabel={`${appts.scheduled} still to come · ${appts.cancelled + appts.noShow} cancelled or missed`}
                      icon={CalendarDays}
                      accent="violet"
                      testID="tile-appointments"
                      {...open(
                        appts.mine && {
                          route: "MyAppointments",
                          hint: "Opens your schedule",
                        },
                        {
                          route: "Appointments",
                          hint: "Opens the appointment list",
                        },
                        { route: "OpdQueue", hint: "Opens the OPD queue" },
                        report("opd", "OPD activity"),
                      )}
                    />
                    <StatTile
                      label="OPD patients now"
                      value={appts.waiting + appts.inConsultation}
                      sublabel={`${appts.waiting} waiting · ${appts.inConsultation} with a doctor · ${appts.completed} seen`}
                      icon={ListOrdered}
                      accent="teal"
                      testID="tile-opd"
                      {...open(
                        { route: "OpdQueue", hint: "Opens the OPD queue" },
                        appts.mine && {
                          route: "MyAppointments",
                          hint: "Opens your schedule",
                        },
                        report("opd", "OPD activity"),
                      )}
                    />
                  </>
                ) : null}

                {tiles?.inpatients ? (
                  <StatTile
                    label="Admitted patients"
                    value={tiles.inpatients.admitted}
                    sublabel={`${tiles.inpatients.admittedToday} admitted · ${tiles.inpatients.dischargedToday} discharged today`}
                    icon={BedDouble}
                    accent="clinical"
                    testID="tile-inpatients"
                    {...open(
                      {
                        route: "AdmittedPatients",
                        hint: "Opens the admitted patients list",
                      },
                      { route: "Beds", hint: "Opens bed management" },
                    )}
                  />
                ) : null}

                {tiles?.myPatients ? (
                  <StatTile
                    label="My patients"
                    value={tiles.myPatients.count}
                    sublabel="allocated to you or on your wards"
                    icon={HeartPulse}
                    accent="teal"
                    testID="tile-my-patients"
                    {...open({
                      route: "NursingPatients",
                      hint: "Opens your ward list",
                    })}
                  />
                ) : null}

                {tiles?.admissionRequests ? (
                  <StatTile
                    label="Waiting for a bed"
                    value={tiles.admissionRequests.pending}
                    sublabel="recommended for admission"
                    icon={ClipboardList}
                    accent="violet"
                    attention={tiles.admissionRequests.pending > 0}
                    testID="tile-admission-requests"
                    {...open({
                      route: "AdmittedPatients",
                      hint: "Opens the admission requests",
                    })}
                  />
                ) : null}

                {tiles?.beds ? (
                  <>
                    <StatTile
                      label="Beds available"
                      value={tiles.beds.available}
                      sublabel={`of ${tiles.beds.total}`}
                      icon={BedDouble}
                      accent="green"
                      attention={tiles.beds.occupancyPercent >= 90}
                      testID="tile-beds"
                      {...open({ route: "Beds", hint: "Opens bed management" })}
                    />
                    <StatTile
                      label="Occupancy"
                      value={`${tiles.beds.occupancyPercent}%`}
                      sublabel={`${tiles.beds.occupied} occupied`}
                      icon={Activity}
                      accent="clinical"
                      testID="tile-occupancy"
                      {...open(
                        { route: "Beds", hint: "Opens bed management" },
                        report("bed_occupancy", "bed occupancy"),
                      )}
                    />
                  </>
                ) : null}

                {tiles?.staff ? (
                  <StatTile
                    label="Active staff"
                    value={tiles.staff.active}
                    sublabel={
                      tiles.staff.inactive
                        ? `${tiles.staff.inactive} deactivated`
                        : undefined
                    }
                    icon={Users}
                    accent="violet"
                    testID="tile-staff"
                    {...open({
                      route: "UserManagement",
                      hint: "Opens users and access",
                    })}
                  />
                ) : null}

                {tiles?.lab ? (
                  <>
                    <StatTile
                      label="Tests pending"
                      value={tiles.lab.pending}
                      sublabel="in the laboratory"
                      icon={FlaskConical}
                      accent="teal"
                      testID="tile-lab"
                      {...open(
                        { route: "LabQueue", hint: "Opens the test queue" },
                        { route: "LabReports", hint: "Opens lab reports" },
                      )}
                    />
                    {/* Shown beside the pending count, never instead of it. */}
                    <StatTile
                      label="Critical, unacknowledged"
                      value={tiles.lab.criticalOpen}
                      icon={OctagonAlert}
                      accent="clinical"
                      attention={tiles.lab.criticalOpen > 0}
                      testID="tile-lab-critical"
                      {...open(
                        { route: "LabReports", hint: "Opens lab reports" },
                        { route: "LabQueue", hint: "Opens the test queue" },
                      )}
                    />
                  </>
                ) : null}

                {tiles?.pharmacy ? (
                  <StatTile
                    label="Prescriptions waiting"
                    value={tiles.pharmacy.pendingPrescriptions}
                    sublabel="to dispense"
                    icon={Pill}
                    accent="violet"
                    testID="tile-pharmacy"
                    {...open({
                      route: "PharmacyQueue",
                      hint: "Opens the prescription queue",
                    })}
                  />
                ) : null}

                {tiles?.inventory ? (
                  <>
                    <StatTile
                      label="Low stock"
                      value={tiles.inventory.lowStock}
                      sublabel="at or below reorder level"
                      icon={Boxes}
                      accent="teal"
                      attention={tiles.inventory.lowStock > 0}
                      testID="tile-low-stock"
                      {...open(
                        {
                          route: "Inventory",
                          params: { screen: "LowStock" },
                          hint: "Opens low stock",
                        },
                        {
                          route: "MedicineStock",
                          params: { screen: "LowStock" },
                          hint: "Opens low stock",
                        },
                      )}
                    />
                    {/* Separate tile: expired stock is a different problem from low stock. */}
                    <StatTile
                      label="Expired on the shelf"
                      value={tiles.inventory.expiredOnShelf}
                      sublabel={`${tiles.inventory.expiringSoon} batches expire within 90 days`}
                      icon={OctagonAlert}
                      accent="clinical"
                      attention={tiles.inventory.expiredOnShelf > 0}
                      testID="tile-expired"
                      {...open(
                        { route: "Inventory", hint: "Opens inventory" },
                        {
                          route: "MedicineStock",
                          hint: "Opens medicine stock",
                        },
                      )}
                    />
                  </>
                ) : null}

                {tiles?.emergency ? (
                  <>
                    <StatTile
                      label="In emergency"
                      value={tiles.emergency.inDepartment}
                      sublabel={`${tiles.emergency.waitingTriage} waiting triage${tiles.emergency.expected ? ` · ${tiles.emergency.expected} ambulance expected` : ""}`}
                      icon={Ambulance}
                      accent="clinical"
                      attention={tiles.emergency.waitingTriage > 0}
                      testID="tile-emergency"
                      {...open({
                        route: "Emergency",
                        hint: "Opens the emergency board",
                      })}
                    />
                    <StatTile
                      label="Past triage target"
                      value={tiles.emergency.overTarget}
                      sublabel="not yet seen by a doctor"
                      icon={OctagonAlert}
                      accent="clinical"
                      attention={tiles.emergency.overTarget > 0}
                      testID="tile-emergency-target"
                      {...open({
                        route: "Emergency",
                        hint: "Opens the emergency board",
                      })}
                    />
                  </>
                ) : null}

                {tiles?.billing ? (
                  <>
                    <StatTile
                      label="Collected today"
                      value={formatRupees(
                        tiles.billing.collectedTodayPaise / 100,
                      )}
                      icon={Receipt}
                      accent="green"
                      testID="tile-collected"
                      {...open({ route: "Bills", hint: "Opens bills" })}
                    />
                    <StatTile
                      label="Outstanding"
                      value={formatRupees(tiles.billing.outstandingPaise / 100)}
                      sublabel={`${tiles.billing.outstandingBills} unpaid · ${tiles.billing.draftBills} drafts`}
                      icon={Receipt}
                      accent="violet"
                      attention={tiles.billing.outstandingBills > 0}
                      testID="tile-outstanding"
                      {...open({
                        route: "Bills",
                        params: { screen: "Outstanding" },
                        hint: "Opens outstanding bills",
                      })}
                    />
                    {/* For whoever decides: approval is administration's (section 6.6). */}
                    {canApprove ? (
                      <StatTile
                        label="Waiting for approval"
                        value={tiles.billing.approvalsWaiting ?? 0}
                        sublabel="discounts and credit notes"
                        icon={ClipboardCheck}
                        accent="violet"
                        attention={(tiles.billing.approvalsWaiting ?? 0) > 0}
                        testID="tile-billing-approvals"
                        {...open({
                          route: "Bills",
                          params: {
                            screen: "BillsList",
                            params: { show: "approvals" },
                          },
                          hint: "Opens bills, where the ones waiting are marked",
                        })}
                      />
                    ) : null}
                  </>
                ) : null}

                {tiles?.departments !== undefined ? (
                  <StatTile
                    label="Departments"
                    value={tiles.departments}
                    icon={Building2}
                    accent="teal"
                    testID="tile-departments"
                    {...open({
                      route: "HospitalConfig",
                      hint: "Opens hospital setup",
                    })}
                  />
                ) : null}

                {!tiles || Object.keys(tiles).length === 0 ? (
                  <Card style={{ flex: 1 }}>
                    <Text variant="body-sm" tone="tertiary">
                      Your role has no figures on the dashboard. Your work is in
                      the menu.
                    </Text>
                  </Card>
                ) : null}
              </HStack>
            )}
          </View>
        )}

        <Card>
          <HStack gap={12} align="flex-start">
            <ShieldCheck
              size={18}
              color={palette.clinical[600]}
              strokeWidth={2}
            />
            <VStack gap={4} flex={1}>
              <Text variant="h3" tone="primary">
                Everything here is recorded
              </Text>
              <Text variant="body-sm" tone="secondary">
                Every record you open, and every change you make, is written to
                an audit trail with your name and the time. That trail cannot be
                edited by anyone, including administrators.
              </Text>
            </VStack>
          </HStack>
        </Card>
      </VStack>
    </Screen>
  );
}
