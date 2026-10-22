import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relations from "./relations";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and set it.",
    );
  }
  return url;
}

export function createDb(connectionString: string = requireDatabaseUrl()) {
  const client = postgres(connectionString);
  return drizzle(client, { schema: { ...schema, ...relations } });
}

export type Db = ReturnType<typeof createDb>;
