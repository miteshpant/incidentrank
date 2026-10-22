import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto flex max-w-5xl flex-1 flex-col justify-center px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Engineering assessment platform
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Production is the test.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted text-pretty">
          Diagnose incidents. Operate the system. Restore production. Prove
          how you think under pressure.
        </p>

        <div className="mt-10">
          <Link
            href="/incidents"
            className="inline-flex items-center rounded-md border border-border bg-foreground px-5 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Try an Incident
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-5 font-mono text-xs text-muted">
          IncidentRank does not ask engineers what they would do. It puts
          them in a running system and measures what happens when they do
          it.
        </div>
      </footer>
    </main>
  );
}
