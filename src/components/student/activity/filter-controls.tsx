"use client";

import type { ComponentProps, ReactNode } from "react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortalIcon } from "@/components/icons";
import { Button } from "@/components/claro/controls";
import { buttonVariants } from "@/components/ui/button";

type Filter = {
  name: string;
  label: string;
  all?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  clearOnChange?: string[];
};

/** Activity's filter row: kind chips, then search and menus, preserving the GET form fields. */
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
  const icons: Record<string, ComponentProps<typeof PortalIcon>["name"]> = {
    status: "circle-dot",
    topic: "book-open",
    range: "clock",
    sort: "chevrons-up-down",
  };
  return (
    <Form key={JSON.stringify(values)} action={path} className="ac-filters">
      {Object.entries(hidden)
        .filter((entry) => !!entry[1])
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className="max-w-full min-w-0">{children}</div>
      <div className="ac-selects">
        <label className="ac-sel ac-search">
          <PortalIcon name="search" size={16} strokeWidth={1.5} />
          <input
            name="q"
            aria-label={search.label}
            placeholder={search.placeholder}
            defaultValue={values.q ?? ""}
          />
        </label>
        {filters
          .filter((filter) => filter.options)
          .map((filter) => (
            <label key={filter.name} className="ac-sel">
              <PortalIcon
                name={icons[filter.name]}
                size={16}
                strokeWidth={1.5}
              />
              <select
                name={filter.name}
                aria-label={filter.label}
                defaultValue={values[filter.name] ?? ""}
                onChange={(event) => {
                  const form = event.currentTarget.form;
                  for (const name of filter.clearOnChange ?? []) {
                    const input = form?.elements.namedItem(name);
                    if (input instanceof HTMLInputElement)
                      input.disabled = true;
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
              <PortalIcon
                name="chevron-down"
                size={16}
                strokeWidth={1.5}
                className="ac-chev"
              />
            </label>
          ))}
        <Button
          type="submit"
          variant="outline"
          className="sr-only focus:not-sr-only"
        >
          Apply
        </Button>
        {activeCount > 0 && (
          <Link
            href={clearHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <PortalIcon name="x" size={16} strokeWidth={1.5} />
            Clear filters ({activeCount})
          </Link>
        )}
      </div>
    </Form>
  );
}
