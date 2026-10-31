import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Four independent-looking subsystems that each depend on the fleet's
 * local system clock for timestamp-ordered decisions, plus the NTP time
 * source all of them actually share. The point of this topology: there
 * is no edge between lock-service, ledger-service, and rate-limiter —
 * they share no direct dependency a candidate could trace through calls
 * or traffic. The only thing they share is ntp-time-source, several hops
 * away and easy to overlook, which is exactly why this is a
 * causal-unification diagnosis (one upstream root cause, several
 * simultaneous, seemingly-unrelated symptoms) rather than a classic
 * single-subsystem split-brain/leader-election/quorum-loss scenario.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "ntp-time-source", label: "NTP Time Source" },
    { id: "lock-service", label: "Distributed Lock Service" },
    { id: "ledger-service", label: "Event-Sourcing Ledger" },
    { id: "rate-limiter", label: "Sliding-Window Rate Limiter" },
    { id: "fleet-nodes", label: "Fleet Nodes" },
  ],
  edges: [
    { from: "ntp-time-source", to: "fleet-nodes" },
    { from: "fleet-nodes", to: "lock-service" },
    { from: "fleet-nodes", to: "ledger-service" },
    { from: "fleet-nodes", to: "rate-limiter" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "ntp-time-source": "healthy",
  "lock-service": "healthy",
  "ledger-service": "healthy",
  "rate-limiter": "healthy",
  "fleet-nodes": "healthy",
};
