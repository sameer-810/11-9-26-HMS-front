import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CircleCheck } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import {
  useAdmission,
  useDischarge,
} from "@modules/inpatient/hooks/useInpatient";
import type { PatientBanner } from "@modules/patient/types";

/**
 * Discharge (IP-05). Summary, medication and follow-up are required (also server-enforced);
 * "None" is a valid answer for medication and follow-up.
 */
const DISCHARGE_TYPES = [
  { value: "routine", label: "Routine discharge" },
  { value: "against_advice", label: "Against medical advice" },
  { value: "referred", label: "Referred to another hospital" },
  { value: "absconded", label: "Absconded" },
  { value: "deceased", label: "Deceased" },
];

export default function DischargeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const admissionId: string = route.params?.admissionId;

  const {
    data: admission,
    isLoading,
    isError,
    error,
    refetch,
  } = useAdmission(admissionId);
  const discharge = useDischarge(admissionId);

  const [summary, setSummary] = useState("");
  const [medication, setMedication] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [type, setType] = useState("routine");

  if (isLoading) {
    return (
      <Screen title="Discharge">
        <VStack gap={12}>
          <Skeleton height={80} />
          <Skeleton height={160} />
        </VStack>
      </Screen>
    );
  }

  if (isError || !admission) {
    return (
      <Screen title="Discharge">
        <ErrorState error={error} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const patient = admission.patient as PatientBanner;

  if (admission.status !== "admitted") {
    return (
      <Screen title="Discharge">
        <Card>
          <VStack gap={8}>
            <HStack gap={8} align="center">
              <CircleCheck size={18} color={signal.normal.text} />
              <Text variant="h4">Already discharged</Text>
            </HStack>
            <Text variant="body-sm" tone="secondary">
              {patient?.fullName ?? admission.admissionNumber} was discharged
              {admission.dischargedBy ? ` by ${admission.dischargedBy}` : ""}.
            </Text>
            <Button
              label="Back to the ward"
              onPress={() => navigation.goBack()}
            />
          </VStack>
        </Card>
      </Screen>
    );
  }

  const missing: string[] = [];
  if (summary.trim().length < 20) missing.push("discharge summary");
  if (!medication.trim()) missing.push("discharge medication");
  if (!followUp.trim()) missing.push("follow-up instructions");

  return (
    <Screen
      title={`Discharge ${patient?.fullName ?? admission.admissionNumber}`}
      subtitle={`${admission.ward?.name ?? ""} · bed ${admission.bed?.number ?? "—"} · day ${admission.lengthOfStayDays ?? 1}`}
      scroll
    >
      <VStack gap={16}>
        <Banner
          tone="info"
          title="These three are required"
          message="A summary, the discharge medication and follow-up instructions. Without them the patient goes home with nothing the next clinician can read. Write 'None' where there genuinely is none."
        />

        {discharge.isError ? (
          <View testID="discharge-error">
            <ErrorState error={discharge.error} title="Not discharged" />
          </View>
        ) : null}

        <Card>
          <VStack gap={12}>
            <TextField
              label="Discharge summary"
              required
              hint="What happened during this admission, what was found, what was done. This is what the GP reads."
              value={summary}
              onChangeText={setSummary}
              multiline
              testID="discharge-summary"
            />
            <TextField
              label="Discharge medication"
              required
              hint="Everything the patient takes home, with doses and durations. 'None' if there is none."
              value={medication}
              onChangeText={setMedication}
              multiline
              testID="discharge-medication"
            />
            <TextField
              label="Follow-up instructions"
              required
              hint="When to be seen, by whom, and what should bring them back sooner."
              value={followUp}
              onChangeText={setFollowUp}
              multiline
              testID="discharge-followup"
            />
            <TextField
              label="Discharge diagnosis"
              value={diagnosis}
              onChangeText={setDiagnosis}
              testID="discharge-diagnosis"
            />
            <Select
              label="Type of discharge"
              value={type}
              options={DISCHARGE_TYPES}
              onChange={setType}
            />
          </VStack>
        </Card>

        {missing.length > 0 ? (
          <View style={styles.missing} testID="discharge-missing">
            <Text variant="caption" tone="secondary">
              Still needed: {missing.join(", ")}.
            </Text>
          </View>
        ) : null}

        <Button
          label={discharge.isPending ? "Discharging…" : "Complete discharge"}
          disabled={missing.length > 0 || discharge.isPending}
          onPress={() =>
            discharge.mutate(
              {
                dischargeSummary: summary.trim(),
                dischargeMedication: medication.trim(),
                followUpInstructions: followUp.trim(),
                dischargeDiagnosis: diagnosis.trim() || undefined,
                dischargeType: type as "routine",
              },
              // Use this stack's route name; navigate() to an unknown name is a silent no-op.
              { onSuccess: () => navigation.navigate("WardBoard") },
            )
          }
          testID="discharge-submit"
        />
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  missing: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface.sunken,
  },
});
