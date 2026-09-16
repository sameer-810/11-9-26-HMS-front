/**
 * HMS design tokens. Brand is blue; red/amber/green are reserved for clinical signal.
 * WCAG 2.1 AA throughout; contrast ratios are noted beside each status pair.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------


export const palette = {
  /** Cool slate. The interface is built almost entirely out of this ramp. */
  ink: {
    900: "#0B1220",
    800: "#111A2B",
    700: "#1F2A3C",
    600: "#3A4657",
    500: "#5B6779",
    400: "#8A94A3",
    300: "#BFC6D0",
    200: "#DCE1E7",
    100: "#EDF0F4",
    50: "#F6F8FA",
  },

  /** Primary — clinical blue. Actions, links, selection, focus. */
  clinical: {
    900: "#0A2A47",
    800: "#0D3A63",
    700: "#104E82",
    600: "#1463A6",
    500: "#1C7DC9",
    400: "#4A9BDA",
    300: "#84BCE8",
    200: "#B7D8F2",
    100: "#DCEBF9",
    50: "#EFF6FD",
  },

  /** Accent — teal. Secondary emphasis only; never a status. */
  teal: {
    900: "#07352F",
    800: "#0A4A41",
    700: "#0C6357",
    600: "#10806F",
    500: "#159C88",
    400: "#3DBCA6",
    300: "#7AD3C3",
    200: "#B0E6DC",
    100: "#D8F3EE",
    50: "#EEFAF8",
  },

  neutral: {
    0: "#FFFFFF",
    50: "#F6F8FA",
    100: "#EDF0F4",
    200: "#DCE1E7",
    300: "#BFC6D0",
    400: "#8A94A3",
    500: "#5B6779",
    600: "#3A4657",
    700: "#1F2A3C",
    800: "#111A2B",
    900: "#0B1220",
  },

  surface: {
    primary: "#FFFFFF",
    secondary: "#F6F8FA",
    tertiary: "#EDF0F4",
    raised: "#FFFFFF",
    sunken: "#EDF0F4",
    dark: "#0B1220",
    darkRaised: "#111A2B",
  },

  text: {
    primary: "#0B1220",
    secondary: "#3A4657",
    tertiary: "#5B6779",
    disabled: "#8A94A3",
    inverse: "#FFFFFF",
    accent: "#104E82",
    link: "#1463A6",
  },

  border: {
    subtle: "#EDF0F4",
    default: "#DCE1E7",
    strong: "#BFC6D0",
    focus: "#1463A6",
    dark: "#1F2A3C",
  },

  // ---- Generic UI status (banners, toasts, form feedback) ------------------
  // Deliberately separate from the clinical `signal` ramp.
  success: { bg: "#E6F4EC", text: "#0B6B3F", border: "#B6E0C9" }, // 6.05:1
  warning: { bg: "#FDF2DC", text: "#8A5304", border: "#F5DDA8" }, // 6.34:1
  danger: { bg: "#FCEAE8", text: "#A82418", border: "#F5C6C0" }, // 6.48:1
  info: { bg: "#E9F1FB", text: "#104E82", border: "#C3DBF2" }, // 7.12:1
} as const;


// ---------------------------------------------------------------------------
// Clinical signal — the sacred ramp
// ---------------------------------------------------------------------------

/**
 * Clinical alert tiers (four, no more). Always render `shape` with the colour
 * so the tier stays readable to colour-blind staff.
 */
