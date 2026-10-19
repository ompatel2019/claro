"use client";

import type { ReactNode } from "react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortalIcon } from "@/components/icons";
import { Input, Button } from "@/components/claro/controls";
import { buttonVariants } from "@/components/ui/button";

type Filter = {
  name: string;
  label: string;
  all?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  clearOnChange?: string[];
};

/** Activity's two-row presentation, preserving the existing GET form fields. */
export function ActivityFilterControls({
  filters,
  values,
  hidden,
  activeCount,
  clearHref,
  children,
}: {
  filters: Filter[];
  values: Record<string, string | undefined>;
  hidden: Record<string, string | undefined>;
  activeCount: number;
  clearHref: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const search = filters.find((filter) => filter.name === "q")!;
  return (
    <Form key={JSON.stringify(values)} action={path}>
      {Object.entries(hidden)
        .filter((entry) => !!entry[1])
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="max-w-full min-w-0">{children}</div>
        <div className="relative w-full sm:w-64">
          <PortalIcon
            name="search"
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
          />
          <Input
            name="q"
            aria-label={search.label}
            placeholder={search.placeholder}
            defaultValue={values.q ?? ""}
            className="w-full pl-9"
          />
        </div>
      </div>
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 px-4 py-2.5">
        {filters
          .filter((filter) => filter.options)
          .map((filter) => (
            <select
              key={filter.name}
              name={filter.name}
              aria-label={filter.label}
              defaultValue={values[filter.name] ?? ""}
              className={`field bg-card h-9 max-w-full py-0 text-[13px] ${filter.name === "topic" ? "w-56" : filter.name === "sort" ? "w-40 sm:ml-auto" : filter.name === "range" ? "w-36" : "w-40"}`}
              onChange={(event) => {
                const form = event.currentTarget.form;
                for (const name of filter.clearOnChange ?? []) {
                  const input = form?.elements.namedItem(name);
                  if (input instanceof HTMLInputElement) input.disabled = true;
                }
                form?.requestSubmit();
              }}
            >
              <option value="">{filter.all}</option>
              {filter.options!.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {activeCount > 0 && (
          <Link
            href={clearHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Clear ({activeCount})
          </Link>
        )}
      </div>
    </Form>
  );
}
