import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { LogOut, MonitorSmartphone } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import {
  Card,
  SectionHeader,
  Text,
  VStack,
  HStack,
  Button,
  Banner,
  Skeleton,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import {
  useRevokeSession,
  useSessions,
  useSignOutOthers,
} from "@modules/auth/hooks/useAuth";
import type { SessionSummary } from "@modules/auth/api/authApi";

/** Every device this account is signed in on, with a way to end the ones that are not this one. */
export function SessionsCard() {
  const { data: sessions, isLoading, isError, refetch } = useSessions();
  const revoke = useRevokeSession();
  const signOutOthers = useSignOutOthers();

  const [target, setTarget] = useState<SessionSummary | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // This device first; the rest as the server orders them, most recently used first.
  const list = [...(sessions ?? [])].sort(
    (a, b) => Number(b.isCurrent) - Number(a.isCurrent),
  );
  const others = list.filter((s) => !s.isCurrent);

  const endOne = async () => {
    if (!target) return;
    setError(null);
    setNotice(null);
    try {
      await revoke.mutateAsync(target.id);
      setNotice(`${target.deviceName} has been signed out.`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not sign that device out"));
    } finally {
      setTarget(null);
    }
  };

  const endOthers = async () => {
    setError(null);
    setNotice(null);
    try {
      await signOutOthers.mutateAsync();
      setNotice("Every other device has been signed out.");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not sign the other devices out"));
    } finally {
      setConfirmAll(false);
    }
  };

  return (
    <Card testID="profile-sessions">
      <SectionHeader
        title="Where you're signed in"
        subtitle="If you don't recognise a device, sign it out and change your password."
      />
      <VStack gap={12}>
        {notice ? (
          <View testID="sessions-notice">
            <Banner
              tone="success"
              message={notice}
              onDismiss={() => setNotice(null)}
            />
          </View>
        ) : null}
        {error ? (
          <Banner
            tone="danger"
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={48} />
            <Skeleton height={48} />
          </VStack>
        ) : isError ? (
          <HStack gap={10} align="center" wrap>
            <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
              Couldn&apos;t load your devices.
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => refetch()}
            />
          </HStack>
        ) : (
          <VStack gap={8}>
            {list.map((s) => (
              <View
                key={s.id}
                style={styles.row}
                testID={`session-row-${s.id}`}
              >
                <HStack gap={12} align="center" wrap>
                  <MonitorSmartphone
                    size={18}
                    color={palette.text.tertiary}
                    strokeWidth={1.9}
                  />
                  <VStack gap={2} flex={1} style={{ minWidth: 180 }}>
                    <HStack gap={8} align="center" wrap>
                      <Text variant="label-lg" tone="primary">
                        {s.deviceName}
                      </Text>
                      {s.isCurrent ? (
                        <View style={styles.current} testID="session-current">
                          <Text
                            variant="label-sm"
                            weight="600"
                            style={{ color: palette.clinical[700] }}
                          >
                            This device
                          </Text>
                        </View>
                      ) : null}
                    </HStack>
                    <Text variant="caption" tone="tertiary">
                      Last active {formatDateTime(s.lastUsedAt)}
                      {s.ip ? ` · ${s.ip}` : ""}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      Signed in {formatDateTime(s.createdAt)}
                    </Text>
                  </VStack>
                  {!s.isCurrent ? (
                    <Button
                      label="Sign out"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      accessibilityHint={`Ends the session on ${s.deviceName}`}
                      testID={`session-sign-out-${s.id}`}
                      onPress={() => setTarget(s)}
                    />
                  ) : null}
                </HStack>
              </View>
            ))}
          </VStack>
        )}

        {others.length > 0 ? (
          <Button
            label="Sign out everywhere else"
            variant="secondary"
            fullWidth={false}
            icon={
              <LogOut size={15} color={palette.text.primary} strokeWidth={2} />
            }
            onPress={() => setConfirmAll(true)}
            testID="sessions-sign-out-others"
          />
        ) : null}
        <Text variant="caption" tone="tertiary">
          An account can only be signed in on a limited number of devices at
          once. If you reach the limit, sign out of one you no longer use.
        </Text>
      </VStack>

      <ConfirmDialog
        visible={Boolean(target)}
        title="Sign out this device?"
        message={`Whoever is using ${target?.deviceName ?? "that device"} is signed out straight away and has to sign in again. Anything they have not saved is lost.`}
        confirmLabel="Sign out"
        destructive
        loading={revoke.isPending}
        onConfirm={endOne}
        onCancel={() => setTarget(null)}
      />
      <ConfirmDialog
        visible={confirmAll}
        title="Sign out everywhere else?"
        message={`${others.length} other ${others.length === 1 ? "device is" : "devices are"} signed out straight away. This device stays signed in.`}
        confirmLabel="Sign out others"
        destructive
        loading={signOutOthers.isPending}
        onConfirm={endOthers}
        onCancel={() => setConfirmAll(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
  },
  current: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: palette.clinical[50],
  },
});
