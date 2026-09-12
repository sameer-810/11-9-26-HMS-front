import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "@shared/store/useAuthStore";
import { palette } from "@shared/designSystem";
import AppNavigator from "./AppNavigator";
import LoginScreen from "@modules/auth/screens/LoginScreen";

const Stack = createNativeStackNavigator();

/**
 * The session gate.
 *
 * The authenticated and unauthenticated trees are mutually exclusive branches
 * of one navigator rather than a redirect, so there is no window in which a
 * signed-out user has a mounted app screen. The `key` forces a full remount on
 * the auth flip, which drops every cached screen holding patient data — the
 * next person to sign in on a shared ward tablet must not inherit the previous
 * user's rendered state.
 */
export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthChecked = useAuthStore((s) => s.isAuthChecked);

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

  return (
    <Stack.Navigator
      key={isAuthenticated ? "app-root" : "auth-root"}
      screenOptions={{ headerShown: false }}
    >
      {isAuthenticated ? (
        <Stack.Screen name="App" component={AppNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
