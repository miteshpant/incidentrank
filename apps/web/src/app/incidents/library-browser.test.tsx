import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicScenarioMetadata } from "@incidentrank/scenarios";
import type { LibraryEntry } from "./library-browser";

let currentSearchParams = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import { LibraryBrowser } from "./library-browser";

function scenario(overrides: Partial<PublicScenarioMetadata> = {}): PublicScenarioMetadata {
  const base: PublicScenarioMetadata = {
    slug: "test-scenario",
    name: "Test Scenario",
    description: "A test scenario description.",
    difficulty: "senior",
    estimatedMinutes: 15,
    isFree: true,
    category: "Databases & Storage",
    tags: ["Postgres"],
    publicSkills: ["Diagnosing things"],
    architecture: { nodes: [], edges: [] },
  };
  return { ...base, ...overrides };
}

const KAFKA: LibraryEntry = {
  definition: scenario({
    slug: "kafka-consumer-lag",
    name: "Kafka Consumer Lag",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    isFree: true,
    category: "Messaging & Streaming",
    tags: ["Kafka", "Backpressure"],
    publicSkills: ["Diagnosing lag"],
    description: "A Kafka consumer group falls behind.",
  }),
  progress: null,
};

const CACHE_STAMPEDE: LibraryEntry = {
  definition: scenario({
    slug: "cache-stampede",
    name: "Cache Stampede",
    difficulty: "staff",
    estimatedMinutes: 35,
    isFree: false,
    category: "Caching",
    tags: ["Redis", "Concurrency"],
    publicSkills: ["Diagnosing stampedes"],
    description: "A cache expiry causes a thundering herd.",
  }),
  progress: null,
};

const DB_SATURATION: LibraryEntry = {
  definition: scenario({
    slug: "database-connection-saturation",
    name: "Database Connection Saturation",
    difficulty: "senior",
    estimatedMinutes: 15,
    isFree: true,
    category: "Databases & Storage",
    tags: ["Postgres", "Connection Pooling"],
    publicSkills: ["Diagnosing pool exhaustion"],
    description: "A connection pool is exhausted.",
  }),
  progress: { attemptCount: 2, bestScore: 870, completed: true },
};

const ENTRIES = [KAFKA, CACHE_STAMPEDE, DB_SATURATION];

beforeEach(() => {
  currentSearchParams = new URLSearchParams();
  replaceMock.mockClear();
});

describe("LibraryBrowser — search, filters, sort", () => {
  it("shows every entry with no filters applied", () => {
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Kafka Consumer Lag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cache Stampede" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
  });

  it("matches search against name, description, category, and tags", () => {
    currentSearchParams = new URLSearchParams({ q: "kafka" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Kafka Consumer Lag" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cache Stampede" })).not.toBeInTheDocument();
  });

  it("filters by access (free/paid)", () => {
    currentSearchParams = new URLSearchParams({ access: "paid" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Cache Stampede" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kafka Consumer Lag" })).not.toBeInTheDocument();
  });

  it("filters by category (multi-select OR within the group)", () => {
    currentSearchParams = new URLSearchParams({ category: "Messaging & Streaming,Caching" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Kafka Consumer Lag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cache Stampede" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Database Connection Saturation" }),
    ).not.toBeInTheDocument();
  });

  it("filters by difficulty", () => {
    currentSearchParams = new URLSearchParams({ difficulty: "staff" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Cache Stampede" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kafka Consumer Lag" })).not.toBeInTheDocument();
  });

  it("filters by tag", () => {
    currentSearchParams = new URLSearchParams({ tags: "Redis" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Cache Stampede" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kafka Consumer Lag" })).not.toBeInTheDocument();
  });

  it("filters by duration range", () => {
    currentSearchParams = new URLSearchParams({ duration: "under10" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByRole("heading", { name: "Kafka Consumer Lag" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cache Stampede" })).not.toBeInTheDocument();
  });

  it("combines filters with AND semantics across groups", () => {
    currentSearchParams = new URLSearchParams({
      category: "Databases & Storage",
      access: "free",
    });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kafka Consumer Lag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cache Stampede" })).not.toBeInTheDocument();
  });

  it("sorts by name", () => {
    currentSearchParams = new URLSearchParams({ sort: "name" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Cache Stampede",
      "Database Connection Saturation",
      "Kafka Consumer Lag",
    ]);
  });

  it("sorts by duration", () => {
    currentSearchParams = new URLSearchParams({ sort: "duration" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Kafka Consumer Lag",
      "Database Connection Saturation",
      "Cache Stampede",
    ]);
  });

  it("shows practice progress only when signed in", () => {
    const { rerender } = render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);
    expect(screen.queryByText(/best: 870/i)).not.toBeInTheDocument();

    rerender(<LibraryBrowser entries={ENTRIES} isSignedIn />);
    expect(screen.getByText(/best: 870 \/ 2 attempts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not attempted/i).length).toBeGreaterThan(0);
  });

  it("filters by progress status only when signed in", () => {
    currentSearchParams = new URLSearchParams({ progress: "completed" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn />);

    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kafka Consumer Lag" })).not.toBeInTheDocument();
  });

  it("shows an empty state when no scenarios match", () => {
    currentSearchParams = new URLSearchParams({ q: "no-such-scenario-xyz" });
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByText(/no scenarios match these filters/i)).toBeInTheDocument();
  });

  it("marks a paid scenario card as locked without a dead button", () => {
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    expect(screen.getByText(/🔒 Paid/i)).toBeInTheDocument();
    const viewLink = screen.getByRole("link", { name: /view scenario/i });
    expect(viewLink).toHaveAttribute("href", "/incidents/cache-stampede");
  });

  it("updates the URL query string when a filter checkbox is toggled", () => {
    render(<LibraryBrowser entries={ENTRIES} isSignedIn={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Caching" }));

    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining("category=Caching"),
      expect.objectContaining({ scroll: false }),
    );
  });
});
