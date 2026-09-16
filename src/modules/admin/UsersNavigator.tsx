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
 * staff accounts stack: list, create, detail.
 * create is a full screen because it ends on the one-time temporary password.
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
