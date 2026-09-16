import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";

import { palette, radius } from "@shared/designSystem";
import { Banner, Button, Text, VStack } from "@shared/ui";

export interface CameraScannerProps {
  onCode: (code: string) => void;
  onClose: () => void;
}

/**
 * Browser camera scanning with ZXing, loaded on demand (a large bundle most desks never need).
 * Stops at the first read so the next screen does not read the same band again.
 */
export function CameraScanner({ onCode, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let cancelled = false;
    let delivered = false;
    let controls: { stop: () => void } | null = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || delivered) return;
          delivered = true;
          controls?.stop();
          onCodeRef.current(result.getText());
        });
        if (cancelled) controls.stop();
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was refused. Allow the camera for this site, or use the scanner."
            : name === "NotFoundError"
              ? "This computer has no camera."
              : "The camera could not be started.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <VStack gap={10}>
      {error ? (
        <Banner tone="warning" message={error} />
      ) : (
        <View style={styles.frame}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </View>
      )}
      <Text variant="caption" tone="tertiary">
        Hold the square code or the barcode inside the frame, flat and well lit.
      </Text>
      <Button label="Stop camera" variant="secondary" size="sm" fullWidth={false} onPress={onClose} testID="scan-camera-stop" />
    </VStack>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: palette.ink[900],
  },
});
