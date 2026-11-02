import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact | IncidentRank",
  description:
    "Questions about using IncidentRank for hiring or engineering assessment — get in touch and we'll respond directly.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageViewTracker eventName="company_contact_opened" />
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Contact</h1>
        <p className="mt-2 text-sm text-muted">
          Questions about using IncidentRank for hiring, or anything else —
          send us a message and we&apos;ll get back to you.
        </p>

        <div className="mt-10">
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
