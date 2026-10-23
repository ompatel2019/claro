"use client";
import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PROGRESS_RANGES, type ProgressRange } from "@/lib/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function ProgressControls({ range }: { range: ProgressRange }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("range", value);
    startTransition(() =>
      router.replace(`${pathname}?${next}`, { scroll: false }),
    );
  }
  return (
    <div aria-busy={pending}>
      <Select
        items={PROGRESS_RANGES.map((r) => ({
          ...r,
          label: ["30", "90"].includes(r.value) ? `Last ${r.label}` : r.label,
        }))}
        disabled={pending}
        value={range}
        onValueChange={(v) => v && update(v)}
      >
        <SelectTrigger aria-label="Progress range" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROGRESS_RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {["30", "90"].includes(r.value) ? `Last ${r.label}` : r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
