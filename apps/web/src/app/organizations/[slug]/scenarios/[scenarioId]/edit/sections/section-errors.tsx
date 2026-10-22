"use client";

import type { AuthoredScenarioValidationError } from "@incidentrank/scenarios/authoring";

interface SectionErrorsProps {
  errors: AuthoredScenarioValidationError[];
}

export function SectionErrors({ errors }: SectionErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 rounded-md border border-[#dc2626]/40 bg-[#dc2626]/5 p-3">
      {errors.map((error, index) => (
        <li key={`${error.path}-${index}`} className="text-sm text-[#dc2626]">
          <span className="font-mono text-[10px] uppercase tracking-wide">{error.path}</span>
          {" — "}
          {error.message}
        </li>
      ))}
    </ul>
  );
}
