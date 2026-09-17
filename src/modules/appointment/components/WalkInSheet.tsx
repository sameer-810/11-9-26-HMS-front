import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Check, CircleCheck, Footprints, UserPlus } from "lucide-react-native";

import { palette, radius, shadows, signal } from "@shared/designSystem";
import {
  Text,
  VStack,
  HStack,
  Button,
  ChipsRow,
  TextField,
  Banner,
  Skeleton,
  ListRow,
  SearchInput,
} from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { todayCalendarDate } from "@shared/format";
import { usePatients } from "@modules/patient/hooks/usePatients";
import {
  useDepartments,
  useDoctors,
} from "@modules/appointment/hooks/useDirectory";
import {
  useDoctorsAvailable,
  useWalkIn,
} from "@modules/appointment/hooks/useAppointments";
import type {
  Appointment,
  DoctorAvailability,
} from "@modules/appointment/types";

export interface WalkInPatient {
  id: string;
  fullName: string;
  patientId: string;
  age?: string;
  gender?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Known already (from the patient's page); otherwise the desk searches for them. */
  patient?: WalkInPatient;
  /** Offered when the search finds nobody. */
  onRegister?: () => void;
}

/** Plain words for the roster's view of today; a walk-in does not need a free slot. */
function clinicHint(entry?: DoctorAvailability) {
  if (!entry) return "";
  if (entry.available)
    return `In clinic today · ${entry.freeSlots} free slot${entry.freeSlots === 1 ? "" : "s"}`;
  if (entry.reason === "Fully booked") return "In clinic today · fully booked";
  if (entry.reason === "No clinic on this day") return "Not in clinic today";
  return entry.reason ?? "Not in clinic today";
}

/**
 * Walk-in to the OPD queue: patient, doctor, reason. The server marks the visit arrived at
 * once and issues the next token, which is shown large for the desk to hand over.
 */
export function WalkInSheet({ visible, onClose, patient, onRegister }: Props) {
  const reduceMotion = useReducedMotion();
  const walkIn = useWalkIn();

  const [chosen, setChosen] = useState<WalkInPatient | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Appointment | null>(null);

  const who = patient ?? chosen;
  const today = todayCalendarDate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const searching = !who && debouncedSearch.trim().length >= 2;
  const { data: results, isFetching } = usePatients(
    searching ? { search: debouncedSearch.trim(), limit: 6 } : undefined,
  );
  const { data: departments } = useDepartments();
  const { data: doctors, isLoading: loadingDoctors } = useDoctors(
    departmentId || undefined,
  );
  const { data: whoIsIn } = useDoctorsAvailable(
    visible ? today : undefined,
    departmentId || undefined,
  );

  const reset = () => {
    setChosen(null);
    setSearch("");
    setDepartmentId("");
    setDoctorId(null);
    setReason("");
    setError(null);
    setDone(null);
  };

  const close = () => {
    if (walkIn.isPending) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!who || !doctorId) return;
    setError(null);
    try {
      setDone(
        await walkIn.mutateAsync({
          patientId: who.id,
          doctorId,
          departmentId: departmentId || undefined,
          reason: reason.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not add this walk-in"));
    }
  };

  // Doctors in clinic today first; everyone stays choosable.
  const rows = (doctors ?? [])
    .map((d) => ({
      doctor: d,
      entry: whoIsIn?.find((w) => w.doctor?.id === d.id),
    }))
    .sort(
      (a, b) =>
        Number(Boolean(b.entry?.available)) -
        Number(Boolean(a.entry?.available)),
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="walkin-sheet">
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {done ? (
              <VStack gap={16}>
                <HStack gap={12} align="center">
                  <View style={styles.doneMark}>
                    <CircleCheck
                      size={22}
                      color={signal.normal.color}
                      strokeWidth={2.2}
                    />
                  </View>
                  <VStack gap={2} flex={1}>
                    <Text variant="h2" tone="primary" heading={2}>
                      Added to the queue
                    </Text>
                    <Text variant="body-sm" tone="tertiary">
                      {who?.fullName} is marked arrived and waiting.
                    </Text>
                  </VStack>
                </HStack>

                {/* The number the waiting room is called by. */}
                <View style={styles.tokenBox}>
                  <Text variant="overline" tone="tertiary">
                    Token
                  </Text>
                  <Text
                    variant="display"
                    tone="primary"
                    tabular
                    testID="walkin-token"
                  >
                    {done.tokenNumber ?? "—"}
                  </Text>
                  <Text variant="caption" tone="tertiary" tabular>
                    {done.appointmentNumber} ·{" "}
                    {(done.doctor as { fullName?: string })?.fullName ?? ""}
                  </Text>
                </View>

                <HStack gap={10} justify="flex-end" wrap>
                  <Button
                    label="Add another"
                    variant="secondary"
                    fullWidth={false}
                    onPress={reset}
                  />
                  <Button
                    label="Done"
                    fullWidth={false}
                    onPress={close}
                    testID="walkin-done"
                  />
                </HStack>
              </VStack>
            ) : (
              <VStack gap={16}>
                <VStack gap={2}>
                  <Text variant="h2" tone="primary" heading={2}>
                    Add walk-in
                  </Text>
                  <Text variant="body-sm" tone="tertiary">
                    They go straight into today&apos;s queue with a token. No
                    slot is needed.
                  </Text>
                </VStack>

                {error ? (
                  <Banner
                    tone="danger"
                    message={error}
                    onDismiss={() => setError(null)}
                  />
                ) : null}

                {/* Patient */}
                <VStack gap={8}>
                  <Text variant="label" tone="secondary">
                    Patient
                  </Text>
                  {who ? (
                    <HStack gap={12} align="center" wrap>
                      <VStack gap={2} flex={1}>
                        <Text
                          variant="label-lg"
                          tone="primary"
                          testID="walkin-patient"
                        >
                          {who.fullName}
                        </Text>
                        <Text variant="body-sm" tone="tertiary" tabular>
                          {[who.patientId, who.age, who.gender]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </VStack>
                      {!patient ? (
                        <Button
                          label="Change"
                          variant="secondary"
                          size="sm"
                          fullWidth={false}
                          onPress={() => {
                            setChosen(null);
                            setSearch("");
                          }}
                        />
                      ) : null}
                    </HStack>
                  ) : (
                    <VStack gap={8}>
                      <SearchInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search by name, mobile or patient ID"
                        testID="walkin-patient-search"
                      />
                      {searching && isFetching && !results?.data.length ? (
                        <Skeleton height={44} />
                      ) : searching && (results?.data ?? []).length > 0 ? (
                        <VStack gap={6}>
                          {results!.data.map((p) => (
                            <View
                              key={p.id}
                              testID={`walkin-result-${p.patientId}`}
                            >
                              <ListRow
                                title={p.fullName}
                                subtitle={`${p.patientId} · ${p.age} · ${p.gender}`}
                                meta={p.mobile}
                                showChevron
                                onPress={() =>
                                  setChosen({
                                    id: p.id,
                                    fullName: p.fullName,
                                    patientId: p.patientId,
                                    age: p.age,
                                    gender: p.gender,
                                  })
                                }
                              />
                            </View>
                          ))}
                        </VStack>
                      ) : searching && !isFetching ? (
                        <Banner
                          tone="warning"
                          message="Nobody matches that. Register them first, then add the walk-in."
                          action={
                            onRegister ? (
                              <Button
                                label="Register patient"
                                size="sm"
                                fullWidth={false}
                                icon={
                                  <UserPlus
                                    size={14}
                                    color="#FFFFFF"
                                    strokeWidth={2.2}
                                  />
                                }
                                onPress={() => {
                                  reset();
                                  onRegister();
                                }}
                                testID="walkin-register"
                              />
                            ) : undefined
                          }
                        />
                      ) : null}
                    </VStack>
                  )}
                </VStack>

                {/* Department and doctor */}
                <VStack gap={8}>
                  <Text variant="label" tone="secondary">
                    Department and doctor
                  </Text>
                  <ChipsRow
                    chips={[
                      { key: "", label: "All" },
                      ...(departments ?? []).map((d) => ({
                        key: d.id,
                        label: d.name,
                      })),
                    ]}
                    active={departmentId}
                    onChange={(key) => {
                      setDepartmentId(key);
                      setDoctorId(null);
                    }}
                  />
                  {loadingDoctors ? (
                    <Skeleton height={44} />
                  ) : rows.length === 0 ? (
                    <Text variant="body-sm" tone="tertiary">
                      No doctors in this department.
                    </Text>
                  ) : (
                    <VStack
                      gap={6}
                      role="radiogroup"
                      accessibilityLabel="Doctor"
                    >
                      {rows.map(({ doctor, entry }) => {
                        const selected = doctor.id === doctorId;
                        const hint = clinicHint(entry);
                        return (
                          <Pressable
                            key={doctor.id}
                            onPress={() => setDoctorId(doctor.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            {...checkable(selected, () =>
                              setDoctorId(doctor.id),
                            )}
                            accessibilityLabel={`${doctor.fullName}${hint ? `, ${hint}` : ""}`}
                            testID={`walkin-doctor-${doctor.id}`}
                            style={({ pressed }) => [
                              styles.doctor,
                              selected ? styles.doctorSelected : null,
                              pressed ? { opacity: 0.8 } : null,
                            ]}
                          >
                            <VStack gap={2} flex={1}>
                              <Text variant="label-lg" tone="primary">
                                {doctor.fullName}
                              </Text>
                              <Text
                                variant="caption"
                                style={{
                                  color: entry?.available
                                    ? signal.normal.text
                                    : palette.text.tertiary,
                                }}
                              >
                                {hint ||
                                  doctor.specialization ||
                                  doctor.designation}
                              </Text>
                            </VStack>
                            {selected ? (
                              <Check
                                size={16}
                                color={palette.clinical[700]}
                                strokeWidth={2.4}
                              />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>

                <TextField
                  label="Reason"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Fever since morning"
                  multiline
                  maxLength={300}
                  hint="What they came in with, in their words."
                  testID="walkin-reason"
                />

                <HStack gap={10} justify="flex-end" wrap>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    fullWidth={false}
                    disabled={walkIn.isPending}
                    onPress={close}
                  />
                  <Button
                    label="Add to queue"
                    fullWidth={false}
                    disabled={!who || !doctorId}
                    loading={walkIn.isPending}
                    onPress={submit}
                    testID="walkin-submit"
                    icon={
                      <Footprints size={16} color="#FFFFFF" strokeWidth={2.1} />
                    }
                  />
                </HStack>
              </VStack>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,18,32,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: palette.surface.primary,
    ...shadows.xl,
  },
  doctor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
  doctorSelected: {
    borderColor: palette.clinical[400],
    backgroundColor: palette.clinical[50],
  },
  doneMark: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: signal.normal.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
    alignItems: "center",
    gap: 2,
  },
});
