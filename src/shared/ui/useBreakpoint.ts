import { useWindowDimensions } from "react-native";
import { breakpoints, layout, density, type Density } from "../designSystem";

export interface Breakpoint {
  width: number;
  isPhone: boolean;
  isTablet: boolean;
  isWide: boolean;
  /** Below this the DataTable swaps rows for cards. */
  isNarrowTable: boolean;
  screenPadding: number;
  controlHeight: number;
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;
  const isPhone = width < breakpoints.md;

  return {
    width,
    isPhone,
    isTablet: !isPhone && !isWide,
    isWide,
    isNarrowTable: width < breakpoints.md,
    screenPadding: isWide ? layout.screenPadding : layout.screenPaddingPhone,
    controlHeight: isWide ? layout.controlHeight : layout.controlHeightPhone,
  };
}

/** Table row density derived from the viewport, with an optional per-screen override. */
export function useDensity(override?: Density) {
  const { isWide, isPhone } = useBreakpoint();
  const resolved: Density = override ?? (isPhone ? "comfortable" : isWide ? "standard" : "standard");
  return { name: resolved, ...density[resolved] };
}

export function useControlHeight() {
  return useBreakpoint().controlHeight;
}
