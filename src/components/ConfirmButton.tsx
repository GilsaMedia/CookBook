"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A button that asks once: the first tap turns it into "are you sure?"
 * for a few seconds, the second does it. For things undo can't bring back
 * (a whole meal), without a dialog.
 */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  className,
  ariaLabel,
}: {
  label: ReactNode;
  confirm: ReactNode;
  onConfirm: () => void | Promise<void>;
  className?: string;
  ariaLabel?: string;
}) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(timer);
  }, [asking]);

  return (
    <button
      type="button"
      aria-label={asking ? undefined : ariaLabel}
      onClick={() => {
        if (!asking) return setAsking(true);
        setAsking(false);
        void onConfirm();
      }}
      className={className}
      // Inline, so it wins over the button's own colors while it asks.
      style={asking ? { backgroundColor: "#b91c1c", color: "#fff" } : undefined}
    >
      {asking ? confirm : label}
    </button>
  );
}
