"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({ children, className = "secondary-button" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-busy={pending}>{pending ? "Guardando…" : children}</button>;
}
