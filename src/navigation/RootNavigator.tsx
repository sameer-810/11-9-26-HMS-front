import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuthStore } from "@shared/store/useAuthStore";
import { palette } from "@shared/designSystem";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import ChangePasswordScreen from "@modules/auth/screens/ChangePasswordScreen";

const Stack = createNativeStackNavigator();

function ForcedPasswordChange() {
  return <ChangePasswordScreen forced />;
}

/**
 * picks one branch: the auth stack, a forced password change, or the app.
 * the `key` remounts on change so a shared tablet drops the previous user's patient screens.
 */
export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthChecked = useAuthStore((s) => s.isAuthChecked);
  // A primitive selector, deliberately: zustand v5 compares with Object.is, so
  // a selector returning a fresh object would re-render forever.
  const mustChangePassword = useAuthStore((s) =>
    Boolean(s.user?.mustChangePassword),
  );

  useEffect(() => {
    if (isHydrated) void useAuthStore.getState().initializeAuth();
  }, [isHydrated]);

  if (!isHydrated || !isAuthChecked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.surface.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={palette.clinical[600]} />
      </View>
    );
  }

  const branch = !isAuthenticated
    ? "auth"
    : mustChangePassword
      ? "forced"
      : "app";

  return (
    <Stack.Navigator key={branch} screenOptions={{ headerShown: false }}>
      {branch === "auth" ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : branch === "forced" ? (
        <Stack.Screen name="SetPassword" component={ForcedPasswordChange} />
      ) : (
        <Stack.Screen name="App" component={AppNavigator} />
      )}
    </Stack.Navigator>
  );
}
