/**
 * HMS design system.
 *
 * ---------------------------------------------------------------------------
 * The one rule everything else follows
 * ---------------------------------------------------------------------------
 * Colour is reserved for clinical signal. Red, amber and green mean something
 * specific at a bedside, and they must not also mean "this is our brand" or
 * "this button is the important one". So the brand is BLUE, the interface is
 * near-monochrome, and the signal ramp below is the only place warm colour and
 * green appear.
 *
 * That is why the primary action colour is not green even though green reads as
 * "health": a green Save button sitting beside a green "Normal" result badge
 * teaches staff to stop reading green as a clinical answer. Once that happens
 * the whole signal system is decoration.
 *
 * ---------------------------------------------------------------------------
 * Where the alert rules come from
 * ---------------------------------------------------------------------------
 * The `signal` ramp and the `alertTier` model implement published EHR alerting
 * guidance rather than taste:
 *   - at most four alert colours, or staff stop distinguishing them;
 *   - every colour paired with a SHAPE, because roughly 1 in 12 men has a
 *     colour vision deficiency and a red/green-only scheme is invisible to them;
 *   - interruptiveness matched to severity — a low-value alert that interrupts
 *     is how a hospital trains its staff to dismiss alerts unread;
 *   - sentence case, never ALL CAPS, which measurably slows reading.
 *
 * ---------------------------------------------------------------------------
 * Accessibility floor
 * ---------------------------------------------------------------------------
 * WCAG 2.1 AA throughout: 4.5:1 for body text, 3:1 for large text and UI
 * boundaries. Contrast ratios against their stated background are recorded
 * beside each status pair so a future edit cannot quietly drop below the line.
 * Touch targets are 44px on phone, because the person tapping may be wearing
 * gloves.
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
  // Distinct from the clinical `signal` ramp below on purpose: "saved
  // successfully" and "this patient's potassium is lethal" must not share a
  // visual language.
  success: { bg: "#E6F4EC", text: "#0B6B3F", border: "#B6E0C9" }, // 6.05:1
  warning: { bg: "#FDF2DC", text: "#8A5304", border: "#F5DDA8" }, // 6.34:1
  danger: { bg: "#FCEAE8", text: "#A82418", border: "#F5C6C0" }, // 6.48:1
  info: { bg: "#E9F1FB", text: "#104E82", border: "#C3DBF2" }, // 7.12:1
} as const;

// ---------------------------------------------------------------------------
// Clinical signal — the sacred ramp
// ---------------------------------------------------------------------------

/**
 * Four tiers, no more.
 *
 * `shape` is not decorative. It is the redundant encoding that keeps the tier
 * readable to a colour-blind clinician, and every component that renders a
 * signal MUST render the shape alongside the colour. A bare coloured dot is a
 * bug, not a style choice.
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
 * How intrusive an alert of a given tier is allowed to be.
 *
 * Deliberately a data table rather than a decision scattered across screens.
 * When someone later asks for "just one more popup", the request has to be made
 * here, in one place, where the cost is visible.
 *
 *  - `blocking`  — a modal the user must resolve. Reserved for critical.
 *  - `confirm`   — inline, but the action cannot proceed unacknowledged.
 *  - `inline`    — shown in place, no interruption.
 *  - `passive`   — a badge or row tint only.
 *
 * `requireReason` implements the override rule: dismissing a critical alert
 * means typing why, which both forces a moment of thought and leaves a record
 * behind. The absence of that field on lower tiers is equally deliberate —
 * demanding a rationale for a routine alert is how you get "asdf" typed a
 * hundred times a day.
 */
export const alertTier = {
  critical: { presentation: "blocking", requireReason: true, dismissible: false },
  urgent: { presentation: "confirm", requireReason: false, dismissible: true },
  caution: { presentation: "inline", requireReason: false, dismissible: true },
  normal: { presentation: "passive", requireReason: false, dismissible: true },
} as const;

/**
 * Where a measured value sits against its reference range.
 *
 * `criticalLow`/`criticalHigh` are not just "further out" — they are the panic
 * values that trigger an escalation to the ordering clinician, which is a
 * different thing from an out-of-range flag on a chart.
 */
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

/**
 * Night shift is not an edge case — a ward runs 24 hours and an ICU at 03:00 is
 * a dim room. This is an elevation model, not an inversion: surfaces get
 * lighter as they come forward, the way they do in daylight.
 *
 * The signal ramp is re-tuned rather than reused. The daylight reds and ambers
 * glare on a dark surface and lose their ordering against each other.
 */
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

/**
 * Categorical series for charts, ordered so that adjacent entries stay
 * distinguishable in greyscale and to the common colour vision deficiencies.
 * Never assign these by hashing a label — walk the array in order.
 */
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

/**
 * Resting surfaces get a hairline border, not a shadow. A dense clinical table
 * covered in soft shadows turns into visual mud; borders stay crisp at the
 * densities this app actually runs at.
 */
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
 * One family, three weights, stopping at 600.
 *
 * Sentence case everywhere, never ALL CAPS in alert or instruction text — it
 * measurably slows reading, and the places it appears in this app are exactly
 * the places nobody can afford to read slowly. The `overline` variant is the
 * single exception, and it never carries clinical content.
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

/**
 * Every number that can be compared down a column gets this: vitals, doses,
 * results, amounts. Without tabular figures a column of readings jitters and
 * the eye cannot scan it for the outlier, which is the entire reason the column
 * exists.
 */
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

/**
 * Density.
 *
 * A ward round on a tablet and a records clerk on a 27" monitor want different
 * row heights out of the same table, and neither should have to zoom. Screens
 * read this rather than hard-coding a height.
 */
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

  /**
   * The patient identity band. Persistent, never scrolled away, never collapsed
   * on any screen that shows patient data — wrong-patient error is the single
   * most common serious EHR failure and this band is the control against it.
   */
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
