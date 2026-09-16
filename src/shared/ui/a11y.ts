import { Platform } from "react-native";

/**
 * Web-only ARIA props RN typings lack; spread as `{...webAria({ invalid })}`.
 * Empty on native, where accessibilityState/Hint/Role carry the same meaning.
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
 * Web fix for checkbox/radio/switch Pressables: RNW omits `aria-checked` and Space-to-toggle.
 *   <Pressable accessibilityRole="checkbox" onPress={toggle} {...checkable(on, toggle)} />
 */
export function checkable(
  checked: boolean,
  onToggle: () => void,
  disabled?: boolean,
): object {
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
export const domId = (reactId: string, suffix: string) =>
  `a11y${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${suffix}`;
