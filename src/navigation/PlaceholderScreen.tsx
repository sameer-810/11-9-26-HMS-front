import React from "react";
import { useRoute } from "@react-navigation/native";
import { Construction } from "lucide-react-native";
import { Screen, EmptyState } from "@shared/ui";

/**
 * Stands in for a screen whose module has not landed yet.
 *
 * Exists so navigation, permissions and deep links are exercised against the
 * real route table from the first phase, rather than against a shrunken one
 * that behaves differently once the screens arrive. It says plainly that the
 * module is not built — a blank page would read as a bug.
 */
export function PlaceholderScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as { __label?: string; __section?: string };
  const label = params.__label ?? route.name;

  return (
    <Screen overline={params.__section} title={label}>
      <EmptyState
        icon={Construction}
        title={`${label} is not built yet`}
        message="This route is registered and permission-guarded. The module lands in a later phase."
      />
    </Screen>
  );
}
