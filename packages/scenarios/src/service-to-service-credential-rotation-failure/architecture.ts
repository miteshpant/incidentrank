import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 5 edges — flat (ArchitectureNode/ArchitectureEdge per
 * phase-6e-strategy-spec.md section 15; no groups/containers/nesting).
 * Mirrors the spec exactly: Service A -> Service B -> Service C, with
 * Service B depending on the Secret Manager for whichever credential it
 * currently presents to Service C, and the Secret Manager and Service C
 * both depending on the Certificate/Token Issuer — Service C to validate
 * whatever credential it's handed, the Secret Manager to mint/rotate the
 * new credential in the first place. This is what makes "the Issuer has
 * minted a new credential" and "Service C's validator currently accepts
 * it" two distinct, legible things on a flat graph: rotation is a
 * multi-hop propagation (Issuer -> Secret Manager -> Service B's fetch
 * -> Service C's validation), not a single toggle.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "secret-manager", label: "Secret Manager" },
    { id: "cert-token-issuer", label: "Certificate / Token Issuer" },
  ],
  edges: [
    { from: "service-a", to: "service-b" },
    { from: "service-b", to: "service-c" },
    { from: "service-b", to: "secret-manager" },
    { from: "secret-manager", to: "cert-token-issuer" },
    { from: "service-c", to: "cert-token-issuer" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "secret-manager": "healthy",
  "cert-token-issuer": "healthy",
};
