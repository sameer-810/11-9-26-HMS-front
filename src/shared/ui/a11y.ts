import { Platform } from "react-native";

/**
 * ARIA attributes react-native-web renders but React Native's typings do not
 * declare — `aria-describedby`, `aria-invalid`, `aria-level` and friends.
 *
 * Spread the result onto a component: `<TextInput {...webAria({ invalid })} />`.
 * On native it is empty, because the same meaning is already carried there by
 * `accessibilityHint`, `accessibilityState` and `accessibilityRole="header"`.
 */
export function webAria(props: {
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  level?: number;
  hasPopup?: "menu" | "listbox" | "dialog";
  /** A tab's state. Only for role tab, option, row or gridcell. */
  selected?: boolean;
  /** Whether the popup a trigger controls is open. */
  expanded?: boolean;
  /** A toggle button's state. `aria-selected` is not allowed on a button. */
  pressed?: boolean;
  /** The current item in a set of links. `aria-selected` is not allowed on a link. */
  current?: "page" | "step" | "true";
}): object {
  if (Platform.OS !== "web") return {};
  const out: Record<string, unknown> = {};
  if (props.selected !== undefined) out["aria-selected"] = props.selected;
  if (props.expanded !== undefined) out["aria-expanded"] = props.expanded;
  if (props.pressed !== undefined) out["aria-pressed"] = props.pressed;
  if (props.current) out["aria-current"] = props.current;
  if (props.describedBy) out["aria-describedby"] = props.describedBy;
  if (props.invalid) out["aria-invalid"] = true;
  if (props.required) out["aria-required"] = true;
  if (props.level) out["aria-level"] = props.level;
  if (props.hasPopup) out["aria-haspopup"] = props.hasPopup;
  return out;
}

/**
 * Web behaviour for a Pressable with role checkbox, radio or switch.
 *
 * react-native-web does not turn `accessibilityState.checked` into
 * `aria-checked`, so on the web every checkbox and radio in the app announced
 * no state at all — a pharmacist using a screen reader could not tell whether
 * the allergy check was ticked. It also only activates `role="button"` on
 * Space, so a checkbox could be ticked with Enter but not with the key every
 * other checkbox on the web uses.
 *
 *   <Pressable accessibilityRole="checkbox" onPress={toggle} {...checkable(on, toggle)} />
 */
export function checkable(checked: boolean, onToggle: () => void, disabled?: boolean): object {
  if (Platform.OS !== "web") return {};
  return {
    "aria-checked": checked,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (disabled || (e.key !== " " && e.key !== "Spacebar")) return;
      e.preventDefault(); // or the page scrolls
      onToggle();
    },
  };
}

/** An id safe to use as a DOM id reference, from React's `useId()`. */
export const domId = (reactId: string, suffix: string) => `a11y${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${suffix}`;
