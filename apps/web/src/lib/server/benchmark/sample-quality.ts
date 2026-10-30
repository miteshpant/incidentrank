import "server-only";

/**
 * Centralized sample-size honesty (docs/implementation_plan/phase10e.md
 * §31). Used identically by both the scenario-calibration aggregate
 * queries and the admin dashboard UI labels — never computed ad-hoc in a
 * view component, so the thresholds can only ever be changed in one
 * place. Based on FIRST-attempt count specifically (not total attempts),
 * since first-attempt evidence is what the benchmark actually needs to be
 * unbiased (a single engineer repeating the same scenario 30 times is not
 * 30 independent data points).
 */
export type SampleQuality = "insufficient" | "early_signal" | "usable";

export const SAMPLE_QUALITY_THRESHOLDS = {
  insufficientBelow: 10,
  earlySignalBelow: 30,
} as const;

export function sampleQualityFor(firstAttemptCount: number): SampleQuality {
  if (firstAttemptCount < SAMPLE_QUALITY_THRESHOLDS.insufficientBelow) return "insufficient";
  if (firstAttemptCount < SAMPLE_QUALITY_THRESHOLDS.earlySignalBelow) return "early_signal";
  return "usable";
}

export const SAMPLE_QUALITY_LABEL: Record<SampleQuality, string> = {
  insufficient: "Insufficient data",
  early_signal: "Early signal",
  usable: "Usable beta signal",
};
