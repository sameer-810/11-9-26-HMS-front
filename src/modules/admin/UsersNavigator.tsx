import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import UsersScreen from "./screens/UsersScreen";
import UserDetailScreen from "./screens/UserDetailScreen";
import CreateUserScreen from "./screens/CreateUserScreen";

export type UsersStackParamList = {
  UsersList: undefined;
  UserDetail: { userId: string };
  CreateUser: undefined;
};

const Stack = createNativeStackNavigator<UsersStackParamList>();

/**
 * Staff accounts — list, create, one account.
 *
 * Create is its own screen rather than a panel on the list because it ends on
 * the one-time temporary password, and that deserves the whole screen: an
 * administrator reading it aloud should not have a list scrolling beside it.
 */
export default function UsersNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UsersList" component={UsersScreen} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} />
      <Stack.Screen name="CreateUser" component={CreateUserScreen} />
    </Stack.Navigator>
  );
}
