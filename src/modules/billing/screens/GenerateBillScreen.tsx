import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  SearchInput,
  Button,
  Banner,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { formatDateTime, formatRupees } from "@shared/format";
import { usePatients } from "@modules/patient/hooks/usePatients";
import { useBillingPreview, useGenerateBill } from "@modules/billing/hooks/useBilling";
import { ChargeTable } from "@modules/billing/components/ChargeTable";
import type { BillType } from "@modules/billing/types";

/**
 * BL-01 / BL-02: generate a bill from compiled charges.
 *
 * Flow 1 step 12: "Charges are already compiled." This screen shows what they
 * are before a bill exists — the outpatient charges, and each admission with
 * its running or final charges — and generates the bill from them. There is no
 * field here to type an amount into.
 */
export default function GenerateBillScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [patientId, setPatientId] = useState<string | undefined>(route.params?.patientId);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const results = usePatients(!patientId && debounced.trim().length >= 2 ? { search: debounced.trim(), limit: 8 } : undefined);
  const { data: preview, isLoading, isError, error, refetch } = useBillingPreview(patientId);
  const generate = useGenerateBill();

  const run = (billType: BillType, admissionId?: string) =>
    generate.mutate(
      { patientId: patientId!, billType, admissionId },
      { onSuccess: (bill) => navigation.navigate("BillDetail", { billId: bill.id }) },
    );

  return (
    <Screen overline="Billing" title="Generate a bill" subtitle="From the charges already compiled" testID="generate-bill">
      <VStack gap={14}>
        {!patientId ? (
          <Card>
            <VStack gap={10}>
              <SectionHeader title="Which patient?" />
              <SearchInput value={search} onChangeText={setSearch} placeholder="Name, hospital number or mobile" testID="generate-patient-search" />
              {(results.data?.data ?? []).map((p) => (
                <Button
                  key={p.id}
                  label={`${p.fullName} · ${p.patientId} · ${p.mobile ?? ""}`}
                  variant="secondary"
                  onPress={() => setPatientId(p.id)}
                  testID={`generate-pick-${p.patientId}`}
                />
              ))}
            </VStack>
          </Card>
        ) : isLoading ? (
          <Skeleton height={200} />
        ) : isError || !preview ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <Card>
              <HStack justify="space-between" align="center" wrap gap={8}>
                <VStack gap={2}>
                  <Text variant="label-lg">{preview.patient.fullName}</Text>
                  <Text variant="caption" tone="secondary">
                    {preview.patient.patientId} · {preview.patient.age} · {preview.patient.gender} · {preview.patient.mobile}
                  </Text>
                </VStack>
                {!route.params?.patientId ? (
                  <Button label="Change patient" size="sm" variant="ghost" onPress={() => setPatientId(undefined)} />
                ) : null}
              </HStack>
            </Card>

            {generate.isError ? (
              <View testID="generate-error">
                <Banner tone="danger" title="No bill was generated" message={apiErrorMessage(generate.error)} />
              </View>
            ) : null}

            {preview.drafts.length ? (
              <Banner
                tone="info"
                title="A draft is already open"
                message={preview.drafts.map((d) => `${d.billNumber} (${d.billType === "ipd" ? "inpatient" : "outpatient"}, ${formatRupees(d.total)})`).join(", ")}
                action={
                  <Button label={`Open ${preview.drafts[0].billNumber}`} size="sm" variant="secondary" onPress={() => navigation.navigate("BillDetail", { billId: preview.drafts[0].id })} />
                }
              />
            ) : null}

            <Card testID="preview-opd">
              <VStack gap={10}>
                <SectionHeader title="Outpatient charges" subtitle={`${preview.opd.lines.length} unbilled · ${formatRupees(preview.opd.total)}`} />
                {preview.opd.warnings.map((w, i) => (
                  <Text key={i} variant="caption" tone="warning">{w}</Text>
                ))}
                <ChargeTable lines={preview.opd.lines} />
                <Button
                  label="Generate outpatient bill"
                  disabled={preview.opd.lines.length === 0}
                  loading={generate.isPending && generate.variables?.billType === "opd"}
                  onPress={() => run("opd")}
                  testID="generate-opd"
                />
              </VStack>
            </Card>

            {preview.admissions.map((a) => (
              <Card key={a.id} testID={`preview-admission-${a.admissionNumber}`}>
                <VStack gap={10}>
                  <SectionHeader
                    title={`Admission ${a.admissionNumber}`}
                    subtitle={`${formatDateTime(a.admittedAt)}${a.dischargedAt ? ` to ${formatDateTime(a.dischargedAt)}` : " · still admitted"} · ${formatRupees(a.total)}`}
                  />
                  {a.warnings.map((w, i) => (
                    <Text key={i} variant="caption" tone="warning">{w}</Text>
                  ))}
                  <ChargeTable lines={a.lines} />
                  {a.status === "admitted" ? (
                    <Text variant="caption" tone="secondary">
                      Still admitted — room charges are still accruing. The final bill is generated after discharge.
                    </Text>
                  ) : (
                    <Button
                      label="Generate inpatient bill"
                      disabled={a.lines.length === 0}
                      loading={generate.isPending && generate.variables?.admissionId === a.id}
                      onPress={() => run("ipd", a.id)}
                      testID={`generate-ipd-${a.admissionNumber}`}
                    />
                  )}
                </VStack>
              </Card>
            ))}
          </>
        )}
      </VStack>
    </Screen>
  );
}
