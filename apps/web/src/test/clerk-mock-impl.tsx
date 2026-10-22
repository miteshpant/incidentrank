import type { ReactNode } from "react";
import { mockAuthState } from "./clerk-mock";

export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useAuth() {
  return { isSignedIn: mockAuthState.isSignedIn, isLoaded: mockAuthState.isLoaded };
}

export function SignedIn({ children }: { children: ReactNode }) {
  return mockAuthState.isSignedIn ? children : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  return mockAuthState.isSignedIn ? null : children;
}

export function SignInButton({ children }: { children: ReactNode }) {
  return children;
}

export function SignOutButton({ children }: { children: ReactNode }) {
  return children;
}

export function UserButton() {
  return <button type="button">Account</button>;
}
