"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function ReviewNotice({ message }: { message?: string }) {
  const resolved = message === "Resolved. Next review";
  useEffect(() => {
    if (resolved) toast.success(message, { id: "review-resolved" });
  }, [message, resolved]);
  return message && !resolved ? (
    <p
      role="status"
      className="bg-warning-soft text-warning-text rounded-xl p-4 text-sm"
    >
      {message}
    </p>
  ) : null;
}
