"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/claro";
import type { Range } from "./data";

const ranges = [7, 30, 90] as const;
export function RangeSelect({ range }: { range: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const navigate = (value: number) => {
    const next = new URLSearchParams(params);
    next.set("range", String(value));
    router.push(`${pathname}?${next}`);
  };
  return (
    <ToggleGroup
      aria-label="Date range"
      value={[String(range)]}
      size="sm"
      spacing={0}
      className="max-w-full"
      onValueChange={(value) => {
        const days = Number(value.at(-1));
        if (days === 7 || days === 30 || days === 90) navigate(days);
      }}
    >
      {ranges.map((days) => (
        <ToggleGroupItem key={days} value={String(days)}>
          {days} days
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
