import "server-only";
import { createDb } from "@incidentrank/db";

/**
 * One Drizzle client for the server runtime. Next.js dev-mode hot reload
 * would otherwise create a fresh postgres connection pool on every module
 * reload; cache it on globalThis to avoid exhausting connections locally.
 */
const globalForDb = globalThis as unknown as {
  __incidentrankDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__incidentrankDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__incidentrankDb = db;
}
