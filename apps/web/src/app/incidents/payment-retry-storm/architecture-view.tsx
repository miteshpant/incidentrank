"use client";

import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";
import { COMPONENT_LABELS } from "@/lib/payment-retry-storm-ui";

const HEALTH_LABEL: Record<ComponentHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
};

const HEALTH_DOT_CLASS: Record<ComponentHealth, string> = {
  healthy: "bg-accent",
  degraded: "bg-[#d97706]",
  critical: "bg-[#dc2626]",
};

interface ArchitectureViewProps {
  architecture: ArchitectureDefinition;
  componentHealth: Record<string, ComponentHealth>;
  selectedComponentId: string;
  onSelectComponent: (componentId: string) => void;
}

export function ArchitectureView({
  architecture,
  componentHealth,
  selectedComponentId,
  onSelectComponent,
}: ArchitectureViewProps) {
  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        System Architecture
      </h2>
      <ol className="mt-3 flex flex-col gap-1">
        {architecture.nodes.map((node, index) => {
          const health = componentHealth[node.id] ?? "healthy";
          const isSelected = node.id === selectedComponentId;
          const isLast = index === architecture.nodes.length - 1;

          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelectComponent(node.id)}
                aria-pressed={isSelected}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-foreground bg-surface"
                    : "border-border bg-surface/50 hover:border-foreground/40"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT_CLASS[health]}`}
                  aria-hidden="true"
                />
                <span className="flex-1">
                  {COMPONENT_LABELS[node.id] ?? node.label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {HEALTH_LABEL[health]}
                </span>
              </button>
              {!isLast && (
                <div
                  className="ml-[1.1rem] h-3 w-px bg-border"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
