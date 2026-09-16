import React, { useState } from "react";
import { Pressable } from "react-native";

import { useAuthStore } from "@shared/store/useAuthStore";
import { Text, VStack } from "@shared/ui";
import type { Patient, PatientBanner } from "@modules/patient/types";
import { useCurrentAdmission } from "@modules/printing/hooks/usePrinting";
import {
  buildWristband,
  WRISTBAND_STOCK,
  type WristbandSize,
} from "@modules/printing/documents/wristband";
import { PrintButton } from "./PrintButton";

/**
 * "Print wristband" on the patient's page. Allergies come from the identity band, which reception
 * can read without `record.view`; the button waits until the band has loaded.
 */
export function PrintWristbandButton({
  patient,
  banner,
}: {
  patient: Patient;
  banner?: PatientBanner;
}) {
  const hospitalName = useAuthStore((s) => s.hospital?.name ?? "");
  const admitted = patient.status === "admitted";
  const admission = useCurrentAdmission(patient.id, admitted);

  // Under one year defaults to the infant band; an adult band slides off a neonate's hand.
  const [size, setSize] = useState<WristbandSize>(
    patient.ageYears !== null && patient.ageYears < 1 ? "infant" : "adult",
  );
  const other: WristbandSize = size === "adult" ? "infant" : "adult";

  const waitingForAdmission = admitted && admission.isLoading;
  const note =
    admitted && admission.isError
      ? "Ward and bed will not be printed: this login cannot see admissions."
      : `${size === "adult" ? "Adult" : "Infant"} band, ${WRISTBAND_STOCK[size].widthMm} × ${WRISTBAND_STOCK[size].lengthMm} mm`;

  return (
    <VStack gap={2} style={{ alignItems: "flex-end" }}>
      <PrintButton
        label="Print wristband"
        printerClass="label"
        testID="print-wristband"
        disabled={!banner || waitingForAdmission}
        disabledReason={!banner ? "Waiting for allergy status…" : undefined}
        note={note}
        build={() => {
          if (!banner) throw new Error("Allergy status has not loaded yet");
          const a = admission.data;
          return buildWristband(
            {
              hospitalName,
              patientId: patient.patientId,
              firstName: patient.firstName,
              lastName: patient.lastName,
              dateOfBirth: patient.dateOfBirth,
              age: patient.age,
              gender: patient.gender,
              recorded: banner.allergiesRecorded,
              allergies: banner.allergies,
              admission: a
                ? {
                    admissionNumber: a.admissionNumber,
                    wardName: a.ward?.name ?? "",
                    bedNumber: a.bed?.number ?? "",
                  }
                : null,
            },
            size,
          );
        }}
      />
      <Pressable
        onPress={() => setSize(other)}
        accessibilityRole="button"
        hitSlop={8}
        testID="wristband-size-toggle"
      >
        <Text variant="caption" tone="link">
          Use {other} band instead
        </Text>
      </Pressable>
    </VStack>
  );
}
