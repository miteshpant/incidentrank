/**
 * Lightweight stand-in for @clerk/nextjs in component tests. Mutate
 * mockAuthState.isSignedIn before rendering to simulate signed-in/out UI.
 * Real Clerk wiring (middleware, actual auth) is exercised separately via
 * the server-side API route logic, not through these component tests.
 *
 * Usage in a test file (vi.mock calls are hoisted, so this must be called
 * directly at module scope in each file that needs it — not through a
 * shared helper function):
 *
 *   vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));
 */
export const mockAuthState: { isSignedIn: boolean; isLoaded: boolean } = {
  isSignedIn: false,
  isLoaded: true,
};
