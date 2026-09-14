import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@shared/store/useAuthStore";
import { patientApi } from "@modules/patient/api/patientApi";
import type { PatientBanner } from "@modules/patient/types";
import type { LabOrder } from "@modules/laboratory/types";
import { buildSpecimenLabel } from "@modules/printing/documents/specimenLabel";
import { buildLabReport } from "@modules/printing/documents/labReport";
import { PrintButton } from "./PrintButton";

/**
 * The tube label, once a sample number exists.
 *
 * The patient is fetched at press time for the date of birth, which the order's
 * identity band does not carry. A tube is checked against the request form by
 * name AND a second identifier, and the date of birth is the one a patient can
 * confirm out loud at the bedside.
 */
export function PrintTubeLabelButton({ order }: { order: LabOrder }) {
  const qc = useQueryClient();
  const banner = order.patient as PatientBanner;

  return (
    <PrintButton
      label="Print tube label"
      printerClass="label"
      align="flex-start"
      testID="print-tube-label"
      disabled={!order.sampleId || !banner?.id}
      build={async () => {
        const p = await qc.fetchQuery({
          queryKey: ["patient", banner.id],
          queryFn: () => patientApi.get(banner.id),
        });
        return buildSpecimenLabel({
          patient: {
            patientId: p.patientId,
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dateOfBirth,
            age: p.age,
            gender: p.gender,
          },
          sampleId: order.sampleId,
          orderNumber: order.orderNumber,
          testName: order.test.name,
          sampleType: order.test.sampleType,
          container: order.test.container,
          collectedAt: order.sampleCollectedAt,
          urgency: order.urgency,
        });
      }}
    />
  );
}

/** The report, for a reported order only — the caller hides it otherwise, and the builder refuses. */
export function PrintLabReportButton({ order }: { order: LabOrder }) {
  const hospitalName = useAuthStore((s) => s.hospital?.name ?? "");
  const printedBy = useAuthStore((s) => s.user?.fullName ?? "");
  const patient = order.patient as PatientBanner;

  return (
    <PrintButton
      label="Print report"
      printerClass="page"
      align="flex-start"
      testID="print-lab-report"
      disabled={order.status !== "reported" || !patient?.patientId}
      build={() =>
        buildLabReport({
          hospitalName,
          patient: {
            patientId: patient.patientId,
            fullName: patient.fullName,
            age: patient.age,
            gender: patient.gender,
          },
          orderNumber: order.orderNumber,
          sampleId: order.sampleId,
          testName: order.test.name,
          sampleType: order.test.sampleType,
          urgency: order.urgency,
          clinicalIndication: order.clinicalIndication,
          orderedBy: order.doctor.fullName,
          requestedAt: order.requestedAt,
          sampleCollectedAt: order.sampleCollectedAt,
          reportedAt: order.status === "reported" ? order.reportedAt : null,
          performedByName: order.performedByName,
          reportedByName: order.reportedByName,
          labComment: order.labComment,
          results: order.results,
          printedBy,
          printedAt: new Date(),
        })
      }
    />
  );
}
