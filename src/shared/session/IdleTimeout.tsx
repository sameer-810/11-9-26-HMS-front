import React, { useEffect, useState } from "react";
import { AppState, Modal, Platform, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { palette, radius, shadows } from "../designSystem";
import { Button, HStack, Text } from "../ui";
import { useAuthStore } from "../store/useAuthStore";
import { useSessionNotice } from "./sessionNotice";
import { idleState, lastActivityAt, recordActivity } from "./activity";

const WEB_ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * US-01 session timeout, on the screen.
 *
 * A computer at a nursing station is left signed in all the time; the next
 * person to sit down reads whatever the last one had open. After the
 * hospital's configured minutes without a tap, click or keypress, the app
 * warns for one minute and then signs out.
 *
 * - Nothing queued is lost: signing out keeps observations and notes waiting
 *   in the outbox for the nurse who charted them (see useAuthStore.logout).
 * - Timers do not run while a phone app is in the background, so the check
 *   also runs when the app comes back to the foreground.
 * - The API holds the same line when a session that sat unused asks for a new
 *   token, so closing the laptop does not defeat it.
 *
 * The warning cannot be dismissed by tapping outside it: an accidental tap
 * must not sign anyone out, and it must not silently keep them in either.
 */
export function IdleTimeout() {
  const minutes = useAuthStore((s) => s.hospital?.sessionIdleMinutes ?? 30);
  const [remaining, setRemaining] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const signOut = (reason: "idle" | "chosen") => {
    if (reason === "idle") {
      useSessionNotice
        .getState()
        .setNotice(
          `You were signed out after ${minutes} minutes without activity, to protect patient information. Anything waiting to send is kept and sends when you sign in again.`,
        );
    }
    void useAuthStore.getState().logout();
  };

  useEffect(() => {
    // A fresh sign-in starts a fresh clock.
    recordActivity(true);

    const tick = () => {
      const state = idleState(lastActivityAt(), Date.now(), minutes);
      if (state.expired) {
        signOut("idle");
        return;
      }
      setRemaining(state.warn ? state.remaining : null);
    };

    const timer = setInterval(tick, 1_000);
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });

    let detach = () => {};
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onActivity = () => recordActivity();
      for (const e of WEB_ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { capture: true, passive: true });
      detach = () => {
        for (const e of WEB_ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
      };
    }

    return () => {
      clearInterval(timer);
      appState.remove();
      detach();
    };
    // signOut reads `minutes` through the closure recreated with this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);

  const seconds = remaining === null ? 0 : Math.max(1, Math.ceil(remaining / 1000));

  return (
    <Modal
      visible={remaining !== null}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={() => {
        recordActivity(true);
        setRemaining(null);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal testID="idle-warning" role="alertdialog" aria-labelledby="idle-title">
          <Text variant="h2" tone="primary" heading={2} nativeID="idle-title">
            Are you still there?
          </Text>
          <Text variant="body-sm" tone="secondary" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
            {`This screen signs out in ${seconds} ${seconds === 1 ? "second" : "seconds"} to protect patient information.`}
          </Text>
          <HStack gap={10} justify="flex-end" wrap style={{ marginTop: 20 }}>
            <Button
              label="Sign out now"
              variant="secondary"
              fullWidth={false}
              onPress={() => signOut("chosen")}
              testID="idle-sign-out"
            />
            <Button
              label="Stay signed in"
              fullWidth={false}
              onPress={() => {
                recordActivity(true);
                setRemaining(null);
              }}
              testID="idle-stay"
            />
          </HStack>
        </View>
      </View>
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
