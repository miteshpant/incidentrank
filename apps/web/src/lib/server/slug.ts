import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Derives a URL-safe slug from an organization name, appending a short
 * random suffix to resolve collisions (organizations.slug is unique).
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";
}

export function randomSlugSuffix(): string {
  return randomBytes(3).toString("hex");
}