export const signal = {
  /** Act now. Anaphylaxis risk, critical lab value, arrest call, ESI 1. */
  critical: {
    color: "#B3261E",
    onColor: "#FFFFFF",
    bg: "#FCEAE8",
    border: "#F0B4AD",
    text: "#8C1D18",
    shape: "octagon",
    icon: "octagon-alert",
    label: "Critical",
  },
  /** Act soon. Out-of-range vitals, urgent order, ESI 2. */
  urgent: {
    color: "#B25000",
    onColor: "#FFFFFF",
    bg: "#FDEDE0",
    border: "#F3C9A4",
    text: "#8A3D00",
    shape: "triangle",
    icon: "triangle-alert",
    label: "Urgent",
  },
  /** Worth knowing, optionally actionable. Due review, mild abnormality. */
  caution: {
    color: "#8A5304",
    onColor: "#FFFFFF",
    bg: "#FDF2DC",
    border: "#F0D49A",
    text: "#6B4003",
    shape: "diamond",
    icon: "info",
    label: "Caution",
  },
  /** Within range, nothing required. */
  normal: {
    color: "#0B6B3F",
    onColor: "#FFFFFF",
    bg: "#E6F4EC",
    border: "#AFDCC4",
    text: "#08512F",
    shape: "circle",
    icon: "circle-check",
    label: "Normal",
  },
} as const;

export type SignalLevel = keyof typeof signal;

/**
 * How intrusive each tier may be: blocking modal, confirm, inline, or passive badge.
 * Only critical overrides require a typed reason, so routine alerts do not breed junk reasons.
 */
export const alertTier = {
  critical: { presentation: "blocking", requireReason: true, dismissible: false },
  urgent: { presentation: "confirm", requireReason: false, dismissible: true },
  caution: { presentation: "inline", requireReason: false, dismissible: true },
  normal: { presentation: "passive", requireReason: false, dismissible: true },
} as const;

/** Result flags against the reference range; critical ones are panic values that escalate. */
export const valueFlag = {
  criticalLow: { signal: "critical" as SignalLevel, glyph: "LL", label: "Critically low" },
  low: { signal: "urgent" as SignalLevel, glyph: "L", label: "Low" },
  normal: { signal: "normal" as SignalLevel, glyph: "", label: "Normal" },
  high: { signal: "urgent" as SignalLevel, glyph: "H", label: "High" },
  criticalHigh: { signal: "critical" as SignalLevel, glyph: "HH", label: "Critically high" },
} as const;

export type ValueFlag = keyof typeof valueFlag;

/** Emergency Severity Index, the ED triage scale. 1 is resuscitation. */
export const triageLevel = {
  1: { label: "Resuscitation", signal: "critical" as SignalLevel, color: "#B3261E", targetMinutes: 0 },
  2: { label: "Emergent", signal: "critical" as SignalLevel, color: "#D9480F", targetMinutes: 10 },
  3: { label: "Urgent", signal: "urgent" as SignalLevel, color: "#B25000", targetMinutes: 30 },
  4: { label: "Less urgent", signal: "caution" as SignalLevel, color: "#8A5304", targetMinutes: 60 },
  5: { label: "Non-urgent", signal: "normal" as SignalLevel, color: "#0B6B3F", targetMinutes: 120 },
} as const;

/** Bed states, from the spec's state table. Colour carries the meaning here. */
export const bedState = {
  available: { label: "Available", color: "#0B6B3F", bg: "#E6F4EC", border: "#AFDCC4" },
  occupied: { label: "Occupied", color: "#1463A6", bg: "#E9F1FB", border: "#C3DBF2" },
  reserved: { label: "Reserved", color: "#8A5304", bg: "#FDF2DC", border: "#F0D49A" },
  maintenance: { label: "Under maintenance", color: "#5B6779", bg: "#EDF0F4", border: "#DCE1E7" },
} as const;


// ---------------------------------------------------------------------------
// Dark theme
// ---------------------------------------------------------------------------

