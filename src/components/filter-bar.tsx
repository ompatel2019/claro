"use client";
import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Popover, PopoverContent } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { calendarDate } from "@/lib/students";
import { dateLabel } from "@/lib/practice";
import Form from "next/form";
import { FormSelect } from "./ui/form-select";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/claro/sheet";

export type Filter =
  | {
      name: string;
      label: string;
      options: { value: string; label: string }[];
      all: string;
      clearOnChange?: string[];
      chips?: boolean;
    }
  | { name: string; label: string; checkbox: true }
  | {
      name: string;
      label: string;
      dateRange: { from: string; to: string; today: string };
    }
  | {
      name: string;
      label: string;
      placeholder: string;
      inputMode?: "numeric";
      type?: "date";
    };

type FilterBarProps = {
  customSelect?: boolean;
  hidden?: Record<string, string | undefined>;
  /** Count external chips as well as the controls in this form. */
  activeCount?: number;
  /** Clear external filters too; by default hidden context is preserved. */
  clearHref?: string;
  filters: Filter[];
  values: Record<string, string | undefined>;
  /**
   * Mobile primary slot: pass the filter name(s) that stay beside `q`.
   * Below 768px, every other filter moves into the instant-apply Sheet;
   * from 768px all filters render in one wrapping row.
   */
  primary?: string | string[];
  /** Override the number on the mobile Filters button for external state. */
  overflowActiveCount?: number;
  /** Override the mobile Sheet's clear link. */
  overflowClearHref?: string;
};

/** URL-synced filters: controls apply instantly; text applies on Enter. */
export function FilterBar({
  filters,
  values,
  hidden,
  activeCount,
  clearHref,
  customSelect = false,
  primary,
  overflowActiveCount,
  overflowClearHref,
}: FilterBarProps) {
  const path = usePathname();
  const kept = Object.entries(hidden ?? {}).filter(
    (e): e is [string, string] => !!e[1],
  );
  const active =
    activeCount ??
    filters.reduce(
      (n, f) =>
        n +
        ("dateRange" in f
          ? Number(!!values[f.dateRange.from]) +
            Number(!!values[f.dateRange.to])
          : Number(!!values[f.name])),
      0,
    );
  const responsive = primary !== undefined;
  const primaryNames = new Set(
    Array.isArray(primary) ? primary : primary ? [primary] : [],
  );
  const inlineFilters = filters.filter(
    (filter) => filter.name === "q" || primaryNames.has(filter.name),
  );
  const overflowFilters = filters.filter(
    (filter) => !inlineFilters.includes(filter),
  );
  const overflowActive =
    overflowActiveCount ??
    overflowFilters.filter((filter) => filterIsActive(filter, values)).length;
  const sheetClearHref =
    overflowClearHref ?? hrefWithFilters(path, kept, inlineFilters, values);

  return (
    <>
      {responsive && (
        <div data-slot="filter-bar-mobile" className="grid gap-3 md:hidden">
          <Sheet>
            <Form
              key={`mobile-${JSON.stringify(values)}`}
              action={path}
              className="flex flex-wrap items-end gap-2"
            >
              <HiddenEntries entries={kept} />
              <HiddenFilterValues filters={overflowFilters} values={values} />
              {inlineFilters.map((filter) => (
                <FilterControl
                  key={filter.name}
                  filter={filter}
                  values={values}
                  customSelect={customSelect}
                  compact
                />
              ))}
              {!!overflowFilters.length && (
                <SheetTrigger
                  aria-label={
                    overflowActive
                      ? `Filters (${overflowActive} active)`
                      : "Filters"
                  }
                  render={<Button type="button" variant="outline" />}
                >
                  Filters
                  {overflowActive > 0 && (
                    <Badge variant="brand" className="h-5 min-w-5 px-1.5">
                      {overflowActive}
                    </Badge>
                  )}
                </SheetTrigger>
              )}
            </Form>
            {!!overflowFilters.length && (
              <SheetContent aria-label="More filters">
                <SheetHeader className="border-b">
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Changes apply as soon as you choose them.
                  </SheetDescription>
                </SheetHeader>
                <Form
                  key={`overflow-${JSON.stringify(values)}`}
                  action={path}
                  className="grid gap-4 overflow-y-auto px-4 pb-4"
                >
                  <HiddenEntries entries={kept} />
                  <HiddenFilterValues filters={inlineFilters} values={values} />
                  {overflowFilters.map((filter) => (
                    <FilterControl
                      key={filter.name}
                      filter={filter}
                      values={values}
                      customSelect={customSelect}
                    />
                  ))}
                  <Link
                    href={sheetClearHref}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                </Form>
              </SheetContent>
            )}
          </Sheet>
        </div>
      )}
      <Form
        key={`desktop-${JSON.stringify(values)}`}
        action={path}
        data-slot="filter-bar-desktop"
        className={`flex flex-wrap items-end gap-3 ${responsive ? "hidden md:flex" : ""}`}
      >
        <HiddenEntries entries={kept} />
        {filters.map((filter) => (
          <FilterControl
            key={filter.name}
            filter={filter}
            values={values}
            customSelect={customSelect}
          />
        ))}
        {active > 0 && (
          <Link
            href={
              clearHref ??
              (kept.length ? `${path}?${new URLSearchParams(kept)}` : path)
            }
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear ({active})
          </Link>
        )}
      </Form>
    </>
  );
}

