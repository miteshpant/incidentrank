import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-orchestrator", label: "Authentication Orchestrator" },
    { id: "session-store", label: "Session Store" },
    { id: "token-verification", label: "Token Verification" },
    { id: "mfa-provider", label: "MFA Provider" },
    { id: "risk-engine", label: "Risk Engine" },
    { id: "user-directory", label: "User Directory" },
  ],
  edges: [
    { from: "clients", to: "api-gateway" },
    { from: "api-gateway", to: "auth-orchestrator" },
    { from: "auth-orchestrator", to: "session-store" },
    { from: "auth-orchestrator", to: "token-verification" },
    { from: "auth-orchestrator", to: "mfa-provider" },
    { from: "auth-orchestrator", to: "risk-engine" },
    { from: "auth-orchestrator", to: "user-directory" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "auth-orchestrator": "healthy",
  "session-store": "healthy",
  "token-verification": "healthy",
  "mfa-provider": "healthy",
  "risk-engine": "healthy",
  "user-directory": "healthy",
};