/** Dark theme: raised surfaces get lighter (elevation, not inversion). */
export const darkPalette = {
  surface: {
    primary: "#141C2B",
    secondary: "#0D1420",
    tertiary: "#1B2537",
    raised: "#1B2537",
    sunken: "#0A111B",
    dark: "#060C14",
    darkRaised: "#141C2B",
  },
  text: {
    primary: "#E8ECF2",
    secondary: "#B4BECC",
    tertiary: "#8A94A3",
    disabled: "#5B6779",
    inverse: "#0B1220",
    accent: "#84BCE8",
    link: "#84BCE8",
  },
  border: {
    subtle: "#1F2A3C",
    default: "#2A3648",
    strong: "#3A4657",
    focus: "#4A9BDA",
    dark: "#060C14",
  },
  success: { bg: "#0E2E1E", text: "#6FD39B", border: "#1C4F33" },
  warning: { bg: "#332507", text: "#E8B55C", border: "#54401A" },
  danger: { bg: "#3A1512", text: "#F09186", border: "#5E2620" },
  info: { bg: "#0E2842", text: "#79B6E8", border: "#1C4468" },
} as const;

/** Signal ramp re-tuned for dark surfaces, where daylight reds and ambers glare. */
export const darkSignal = {
  critical: {
    color: "#F2655A",
    onColor: "#2A0806",
    bg: "#3A1512",
    border: "#6B2A24",
    text: "#F09186",
    shape: "octagon",
    icon: "octagon-alert",
    label: "Critical",
  },
  urgent: {
    color: "#E8903F",
    onColor: "#2A1503",
    bg: "#38230C",
    border: "#66401A",
    text: "#EFAE72",
    shape: "triangle",
    icon: "triangle-alert",
    label: "Urgent",
  },
  caution: {
    color: "#E0B75E",
    onColor: "#2A1F03",
    bg: "#332507",
    border: "#5E4715",
    text: "#E8C87F",
    shape: "diamond",
    icon: "info",
    label: "Caution",
  },
  normal: {
    color: "#54C489",
    onColor: "#04240F",
    bg: "#0E2E1E",
    border: "#1F5336",
    text: "#7FD6A6",
    shape: "circle",
    icon: "circle-check",
    label: "Normal",
  },
} as const;


// ---------------------------------------------------------------------------
// Status accents — KPI tiles and chart series
// ---------------------------------------------------------------------------
export const accents = {
  clinical: { color: "#1463A6", tint: "#E9F1FB" },
  teal: { color: "#10806F", tint: "#E3F4F1" },
  violet: { color: "#6B4FC4", tint: "#EEEBFA" },
  amber: { color: "#A96A08", tint: "#FDF2DC" },
  rose: { color: "#B3261E", tint: "#FCEAE8" },
  green: { color: "#0B6B3F", tint: "#E6F4EC" },
  neutral: { color: "#5B6779", tint: "#EDF0F4" },
} as const;

/** Chart series colours, ordered for greyscale/CVD contrast. Assign in order, never by hash. */
export const chartSeries = [
  "#1463A6",
  "#10806F",
  "#A96A08",
  "#6B4FC4",
  "#B3261E",
  "#0B6B3F",
  "#5B6779",
  "#4A9BDA",
] as const;


// ---------------------------------------------------------------------------
// Spacing, radius, elevation
// ---------------------------------------------------------------------------

/** 4pt grid. */
export const space = {
  none: 0,
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 16,
  full: 9999,
} as const;

export const outline = { width: 1, color: palette.border.default } as const;

const soft = (y: number, blur: number, opacity: number, elev: number) => ({
  shadowColor: "#0B1220",
  shadowOffset: { width: 0, height: y },
  shadowOpacity: opacity,
  shadowRadius: blur,
  elevation: elev,
});

/** Shadows for floating layers only; resting surfaces use a hairline border. */
export const shadows = {
  none: {},
  xs: soft(1, 2, 0.03, 1),
  sm: soft(1, 3, 0.05, 2),
  md: soft(4, 12, 0.07, 4),
  lg: soft(8, 24, 0.1, 8),
  xl: soft(16, 36, 0.12, 14),
} as const;

export const elevation = {
  base: shadows.none,
  raised: shadows.none,
  floating: shadows.md,
  overlay: shadows.lg,
} as const;

