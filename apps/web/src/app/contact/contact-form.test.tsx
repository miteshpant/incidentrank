import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "./contact-form";

function fillAndSubmit(overrides: { workEmail?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Acme Inc" } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText(/work email/i), {
    target: { value: overrides.workEmail ?? "jane@acme.com" },
  });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "We are interested." } });
  fireEvent.click(screen.getByRole("button", { name: /send message/i }));
}

describe("ContactForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes a hidden honeypot field not reachable by keyboard tab order", () => {
    render(<ContactForm />);
    const honeypot = screen.getByLabelText(/website/i, { selector: "input" });
    expect(honeypot).toHaveAttribute("tabindex", "-1");
  });

  it("shows the success message after a successful submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    render(<ContactForm />);

    await act(async () => {
      fillAndSubmit();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/thanks.*get back to you/i)).toBeInTheDocument();
    });
  });

  it("shows field-level errors returned by the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "validation", fieldErrors: { workEmail: "Enter a valid email address." } }),
            { status: 400 },
          ),
      ),
    );
    render(<ContactForm />);

    await act(async () => {
      fillAndSubmit({ workEmail: "not-an-email" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    });
  });

  it("shows the generic failure message on a network/server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "send_failed" }), { status: 502 })),
    );
    render(<ContactForm />);

    await act(async () => {
      fillAndSubmit();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/couldn't send your message/i)).toBeInTheDocument();
    });
  });
});
