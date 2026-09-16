import React, { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Camera, ScanLine } from "lucide-react-native";

import { palette, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Banner,
  Button,
  Card,
  HStack,
  Screen,
  Text,
  TextField,
  VStack,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useScanCode } from "@modules/printing/hooks/usePrinting";
import { CameraScanner } from "@modules/printing/components/CameraScanner";
import type { ScanResult } from "@modules/printing/types";

/**
 * Scan a wristband or tube and open it. USB scanners type and press Enter, so the field
 * refocuses after each scan. Destination depends on permissions (lab order, record, or patient page).
 */

/** MUST mirror the MedicalRecord nav item's `permissionAny`. */
const RECORD_ROUTE_PERMISSIONS = [
  PERMISSIONS.RECORD_VIEW,
  PERMISSIONS.CONSULTATION_MANAGE,
  PERMISSIONS.VITALS_RECORD,
  PERMISSIONS.LAB_RESULTS_MANAGE,
  PERMISSIONS.PHARMACY_DISPENSE,
];

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const scan = useScanCode();

  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  // Bumped to remount the field and regain focus: TextField has no ref, autoFocus works everywhere.
  const [fieldKey, setFieldKey] = useState(0);

  const opensRecord = RECORD_ROUTE_PERMISSIONS.some((p) => hasPermission(p));
  const opensLabOrder = hasPermission(PERMISSIONS.LAB_QUEUE_VIEW);

  // Reset on focus so the previous patient's result is not shown.
  useFocusEffect(
    useCallback(() => {
      scan.reset();
      setScanned(null);
      setCode("");
      setFieldKey((k) => k + 1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const open = (result: ScanResult) => {
    if (result.kind === "specimen" && result.orderId && opensLabOrder) {
      navigation.navigate("LabQueue", {
        screen: "LabOrder",
        params: { orderId: result.orderId },
      });
      return;
    }
    if (opensRecord) {
      navigation.navigate("MedicalRecord", { patientId: result.patient.id });
      return;
    }
    navigation.navigate("Patients", {
      screen: "PatientDetail",
      params: { id: result.patient.id },
    });
  };

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || scan.isPending) return;
    setScanned(trimmed);
    setCode("");
    setCamera(false);
    scan.mutate(trimmed, {
      onSuccess: open,
      onSettled: () => setFieldKey((k) => k + 1),
    });
  };

  const errorCode = scan.isError ? apiErrorCode(scan.error) : undefined;

  return (
    <Screen
      overline="Identification"
      title="Scan"
      subtitle="Wristband or specimen label"
      testID="scan-screen"
    >
      <VStack gap={14} style={{ maxWidth: 640 }}>
        <Card>
          <VStack gap={12}>
            <HStack gap={8} align="center">
              <ScanLine
                size={18}
                color={palette.text.secondary}
                strokeWidth={2.2}
              />
              <Text variant="label">
                Scan now, or type the number and press Enter
              </Text>
            </HStack>
            <TextField
              key={fieldKey}
              autoFocus
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => submit(code)}
              submitBehavior="submit"
              returnKeyType="search"
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              placeholder="CGH-P000001"
              accessibilityLabel="Scanned code"
              testID="scan-input"
            />
            <HStack gap={8} wrap>
              <Button
                label="Open"
                size="sm"
                fullWidth={false}
                disabled={!code.trim()}
                loading={scan.isPending}
                onPress={() => submit(code)}
                testID="scan-submit"
              />
              {!camera ? (
                <Button
                  label="Use camera"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  icon={
                    <Camera
                      size={14}
                      color={palette.text.primary}
                      strokeWidth={2.2}
                    />
                  }
                  onPress={() => setCamera(true)}
                  testID="scan-camera"
                />
              ) : null}
            </HStack>
            {camera ? (
              <CameraScanner onCode={submit} onClose={() => setCamera(false)} />
            ) : null}
          </VStack>
        </Card>

        {errorCode === "SCAN_NOT_FOUND" ? (
          <Card accentColor={signal.caution.color} testID="scan-not-found">
            <VStack gap={6}>
              <Text variant="h3">No patient matches this code</Text>
              <Text variant="body-sm" tone="secondary">
                Scanned: {scanned}. Check the band or label belongs to this
                hospital, and find the patient by name instead. Do not treat
                anyone on the strength of a band that does not scan.
              </Text>
            </VStack>
          </Card>
        ) : scan.isError ? (
          <Banner
            tone="danger"
            title={
              errorCode === "SCAN_MALFORMED"
                ? "Not a code from this system"
                : "Could not look that up"
            }
            message={apiErrorMessage(scan.error)}
          />
        ) : null}
      </VStack>
    </Screen>
  );
}
