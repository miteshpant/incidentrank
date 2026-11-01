"use client";

import { useState, type FormEvent } from "react";

const MAX_MESSAGE_LENGTH = 4000;

type FieldErrors = Record<string, string>;
type Status = "idle" | "submitting" | "success" | "error";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-xs uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-[#dc2626]">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClassName =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFieldErrors({});

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/company-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.get("companyName"),
          name: data.get("name"),
          workEmail: data.get("workEmail"),
          message: data.get("message"),
          // Honeypot — left empty by a real visitor, hidden from view.
          website: data.get("website"),
        }),
      });

      if (response.ok) {
        setStatus("success");
        form.reset();
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | { error?: string; fieldErrors?: FieldErrors }
        | null;
      if (response.status === 400 && body?.error === "validation" && body.fieldErrors) {
        setFieldErrors(body.fieldErrors);
        setStatus("idle");
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-md border border-border bg-surface p-6 text-sm">
        Thanks — we&apos;ll get back to you shortly.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field id="companyName" label="Company name" error={fieldErrors.companyName}>
        <input
          id="companyName"
          name="companyName"
          type="text"
          required
          maxLength={200}
          className={inputClassName}
        />
      </Field>

      <Field id="name" label="Name" error={fieldErrors.name}>
        <input id="name" name="name" type="text" required maxLength={200} className={inputClassName} />
      </Field>

      <Field id="workEmail" label="Work email" error={fieldErrors.workEmail}>
        <input
          id="workEmail"
          name="workEmail"
          type="email"
          required
          maxLength={200}
          className={inputClassName}
        />
      </Field>

      <Field id="message" label="Message" error={fieldErrors.message}>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          maxLength={MAX_MESSAGE_LENGTH}
          className={inputClassName}
        />
      </Field>

      {/* Honeypot — hidden from sighted and keyboard users; a real visitor
          never populates it. Not aria-hidden on the input itself (that
          would also hide it from screen readers in a way that looks like
          a missing form control); instead the wrapper is visually and
          programmatically removed from the tab order. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-[#dc2626]">
          We couldn&apos;t send your message right now. Please try again.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-fit items-center rounded-md border border-foreground bg-foreground px-5 py-2.5 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
