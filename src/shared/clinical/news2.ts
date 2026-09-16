/**
 * device-side NEWS2: a line-for-line port of the server's, for sets charted offline.
 * tests/news2Parity.test.ts keeps both copies in step; only the server's score is filed.
 */

export type Consciousness = "alert" | "confusion" | "voice" | "pain" | "unresponsive";

export interface News2Input {
  respiratoryRate?: number | string | null;
  spo2?: number | string | null;
  onOxygen?: boolean | null;
  systolic?: number | string | null;
  pulse?: number | string | null;
  consciousness?: string | null;
  temperatureC?: number | string | null;
  useScale2?: boolean;
}

export interface LocalNews2Band {
  key: "none" | "low" | "lowMedium" | "medium" | "high";
  label: string;
  tier: "normal" | "caution" | "urgent" | "critical";
  monitoringFrequency: string;
  response: string;
}

export interface LocalNews2Result {
  complete: boolean;
  total: number | null;
  partialTotal: number;
  band: LocalNews2Band | null;
  missing: string[];
  missingLabels: string[];
  parameters: Record<string, { value: number | boolean | string; score: number }>;
  highestSingleScore?: number;
  redFlagParameters: string[];
  scale: 1 | 2;
}

export const REQUIRED_PARAMETERS = [
  "respiratoryRate",
  "spo2",
  "onOxygen",
  "systolic",
  "pulse",
  "consciousness",
  "temperatureC",
] as const;

const PARAMETER_LABELS: Record<string, string> = {
  respiratoryRate: "respiratory rate",
  spo2: "oxygen saturation",
  onOxygen: "air or oxygen",
  systolic: "blood pressure",
  pulse: "pulse",
  consciousness: "consciousness",
  temperatureC: "temperature",
};

function scoreRespiratoryRate(rr: number) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function scoreSpo2Scale1(spo2: number) {
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function scoreSpo2Scale2(spo2: number, onOxygen: boolean) {
  if (spo2 <= 83) return 3;
  if (spo2 <= 85) return 2;
  if (spo2 <= 87) return 1;
  if (spo2 <= 92) return 0;
  if (!onOxygen) return 0;
  if (spo2 <= 94) return 1;
  if (spo2 <= 96) return 2;
  return 3;
}

function scoreSystolic(sbp: number) {
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

function scorePulse(pulse: number) {
  if (pulse <= 40) return 3;
  if (pulse <= 50) return 1;
  if (pulse <= 90) return 0;
  if (pulse <= 110) return 1;
  if (pulse <= 130) return 2;
  return 3;
}

function scoreConsciousness(level: string) {
  return level === "alert" ? 0 : 3;
}

function scoreTemperature(t: number) {
  if (t <= 35.0) return 3;
  if (t <= 36.0) return 1;
  if (t <= 38.0) return 0;
  if (t <= 39.0) return 1;
  return 2;
}

export const RISK_BANDS: Record<LocalNews2Band["key"], LocalNews2Band> = {
  none: {
    key: "none",
    label: "Routine",
    tier: "normal",
    monitoringFrequency: "Minimum 12 hourly",
    response: "Continue routine observations.",
  },
  low: {
    key: "low",
    label: "Low",
    tier: "caution",
    monitoringFrequency: "Minimum 4–6 hourly",
    response: "A registered nurse should assess the patient and decide whether to increase monitoring.",
  },
  lowMedium: {
    key: "lowMedium",
    label: "Low–medium",
    tier: "urgent",
    monitoringFrequency: "Minimum 1 hourly",
    response:
      "A registered nurse should urgently inform the medical team, who will decide whether escalation is needed.",
  },
  medium: {
    key: "medium",
    label: "Medium",
    tier: "urgent",
    monitoringFrequency: "Minimum 1 hourly",
    response:
      "Register a nurse to urgently request review by a clinician competent in acute illness.",
  },
  high: {
    key: "high",
    label: "High",
    tier: "critical",
    monitoringFrequency: "Continuous monitoring of vital signs",
    response:
      "Emergency assessment by a team with critical care competencies, including airway skills. Consider transfer to a higher level of care.",
  },
};

export function bandFor(total: number, highestSingleScore = 0): LocalNews2Band {
  if (total >= 7) return RISK_BANDS.high;
  if (total >= 5) return RISK_BANDS.medium;
  if (highestSingleScore === 3) return RISK_BANDS.lowMedium;
  if (total >= 1) return RISK_BANDS.low;
  return RISK_BANDS.none;
}

export function calculateNews2(input: News2Input | null | undefined): LocalNews2Result {
  const observations = (input || {}) as News2Input & Record<string, unknown>;

  // a value that is not a number is missing, never a reading (as in the server copy).
  const numeric = (v: unknown): number | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const missing = REQUIRED_PARAMETERS.filter((p) => {
    const v = observations[p];
    if (p === "onOxygen") return v === undefined || v === null;
    if (p === "consciousness") return !v;
    return numeric(v) === null;
  }) as string[];

  const parameters: LocalNews2Result["parameters"] = {};
  const add = (key: string, value: number | boolean | string, score: number) => {
    parameters[key] = { value, score };
  };

  const onOxygen = Boolean(observations.onOxygen);

  const rr = numeric(observations.respiratoryRate);
  if (rr !== null) add("respiratoryRate", rr, scoreRespiratoryRate(rr));

  const spo2 = numeric(observations.spo2);
  if (spo2 !== null) {
    add("spo2", spo2, observations.useScale2 ? scoreSpo2Scale2(spo2, onOxygen) : scoreSpo2Scale1(spo2));
  }
  if (observations.onOxygen !== undefined && observations.onOxygen !== null) {
    add("onOxygen", onOxygen, onOxygen ? 2 : 0);
  }
  const sbp = numeric(observations.systolic);
  if (sbp !== null) add("systolic", sbp, scoreSystolic(sbp));

  const pulse = numeric(observations.pulse);
  if (pulse !== null) add("pulse", pulse, scorePulse(pulse));
  if (observations.consciousness) {
    add("consciousness", observations.consciousness, scoreConsciousness(observations.consciousness));
  }
  const temp = numeric(observations.temperatureC);
  if (temp !== null) add("temperatureC", temp, scoreTemperature(temp));

  const total = Object.values(parameters).reduce((sum, p) => sum + p.score, 0);
  const highestSingle = Object.values(parameters).reduce((m, p) => Math.max(m, p.score), 0);
  const redFlagParameters = Object.entries(parameters)
    .filter(([, p]) => p.score === 3)
    .map(([key]) => PARAMETER_LABELS[key] || key);

  const scale: 1 | 2 = observations.useScale2 ? 2 : 1;

  if (missing.length > 0) {
    return {
      complete: false,
      total: null,
      partialTotal: total,
      band: null,
      missing,
      missingLabels: missing.map((p) => PARAMETER_LABELS[p] || p),
      parameters,
      redFlagParameters,
      scale,
    };
  }

  return {
    complete: true,
    total,
    partialTotal: total,
    band: bandFor(total, highestSingle),
    missing: [],
    missingLabels: [],
    parameters,
    highestSingleScore: highestSingle,
    redFlagParameters,
    scale,
  };
}
