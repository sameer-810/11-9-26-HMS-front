import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { UserPlus, Users, TriangleAlert, ShieldAlert } from "lucide-react-native";

import { palette, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  SearchInput,
  ChipsRow,
  DataTable,
  type Column,
  ListRow,
  Pagination,
  Skeleton,
  Card,
  ErrorState,
  StatusChip,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { usePatients } from "@modules/patient/hooks/usePatients";
import type { Patient } from "@modules/patient/types";

const STATUS_CHIPS = [
  { key: "", label: "All" },
  { key: "registered", label: "Registered" },
  { key: "scheduled", label: "Scheduled" },
  { key: "arrived", label: "Waiting" },
  { key: "admitted", label: "Admitted" },
];

/**
 * RG-04: one search box, because reception has a queue in front of them and
 * does not want to choose a field first. Name, phone and patient ID all work.
 */
export default function PatientsScreen() {
  const navigation = useNavigation<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRegister = hasPermission(PERMISSIONS.PATIENTS_MANAGE);
  const seesClinical = hasPermission(PERMISSIONS.RECORD_VIEW);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const debouncedSearch = useDebouncedValue(search, 300);

  // Reset to page 1 when the filters change, adjusted during render rather
  // than in an effect so there is no frame showing page 7 of 2 results.
  const filterKey = `${debouncedSearch}|${status}|${limit}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, isLoading, isError, error, refetch, isRefetching } = usePatients({
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(status ? { status } : {}),
    page,
    limit,
  });

  const patients = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.pages ?? 1;

  const open = (p: Patient) => navigation.navigate("PatientDetail", { id: p.id });

  const columns: Column<Patient>[] = [
    {
      key: "patientId",
      header: "Patient ID",
      width: 130,
      sortable: true,
      sortValue: (p) => p.patientId,
      render: (p) => (
        <Text variant="label" tone="secondary" tabular numberOfLines={1}>
          {p.patientId}
        </Text>
      ),
    },
    {
      key: "name",
      header: "Name",
      flex: 2,
      sortable: true,
      sortValue: (p) => p.fullName.toLowerCase(),
      render: (p) => (
        <HStack gap={6} align="center">
          <Text variant="label" tone="primary" numberOfLines={1}>
            {p.fullName}
          </Text>
          {/* The allergy marker rides with the name everywhere it appears. */}
          <AllergyMark patient={p} seesClinical={seesClinical} />
        </HStack>
      ),
    },
    {
      key: "age",
      header: "Age / Sex",
      width: 110,
      render: (p) => (
        <Text variant="body-sm" tone="secondary" tabular>
          {p.age} · {p.gender.charAt(0).toUpperCase()}
        </Text>
      ),
    },
    {
      key: "mobile",
      header: "Mobile",
      width: 130,
      render: (p) => (
        <Text variant="body-sm" tone="secondary" tabular>
          {p.mobile}
        </Text>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      render: (p) => <StatusChip status={p.status} size="sm" />,
    },
    {
      key: "visits",
      header: "Visits",
      width: 80,
      align: "right",
      sortable: true,
      sortValue: (p) => p.visitCount,
      render: (p) => (
        <Text variant="body-sm" tone="tertiary" tabular>
          {p.visitCount || "—"}
        </Text>
      ),
    },
  ];

  return (
    <Screen
      overline="Front office"
      title="Patients"
      subtitle={isError ? undefined : `${total.toLocaleString("en-IN")} registered`}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="patients-screen"
      right={
        canRegister ? (
          <Button
            label="Register patient"
            fullWidth={false}
            testID="register-patient-cta"
            icon={<UserPlus size={17} color="#FFFFFF" strokeWidth={2.2} />}
            onPress={() => navigation.navigate("RegisterPatient")}
          />
        ) : undefined
      }
    >
      <VStack gap={12}>
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, mobile or patient ID"
          testID="patient-search"
        />

        <ChipsRow chips={STATUS_CHIPS} active={status} onChange={setStatus} />

        {isError ? (
          <ErrorState error={error} title="Couldn't load patients" onRetry={refetch} />
        ) : isLoading && patients.length === 0 ? (
          <ListSkeleton />
        ) : (
          <>
            <DataTable<Patient>
              columns={columns}
              rows={patients}
              keyExtractor={(p) => p.id}
              onRowPress={open}
              rowAccent={(p) =>
                seesClinical && hasSevereAllergy(p) ? signal.critical.color : undefined
              }
              emptyIcon={Users}
              emptyTitle={
                debouncedSearch ? "Nobody matches that search" : "No patients registered yet"
              }
              emptyMessage={
                debouncedSearch
                  ? "Check the spelling, or try the mobile number."
                  : canRegister
                    ? "Register the first patient to get started."
                    : undefined
              }
              mobileCard={(p) => (
                <ListRow
                  title={p.fullName}
                  subtitle={`${p.patientId} · ${p.age} · ${p.gender}`}
                  meta={p.mobile}
                  onPress={() => open(p)}
                  showChevron
                  accentColor={
                    seesClinical && hasSevereAllergy(p) ? signal.critical.color : undefined
                  }
                  right={<StatusChip status={p.status} size="sm" />}
                />
              )}
            />

            {patients.length > 0 ? (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
                label="patients"
              />
            ) : null}
          </>
        )}
      </VStack>
    </Screen>
  );
}

function hasSevereAllergy(p: Patient) {
  return (p.allergies || []).some(
    (a) => a.severity === "severe" || a.severity === "anaphylaxis",
  );
}

/**
 * A small marker beside the name.
 *
 * Three states, matching the banner: a red triangle for a known allergy, an
 * amber shield for "nobody has asked", and nothing at all when the answer is a
 * recorded none. The middle one exists because a blank space reads as a
 * negative finding, and missing data is not a negative finding.
 */
function AllergyMark({ patient, seesClinical }: { patient: Patient; seesClinical: boolean }) {
  if (!seesClinical) return null;
  if (patient.allergiesRecorded === undefined) return null;

  if (!patient.allergiesRecorded) {
    return (
      <ShieldAlert
        size={13}
        color={palette.warning.text}
        strokeWidth={2.2}
        accessibilityLabel="Allergies not recorded"
      />
    );
  }
  if ((patient.allergies || []).length === 0) return null;

  return (
    <TriangleAlert
      size={13}
      color={signal.critical.color}
      strokeWidth={2.4}
      accessibilityLabel={`Allergic to ${(patient.allergies || []).map((a) => a.substance).join(", ")}`}
    />
  );
}

function ListSkeleton() {
  return (
    <VStack gap={8}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} compact>
          <HStack gap={14} align="center">
            <Skeleton width={110} height={12} />
            <View style={{ flex: 1 }}>
              <Skeleton width="55%" height={13} />
            </View>
            <Skeleton width={70} height={12} />
          </HStack>
        </Card>
      ))}
    </VStack>
  );
}
