import type { TimedEvent } from "@incidentrank/simulator";

// A deploy ships with the connection pool's max-size default accidentally
// dropped from 100 to 10. Traffic itself never changes — this is a config
// regression, not a demand-driven surge (contrast with
// database-connection-saturation, which is a traffic spike against an
// under-provisioned pool). The undersized ceiling alone is enough for
// normal, steady-state traffic to exhaust the pool shortly after the
// deploy finishes rolling out.
const DEPLOY_SHIPS_MS = 20_000;
const POOL_STARVES_MS = 45_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "regression-deploy-ships",
    atMs: DEPLOY_SHIPS_MS,
    type: "CONFIG_CHANGED",
    message: "Deploy v482 has rolled out. It silently dropped DB_POOL_MAX_SIZE's default from 100 to 10.",
    setTriggers: { regressionDeployed: true },
  },
  {
    id: "pool-starves",
    atMs: POOL_STARVES_MS,
    type: "TRIGGER_SET",
    message: "The connection pool is exhausted. Requests are queuing for a connection under completely normal traffic.",
    setTriggers: { regressionDeployed: true, poolStarving: true },
  },
];
