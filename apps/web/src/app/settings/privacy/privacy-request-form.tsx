"use client";

import { useState, useTransition } from "react";

type PrivacyRequestType = "access" | "correction" | "other";

interface PrivacyRequestFormProps {
  existingRequests: Array<{
    id: string;
    requestType: string;
    status: string;
    requestedAt: string;
  }>;
}

const TYPE_LABEL: Record<PrivacyRequestType, string> = {
  access: "Access my data",
  correction: "Correct my data",
  other: "Other privacy question",
};

export function PrivacyRequestForm({ existingRequests }: PrivacyRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState(existingRequests);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType, notes: notes.trim() || undefined }),
      });
      if (response.ok) {
        const data = (await response.json()) as { request: { id: string; requestType: string; status: string; requestedAt: string } };
        setRequests((prev) => [data.request, ...prev]);
        setNotes("");
        setMessage("Request submitted. We'll follow up by email.");
      } else {
        setMessage("Could not submit your request. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label htmlFor="requestType" className="font-mono text-xs text-muted">
          Request type
        </label>
        <select
          id="requestType"
          value={requestType}
          onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {(Object.keys(TYPE_LABEL) as PrivacyRequestType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>

        <label htmlFor="notes" className="font-mono text-xs text-muted">
          Details (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          rows={3}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />

        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="w-fit rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit Request
        </button>

        {message && <p className="font-mono text-xs text-muted">{message}</p>}
      </div>

      {requests.length > 0 && (
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-muted">Your requests</p>
          <ul className="mt-3 flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3 text-sm">
                <span>{TYPE_LABEL[r.requestType as PrivacyRequestType] ?? r.requestType}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
