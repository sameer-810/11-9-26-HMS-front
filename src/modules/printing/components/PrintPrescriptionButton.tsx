import React from "react";

import { useAuthStore } from "@shared/store/useAuthStore";
import type { DispenseContext } from "@modules/pharmacy/types";
import { buildPrescription } from "@modules/printing/documents/prescription";
import { PrintButton } from "./PrintButton";

/**
 * "Print prescription" on the dispensing screen, built from the dispense context
 * (saved prescription, prescriber registration, current allergies per §17).
 */
export function PrintPrescriptionButton({ ctx }: { ctx: DispenseContext }) {
  const hospitalName = useAuthStore((s) => s.hospital?.name ?? "");
  const printedBy = useAuthStore((s) => s.user?.fullName ?? "");

  return (
    <PrintButton
      label="Print prescription"
      printerClass="page"
      testID="print-prescription"
      build={() =>
        buildPrescription({
          hospitalName,
          prescriptionNumber: ctx.prescription.prescriptionNumber,
          createdAt: ctx.prescription.createdAt,
          urgency: ctx.prescription.urgency,
          notes: ctx.prescription.notes,
          patient: {
            patientId: ctx.patient.patientId,
            fullName: ctx.patient.fullName,
            age: ctx.patient.age,
            gender: ctx.patient.gender,
            recorded: ctx.patient.allergiesRecorded,
            allergies: ctx.patient.allergies,
          },
          prescriber: {
            fullName: ctx.prescription.doctor.fullName,
            designation: ctx.prescription.doctor.designation,
            registrationNumber: ctx.prescription.doctor.registrationNumber,
          },
          lines: ctx.lines
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
          cancelledLineCount: ctx.lines.filter((l) => l.status === "cancelled").length,
          printedBy,
          printedAt: new Date(),
        })
      }
    />
  );
}