export const motion = {
  duration: { instant: 80, fast: 150, medium: 250, slow: 400 },
  spring: {
    gentle: { damping: 18, stiffness: 180 },
    default: { damping: 20, stiffness: 220 },
    bouncy: { damping: 12, stiffness: 200 },
    crisp: { damping: 25, stiffness: 300 },
  },
} as const;


// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * One family, weights up to 600. Sentence case everywhere; `overline` is the only
 * uppercase style and never carries clinical content.
 */
export const fonts = {
  display: "Inter_600SemiBold",
  heading: "Inter_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_600SemiBold",
  /** Doses, batch numbers, ESC/P previews — anything that must not re-flow. */
  mono: "monospace",
} as const;

/** Tabular figures for any number compared down a column (vitals, doses, amounts). */
export const numeric = { fontVariant: ["tabular-nums" as const] };

export const typography = {
  display: {
    large: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display },
    medium: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display },
    small: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display },
  },
  heading: {
    h1: { fontSize: 20, lineHeight: 26, fontFamily: fonts.heading },
    h2: { fontSize: 17, lineHeight: 24, fontFamily: fonts.heading },
    h3: { fontSize: 15, lineHeight: 20, fontFamily: fonts.heading },
    h4: { fontSize: 13, lineHeight: 18, fontFamily: fonts.heading },
  },
  body: {
    large: { fontSize: 15, lineHeight: 22, fontFamily: fonts.bodyRegular },
    default: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodyRegular },
    small: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodyRegular },
  },
  label: {
    large: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodyMedium },
    medium: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodyMedium },
    small: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bodyMedium },
  },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bodyRegular },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  /** Large, unmissable — the vitals tile, the value on a result card. */
  metric: { fontSize: 24, lineHeight: 28, fontFamily: fonts.display, ...numeric },
  metricSmall: { fontSize: 18, lineHeight: 22, fontFamily: fonts.display, ...numeric },
} as const;


// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export const breakpoints = { sm: 640, md: 760, lg: 900, xl: 1100, xxl: 1280 } as const;

/** Table density presets; screens read these rather than hard-coding row heights. */
export const density = {
  comfortable: { rowHeight: 52, cellPaddingY: 12, fontScale: 1 },
  standard: { rowHeight: 44, cellPaddingY: 8, fontScale: 1 },
  compact: { rowHeight: 36, cellPaddingY: 4, fontScale: 0.96 },
} as const;

export type Density = keyof typeof density;

export const layout = {
  screenPadding: 24,
  screenPaddingPhone: 16,
  cardPadding: 16,
  cardPaddingCompact: 12,

  controlHeight: 38,
  /** 44 is the accessibility floor, and the hand may be gloved. */
  controlHeightPhone: 46,

  sectionGap: 24,
  itemGap: 12,

  sidebarWidth: 248,
  sidebarCollapsedWidth: 68,
  navRowHeight: 36,

  tabBarHeight: 64,
  tabBarClearance: 88,

  chipHeight: 30,
  rowHeight: 44,
  rowHeightDense: 36,
  rowHeightPhone: 60,
  tableHeaderHeight: 36,

  /** Patient identity band: never scrolled away or collapsed (wrong-patient safety). */
  patientBannerHeight: 64,
  patientBannerHeightPhone: 76,

  contentMaxWidth: 1320,
  wideBreakpoint: 900,

  /** Minimum tappable square, WCAG 2.5.5. */
  minTouchTarget: 44,
} as const;

export const gradients = {
  hero: ["#104E82", "#1463A6", "#10806F"],
  clinical: ["#1463A6", "#0D3A63"],
  teal: ["#10806F", "#0A4A41"],
  light: ["#FFFFFF", "#F6F8FA"],
  mist: ["#EFF6FD", "#EEFAF8"],
} as const;

/** Brand alias — prefer this over reaching into `palette.clinical` directly. */
export const brand = palette.clinical;

export type Palette = typeof palette;
export type Signal = typeof signal;
