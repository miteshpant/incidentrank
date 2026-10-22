"use client";

import { useRouter } from "next/navigation";

interface CandidateRowProps {
  href: string | null;
  children: React.ReactNode;
}

/** A table row that navigates on click when `href` is set (completed candidates only). */
export function CandidateRow({ href, children }: CandidateRowProps) {
  const router = useRouter();

  return (
    <tr
      onClick={href ? () => router.push(href) : undefined}
      className={`border-b border-border ${href ? "cursor-pointer hover:bg-surface" : ""}`}
    >
      {children}
    </tr>
  );
}
