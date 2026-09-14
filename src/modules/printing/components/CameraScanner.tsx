import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { palette, radius } from "@shared/designSystem";
import { Button, Skeleton, Text, VStack } from "@shared/ui";

export interface CameraScannerProps {
  onCode: (code: string) => void;
  onClose: () => void;
}

/**
 * Camera scanning on iOS and Android, with expo-camera's built-in decoder.
 * The web build resolves `CameraScanner.web.tsx` instead.
 *
 * Code 128 and DataMatrix are the two symbologies this system prints; QR is
 * accepted as well because it costs nothing and some referral letters carry
 * one. Everything else is ignored rather than sent to the server as a miss.
 */
export function CameraScanner({ onCode, onClose }: CameraScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  // expo-camera fires continuously while a code is in view; only the first
  // read may navigate.
  const delivered = useRef(false);

  if (!permission) return <Skeleton height={240} />;

  if (!permission.granted) {
    return (
      <VStack gap={10}>
        <Text variant="body-sm" tone="secondary">
          The camera is needed to scan a wristband or tube.
        </Text>
        <Button label="Allow camera" size="sm" fullWidth={false} onPress={requestPermission} />
        <Button label="Cancel" variant="ghost" size="sm" fullWidth={false} onPress={onClose} />
      </VStack>
    );
  }

  return (
    <VStack gap={10}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["code128", "datamatrix", "qr"] }}
          onBarcodeScanned={({ data }) => {
            if (delivered.current || !data) return;
            delivered.current = true;
            onCode(data);
          }}
        />
      </View>
      <Button label="Stop camera" variant="secondary" size="sm" fullWidth={false} onPress={onClose} />
    </VStack>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 3 / 4,
    maxHeight: 420,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: palette.ink[900],
  },
});
