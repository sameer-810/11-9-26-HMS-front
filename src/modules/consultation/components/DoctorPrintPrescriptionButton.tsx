import React from "react";

import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import { prescriptionApi } from "@modules/consultation/api/consultationApi";
import { buildPrescription } from "@modules/printing/documents/prescription";
import { PrintButton } from "@modules/printing/components/PrintButton";
import type { PatientBanner } from "@modules/patient/types";

/**
 * "Print prescription" for the prescriber. The saved prescription is fetched at press time,
 * so the page carries the prescriber's registration and the patient's current allergies,
 * as the pharmacy print does. Renders nothing without prescription.create.
 */
export function DoctorPrintPrescriptionButton({
  prescriptionId,
  testID,
  align = "flex-end",
}: {
  prescriptionId: string;
  testID?: string;
  align?: "flex-start" | "flex-end";
}) {
  const canPrescribe = useAuthStore((s) => s.hasPermission)(
    PERMISSIONS.PRESCRIPTION_CREATE,
  );
  const hospitalName = useAuthStore((s) => s.hospital?.name ?? "");
  const printedBy = useAuthStore((s) => s.user?.fullName ?? "");

  if (!canPrescribe) return null;

  return (
    <PrintButton
      label="Print prescription"
      printerClass="page"
      align={align}
      testID={testID}
      build={async () => {
        const rx = await prescriptionApi.get(prescriptionId);
        const patient = rx.patient as PatientBanner;
        if (!patient?.patientId) {
          throw new Error("The patient's details could not be loaded");
        }
        return buildPrescription({
          hospitalName,
          prescriptionNumber: rx.prescriptionNumber,
          createdAt: rx.createdAt,
          urgency: rx.urgency,
          notes: rx.notes,
          patient: {
            patientId: patient.patientId,
            fullName: patient.fullName,
            age: patient.age,
            gender: patient.gender,
            recorded: patient.allergiesRecorded,
            allergies: patient.allergies,
          },
          prescriber: {
            fullName: rx.doctor.fullName ?? "",
            designation: rx.doctor.designation ?? "",
            registrationNumber: rx.doctor.registrationNumber ?? "",
          },
          lines: rx.lines
            .filter((l) => l.status !== "cancelled")
            .map((l) => ({
              medicineName: l.medicineName,
              strength: l.strength,
              form: l.form,
              dose: l.dose,
              frequency: l.frequency,
              durationDays: l.durationDays,
              route: l.route,
              instructions: l.instructions,
              quantity: l.quantity,
            })),
          cancelledLineCount: rx.lines.filter((l) => l.status === "cancelled")
            .length,
          printedBy,
          printedAt: new Date(),
        });
      }}
    />
  );
}