function HiddenEntries({ entries }: { entries: [string, string][] }) {
  return entries.map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function HiddenFilterValues({
  filters,
  values,
}: {
  filters: Filter[];
  values: Record<string, string | undefined>;
}) {
  return filters.flatMap((filter) => {
    const names =
      "dateRange" in filter
        ? [filter.dateRange.from, filter.dateRange.to]
        : [filter.name];
    return names.flatMap((name) =>
      values[name] ? (
        <input key={name} type="hidden" name={name} value={values[name]} />
      ) : (
        []
      ),
    );
  });
}

function FilterControl({
  filter,
  values,
  customSelect,
  compact = false,
}: {
  filter: Filter;
  values: Record<string, string | undefined>;
  customSelect: boolean;
  compact?: boolean;
}) {
  if ("dateRange" in filter)
    return <DateRangeFilter filter={filter} values={values} />;
  if ("options" in filter && filter.chips)
    return (
      <KindChips
        filter={filter}
        value={values[filter.name]}
        compact={compact}
      />
    );
  return (
    <label
      className={`text-muted-foreground grid min-w-0 gap-1 text-[13px] font-medium ${compact ? "min-w-36 flex-1" : ""}`}
    >
      {!("checkbox" in filter) && filter.label}
      {"checkbox" in filter ? (
        <span className="flex h-9 items-center gap-2">
          <input
            type="checkbox"
            name={filter.name}
            value="1"
            defaultChecked={values[filter.name] === "1"}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="accent-primary size-4"
          />
          {filter.label}
        </span>
      ) : "options" in filter ? (
        customSelect ? (
          <SelectFilter
            filter={filter}
            initialValue={values[filter.name] ?? ""}
            compact={compact}
          />
        ) : (
          <select
            aria-label={filter.label}
            className={`field bg-card h-9 w-full py-0 ${compact ? "" : "max-w-64"}`}
            name={filter.name}
            defaultValue={values[filter.name] ?? ""}
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
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      ) : (
        <Input
          className={compact ? "w-full" : "w-48 max-w-full"}
          name={filter.name}
          inputMode={filter.inputMode}
          type={filter.type}
          placeholder={filter.placeholder}
          defaultValue={values[filter.name] ?? ""}
        />
      )}
    </label>
  );
}

function filterIsActive(
  filter: Filter,
  values: Record<string, string | undefined>,
) {
  return "dateRange" in filter
    ? !!(values[filter.dateRange.from] || values[filter.dateRange.to])
    : !!values[filter.name];
}

function hrefWithFilters(
  path: string,
  kept: [string, string][],
  filters: Filter[],
  values: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(kept);
  for (const filter of filters) {
    const names =
      "dateRange" in filter
        ? [filter.dateRange.from, filter.dateRange.to]
        : [filter.name];
    for (const name of names) {
      if (values[name]) params.set(name, values[name]);
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function SelectFilter({
  filter,
  initialValue,
  compact = false,
}: {
  filter: Extract<Filter, { options: unknown }>;
  initialValue: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const previous = useRef(initialValue);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const form = container.current?.closest("form");
    for (const name of filter.clearOnChange ?? []) {
      const input = form?.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.disabled = true;
    }
    form?.requestSubmit();
  }, [value, filter.clearOnChange]);
  return (
    <div ref={container} className={`w-full ${compact ? "" : "max-w-64"}`}>
      <FormSelect
        aria-label={filter.label}
        name={filter.name}
        value={value}
        onValueChange={setValue}
        options={[{ value: "", label: filter.all }, ...filter.options]}
      />
    </div>
  );
}

/** Opt-in URL kind chips; existing select filters retain their behaviour. */
function KindChips({
  filter,
  value,
  compact = false,
}: {
  filter: Extract<Filter, { options: unknown }>;
  value: string | undefined;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`grid min-w-0 gap-1 text-[13px] ${compact ? "flex-1" : ""}`}
    >
      <span className="text-muted-foreground font-medium">{filter.label}</span>
      <input
        ref={input}
        type="hidden"
        name={filter.name}
        defaultValue={value ?? ""}
      />
      <ToggleGroup
        aria-label={filter.label}
        value={[value || "all"]}
        className="w-full max-w-full flex-wrap justify-start"
        onValueChange={(next) => {
          if (!next.length || !input.current) return;
          input.current.value = next[0] === "all" ? "" : String(next[0]);
          input.current.form?.requestSubmit();
        }}
      >
        {[{ value: "all", label: filter.all }, ...filter.options].map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Opt-in Calendar range; both endpoints are ordinary URL form fields. */
function DateRangeFilter({
  filter,
  values,
}: {
  filter: Extract<Filter, { dateRange: unknown }>;
  values: Record<string, string | undefined>;
}) {
  const { from: fromName, to: toName, today } = filter.dateRange;
  const [from, setFrom] = useState(calendarDate(values[fromName]) ?? "");
  const [to, setTo] = useState(calendarDate(values[toName]) ?? "");
  const [endpoint, setEndpoint] = useState<"from" | "to">("from");
  const [open, setOpen] = useState(false);
  const fromInput = useRef<HTMLInputElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  // The label above already says "Date range"; the button shows the current value.
  const summary =
    from || to
      ? `${from ? dateLabel(from, true) : "Any date"} to ${to ? dateLabel(to, true) : "Any date"}`
      : "Any date";
  return (
    <div className="grid gap-1 text-[13px]">
      <span className="text-muted-foreground font-medium">{filter.label}</span>
      <input ref={fromInput} type="hidden" name={fromName} value={from} />
      <input ref={toInput} type="hidden" name={toName} value={to} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          aria-label={`${filter.label}: ${summary}`}
          render={<Button type="button" variant="outline" />}
        >
          {summary}
        </PopoverPrimitive.Trigger>
        <PopoverContent>
          <ToggleGroup
            aria-label="Date endpoint"
            value={[endpoint]}
            onValueChange={(v) => {
              if (v[0]) setEndpoint(v[0] as "from" | "to");
            }}
          >
            <ToggleGroupItem value="from">From</ToggleGroupItem>
            <ToggleGroupItem value="to">To</ToggleGroupItem>
          </ToggleGroup>
          <Calendar
            label={endpoint === "from" ? "From date" : "To date"}
            today={today}
            value={endpoint === "from" ? from : to}
            onChange={(day) => {
              let nextFrom = from;
              let nextTo = to;
              if (endpoint === "from") {
                nextFrom = day;
                if (to && day > to) nextTo = day;
              } else {
                nextTo = day;
                if (from && day < from) nextFrom = day;
              }
              setFrom(nextFrom);
              setTo(nextTo);
              if (fromInput.current) fromInput.current.value = nextFrom;
              if (toInput.current) toInput.current.value = nextTo;
              setOpen(false);
              fromInput.current?.form?.requestSubmit();
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
