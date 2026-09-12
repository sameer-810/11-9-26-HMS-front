import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CalendarDays, ChevronLeft, ChevronRight, Stethoscope } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  Select,
  TextField,
  Banner,
  Skeleton,
  SlotGrid,
  ListRow,
  SearchInput,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { usePatients, usePatientBanner } from "@modules/patient/hooks/usePatients";
import { useDepartments, useDoctors } from "@modules/appointment/hooks/useDirectory";
import {
  useAvailability,
  useBookAppointment,
  useDoctorsAvailable,
} from "@modules/appointment/hooks/useAppointments";
import { todayCalendarDate, addCalendarDays, formatCalendarDate } from "@shared/format";

/**
 * AP-01, in order: patient, department, doctor, then a slot the roster
 * actually offers.
 *
 * Dates are calendar strings throughout — "2026-09-15", never a Date. The API
 * takes them that way because an appointment is a wall-clock fact about a
 * building, and a Date here would be reinterpreted by whatever timezone the
 * server happens to run in.
 */
export default function BookAppointmentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const preselectedPatientId = (route.params as { patientId?: string })?.patientId;

  const [patientId, setPatientId] = useState<string | null>(preselectedPatientId ?? null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayCalendarDate());
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [visitType, setVisitType] = useState<string | null>("new");
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: patientResults, isLoading: searching } = usePatients(
    debouncedSearch.trim().length >= 2 ? { search: debouncedSearch.trim(), limit: 6 } : undefined,
  );
  const { data: banner } = usePatientBanner(patientId ?? undefined);

  const { data: departments } = useDepartments();
  const { data: doctors } = useDoctors(departmentId ?? undefined);
  const { data: whoIsFree } = useDoctorsAvailable(date, departmentId ?? undefined);
  const { data: availability, isLoading: loadingSlots } = useAvailability(
    doctorId ?? undefined,
    date,
  );

  const book = useBookAppointment();

  const shiftDate = (days: number) => {
    setDate((d) => addCalendarDays(d, days));
    setTime(null);
  };

  const submit = async () => {
    if (!patientId || !doctorId || !time) return;
    setError(null);
    try {
      const appointment = await book.mutateAsync({
        patientId,
        doctorId,
        departmentId: departmentId ?? undefined,
        date,
        time,
        visitType: (visitType as "new" | "follow_up") ?? "new",
        reason: reason.trim() || undefined,
      });
      navigation.replace("AppointmentBooked", { id: appointment.id });
    } catch (err) {
      const code = apiErrorCode(err);
      // The server sends the free alternatives back with the refusal, so the
      // desk can offer one without starting the form again.
      if (code === "SLOT_UNAVAILABLE" || code === "SLOT_NOT_ON_ROSTER") {
        setTime(null);
      }
      setError(apiErrorMessage(err, "Could not book this appointment"));
    }
  };

  /**
   * Doctors are NEVER disabled here.
   *
   * The availability shown is for the date currently selected, and the date
   * picker sits BELOW this one — so disabling a doctor who has no clinic today
   * makes it impossible to book them for any future day. The user would have to
   * change a date they cannot reach without first choosing a doctor they are
   * not allowed to choose.
   *
   * So availability is a hint on the option, not a gate. Picking a doctor with
   * no clinic on this date is answered by the slot grid, which says which day
   * to try instead.
   */
  const doctorOptions = (doctors ?? []).map((d) => {
    const free = whoIsFree?.find((w) => w.doctor?.id === d.id);
    const hint = free
      ? free.available
        ? `${free.freeSlots} free on this date · next ${free.nextFreeTime}`
        : `${free.reason || "No clinic"} on this date`
      : d.specialization || d.designation;
    return { value: d.id, label: d.fullName, sublabel: hint };
  });

  return (
    <Screen
      patient={banner ?? undefined}
      overline="Front office"
      title="Book appointment"
      testID="book-appointment"
    >
      <VStack gap={16} style={{ maxWidth: 860 }}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        {/* 1 — patient. AP-01: they must already be registered. */}
        <Card>
          <SectionHeader title="1. Patient" subtitle="They must already be registered" />
          {patientId && banner ? (
            <HStack gap={12} align="center" wrap>
              <VStack gap={2} flex={1}>
                <Text variant="label-lg" tone="primary">
                  {banner.fullName}
                </Text>
                <Text variant="body-sm" tone="tertiary" tabular>
                  {banner.patientId} · {banner.age} · {banner.gender}
                </Text>
              </VStack>
              <Button
                label="Change"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => {
                  setPatientId(null);
                  setSearch("");
                }}
              />
            </HStack>
          ) : (
            <VStack gap={10}>
              <SearchInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, mobile or patient ID"
                testID="book-patient-search"
              />
              {searching && debouncedSearch.length >= 2 ? (
                <Skeleton height={44} />
              ) : (patientResults?.data ?? []).length > 0 ? (
                <VStack gap={6}>
                  {patientResults!.data.map((p) => (
                    <ListRow
                      key={p.id}
                      title={p.fullName}
                      subtitle={`${p.patientId} · ${p.age} · ${p.gender}`}
                      meta={p.mobile}
                      showChevron
                      onPress={() => setPatientId(p.id)}
                    />
                  ))}
                </VStack>
              ) : debouncedSearch.trim().length >= 2 ? (
                <Banner
                  tone="warning"
                  message="Nobody matches that. Register the patient first — an appointment cannot be booked against a name that is not on file."
                  action={
                    <Button
                      label="Register patient"
                      size="sm"
                      fullWidth={false}
                      onPress={() => navigation.navigate("RegisterPatient")}
                    />
                  }
                />
              ) : null}
            </VStack>
          )}
        </Card>

        {/* 2 — department and doctor. AP-01: department filters the doctors. */}
        <Card>
          <SectionHeader title="2. Department and doctor" />
          <HStack gap={12} wrap>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Select
                label="Department"
                value={departmentId}
                placeholder="Any department"
                options={(departments ?? []).map((d) => ({
                  value: d.id,
                  label: d.name,
                  sublabel: d.code,
                }))}
                onChange={(v) => {
                  setDepartmentId(v);
                  setDoctorId(null);
                  setTime(null);
                }}
              />
            </View>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Select
                label="Doctor"
                required
                value={doctorId}
                placeholder="Choose a doctor"
                options={doctorOptions}
                onChange={(v) => {
                  setDoctorId(v);
                  setTime(null);
                }}
              />
            </View>
          </HStack>
        </Card>

        {/* 3 — the day and the slot. */}
        <Card>
          <SectionHeader
            title="3. Date and time"
            subtitle="Only slots on this doctor's roster can be chosen"
          />

          <HStack gap={10} align="center" style={{ marginBottom: 14 }} wrap>
            <Button
              label="Previous"
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon={<ChevronLeft size={15} color={palette.text.primary} strokeWidth={2.2} />}
              onPress={() => shiftDate(-1)}
            />
            <View style={styles.dateBox}>
              <HStack gap={8} align="center">
                <CalendarDays size={16} color={palette.clinical[600]} strokeWidth={2.1} />
                <Text variant="label-lg" tone="primary" testID="book-date">
                  {formatCalendarDate(date)}
                </Text>
              </HStack>
            </View>
            <Button
              label="Next"
              variant="secondary"
              size="sm"
              fullWidth={false}
              rightIcon={<ChevronRight size={15} color={palette.text.primary} strokeWidth={2.2} />}
              onPress={() => shiftDate(1)}
            />
            <Button
              label="Today"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => {
                setDate(todayCalendarDate());
                setTime(null);
              }}
            />
          </HStack>

          {!doctorId ? (
            <Banner tone="info" message="Choose a doctor to see when they are free." />
          ) : loadingSlots ? (
            <HStack gap={8} wrap>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} width={92} height={44} />
              ))}
            </HStack>
          ) : (
            <SlotGrid
              slots={availability?.slots ?? []}
              value={time}
              onChange={setTime}
              unavailableReason={availability?.reason}
              testID="slot-grid"
            />
          )}
        </Card>

        {/* 4 — why. */}
        <Card>
          <SectionHeader title="4. Reason" subtitle="In the patient's own words" />
          <VStack gap={12}>
            <Select
              label="Visit type"
              value={visitType}
              options={[
                { value: "new", label: "New visit" },
                { value: "follow_up", label: "Follow-up" },
              ]}
              onChange={setVisitType}
            />
            <TextField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Fever for three days"
              multiline
              testID="book-reason"
              hint="What they came in with. Not a diagnosis."
            />
          </VStack>
        </Card>

        <HStack gap={10} justify="flex-end" wrap>
          <Button
            label="Cancel"
            variant="secondary"
            fullWidth={false}
            onPress={() => navigation.goBack()}
          />
          <Button
            label={time ? `Book ${time}` : "Choose a slot"}
            fullWidth={false}
            disabled={!patientId || !doctorId || !time}
            loading={book.isPending}
            onPress={submit}
            testID="book-submit"
            icon={<Stethoscope size={16} color="#FFFFFF" strokeWidth={2.1} />}
          />
        </HStack>
      </VStack>
    </Screen>
  );
}

const styles = {
  dateBox: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
} as const;
