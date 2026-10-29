import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  createPrivacyRequest,
  listPrivacyRequestsForUser,
  type PrivacyRequestType,
} from "@/lib/server/privacy-requests";

const REQUEST_TYPES: PrivacyRequestType[] = ["access", "correction", "other"];

interface CreatePrivacyRequestBody {
  requestType?: unknown;
  notes?: unknown;
}

/**
 * Phase 10D §43/§44. Self-service submission for access/correction/other
 * requests only — deletion has its own dedicated, real-automation route
 * (see /api/account/delete). userId is always derived server-side; never
 * accepted from the request body.
 */
export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreatePrivacyRequestBody | null;
  if (typeof body?.requestType !== "string" || !REQUEST_TYPES.includes(body.requestType as PrivacyRequestType)) {
    return NextResponse.json(
      { error: "requestType must be one of: access, correction, other" },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : undefined;

  const created = await createPrivacyRequest(user.id, body.requestType as PrivacyRequestType, { notes });

  return NextResponse.json({ request: created });
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await listPrivacyRequestsForUser(user.id);
  return NextResponse.json({ requests });
}
