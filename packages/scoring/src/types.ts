export interface ScoreBreakdown {
  recovery: number;
  customerImpact: number;
  dataIntegrity: number;
  reliability: number;
  costEfficiency: number;
  operationalEfficiency: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
  maxBreakdown: ScoreBreakdown;
}

export const SCORE_MAX: ScoreBreakdown = {
  recovery: 300,
  customerImpact: 200,
  dataIntegrity: 200,
  reliability: 150,
  costEfficiency: 100,
  operationalEfficiency: 50,
};
