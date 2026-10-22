// no-op stand-in for the "server-only" import guard in Vitest, which runs
// outside Next.js's client/server bundling boundary where that package's
// throw-on-import behavior would otherwise always fire.
export {};
