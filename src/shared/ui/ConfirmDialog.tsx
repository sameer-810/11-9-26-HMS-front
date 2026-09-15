import React from "react";
import { Modal, Pressable, StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { palette, radius, shadows } from "../designSystem";
import { Text } from "./Text";
import { HStack } from "./Stack";
import { Button } from "./Button";

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A real, cross-platform confirmation.
 *
 * Replaces `window.confirm`, which is web-only and a silent no-op on native —
 * a confirmation that does not appear on the tablet a nurse is holding is worse
 * than no confirmation, because the code believes it asked.
 *
 * For anything clinical, use ClinicalAlert instead. This is for ordinary
 * destructive actions like deactivating a user.
 *
 * Keyboard: focus moves into the dialog and stays there; Escape cancels, and
 * focus returns to whatever opened it.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? "none" : "fade"} onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={loading ? undefined : onCancel} focusable={false}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal focusable={false}>
          <Text variant="h2" tone="primary" heading={2}>
            {title}
          </Text>
          {message ? (
            <Text variant="body-sm" tone="secondary" style={{ marginTop: 8 }}>
              {message}
            </Text>
          ) : null}
          <HStack gap={10} justify="flex-end" style={{ marginTop: 20 }}>
            <Button
              label={cancelLabel}
              variant="secondary"
              fullWidth={false}
              disabled={loading}
              onPress={onCancel}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? "destructive" : "primary"}
              fullWidth={false}
              loading={loading}
              onPress={onConfirm}
            />
          </HStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,18,32,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: palette.surface.primary,
    borderRadius: radius.xl,
    padding: 20,
    ...shadows.xl,
  },
});
