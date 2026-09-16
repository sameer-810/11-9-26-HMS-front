import React from "react";
import { useRoute } from "@react-navigation/native";
import { Construction } from "lucide-react-native";
import { Screen, EmptyState } from "@shared/ui";

/** stands in for a route whose module has not been built yet. */
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
