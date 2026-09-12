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
 * Three mutually exclusive states, as branches of one navigator rather than
 * redirects between them:
 *
 *   signed out            → the auth stack
 *   signed in, temp cred  → nothing but the password change
 *   signed in             → the app
 *
 * The middle branch mirrors the server, which refuses every other route with
 * PASSWORD_CHANGE_REQUIRED until the credential is replaced. Rendering the app
 * and then redirecting would leave a window in which app screens are mounted
 * and firing requests that are all going to be refused.
 *
 * The `key` forces a full remount whenever the state changes, which drops every
 * cached screen holding patient data. On a shared ward tablet the next person
 * to sign in must not inherit the previous user's rendered state.
 */
export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthChecked = useAuthStore((s) => s.isAuthChecked);
  // A primitive selector, deliberately: zustand v5 compares with Object.is, so
  // a selector returning a fresh object would re-render forever.
  const mustChangePassword = useAuthStore((s) => Boolean(s.user?.mustChangePassword));

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

  const branch = !isAuthenticated ? "auth" : mustChangePassword ? "forced" : "app";

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
