"use client";

import { useId } from "react";
import type {
  AuthoredArchitectureEdge,
  AuthoredArchitectureNode,
  AuthoredNodeType,
  AuthoredScenario,
  AuthoredScenarioValidationError,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

const NODE_TYPES: AuthoredNodeType[] = ["service", "database", "queue", "external", "client", "other"];

interface ArchitectureSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function ArchitectureSection({ authored, errors, disabled, onChange }: ArchitectureSectionProps) {
  const nodeIdFieldId = useId();

  const addNode = () => {
    const newNode: AuthoredArchitectureNode = { id: "", label: "", type: "service" };
    onChange((prev) => ({
      ...prev,
      architecture: { ...prev.architecture, nodes: [...prev.architecture.nodes, newNode] },
    }));
  };

  const updateNode = (index: number, patch: Partial<AuthoredArchitectureNode>) => {
    onChange((prev) => {
      const nodes = prev.architecture.nodes.map((n, i) => (i === index ? { ...n, ...patch } : n));
      return { ...prev, architecture: { ...prev.architecture, nodes } };
    });
  };

  const removeNode = (index: number) => {
    onChange((prev) => {
      const nodes = prev.architecture.nodes.filter((_, i) => i !== index);
      return { ...prev, architecture: { ...prev.architecture, nodes } };
    });
  };

  const addEdge = () => {
    const newEdge: AuthoredArchitectureEdge = { from: "", to: "" };
    onChange((prev) => ({
      ...prev,
      architecture: { ...prev.architecture, edges: [...prev.architecture.edges, newEdge] },
    }));
  };

  const updateEdge = (index: number, patch: Partial<AuthoredArchitectureEdge>) => {
    onChange((prev) => {
      const edges = prev.architecture.edges.map((e, i) => (i === index ? { ...e, ...patch } : e));
      return { ...prev, architecture: { ...prev.architecture, edges } };
    });
  };

  const removeEdge = (index: number) => {
    onChange((prev) => {
      const edges = prev.architecture.edges.filter((_, i) => i !== index);
      return { ...prev, architecture: { ...prev.architecture, edges } };
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Architecture</h2>
      <SectionErrors errors={errors} />

      <div>
        <h3 className="text-sm font-medium">Nodes</h3>
        <div className="mt-3 flex flex-col gap-3">
          {authored.architecture.nodes.map((node, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-surface p-3">
              <input
                type="text"
                value={node.id}
                disabled={disabled}
                placeholder="node-id"
                aria-label={`Node ${index + 1} id`}
                id={index === 0 ? nodeIdFieldId : undefined}
                onChange={(e) => updateNode(index, { id: e.target.value })}
                className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
              <input
                type="text"
                value={node.label}
                disabled={disabled}
                placeholder="Label"
                aria-label={`Node ${index + 1} label`}
                onChange={(e) => updateNode(index, { label: e.target.value })}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
              <select
                value={node.type}
                disabled={disabled}
                aria-label={`Node ${index + 1} type`}
                onChange={(e) => updateNode(index, { type: e.target.value as AuthoredNodeType })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeNode(index)}
                  className="font-mono text-xs text-muted hover:text-[#dc2626]"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button
              type="button"
              onClick={addNode}
              className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
            >
              + Add Node
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Edges</h3>
        <div className="mt-3 flex flex-col gap-3">
          {authored.architecture.edges.map((edge, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-surface p-3">
              <input
                type="text"
                value={edge.from}
                disabled={disabled}
                placeholder="from node id"
                aria-label={`Edge ${index + 1} from`}
                onChange={(e) => updateEdge(index, { from: e.target.value })}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
              <span className="text-muted">→</span>
              <input
                type="text"
                value={edge.to}
                disabled={disabled}
                placeholder="to node id"
                aria-label={`Edge ${index + 1} to`}
                onChange={(e) => updateEdge(index, { to: e.target.value })}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeEdge(index)}
                  className="font-mono text-xs text-muted hover:text-[#dc2626]"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button
              type="button"
              onClick={addEdge}
              className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
            >
              + Add Edge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
