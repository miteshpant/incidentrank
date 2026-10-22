// Structured validation errors — never free-text-only, so an authoring UI
// can point the author at the exact section/field. `path` is a dotted
// pointer into the AuthoredScenario document (e.g. "rules[2].when[0].key").

export interface AuthoredScenarioValidationError {
  path: string;
  message: string;
}

export class AuthoredScenarioValidationException extends Error {
  readonly errors: AuthoredScenarioValidationError[];

  constructor(errors: AuthoredScenarioValidationError[]) {
    super(
      `Authored scenario failed validation: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
    this.name = "AuthoredScenarioValidationException";
    this.errors = errors;
  }
}
