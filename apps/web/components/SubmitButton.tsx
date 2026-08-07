"use client";

import { useFormStatus } from "react-dom";

// Submit button that disables itself and shows a pending label while the
// enclosing server-action form is in flight (prevents double submissions).
export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
