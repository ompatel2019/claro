import { useId, useState } from "react";
import { Minus, Plus } from "../icons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { Chip as FoundationChip } from "../claro/controls";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export function Section({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3.5" aria-label={title}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && (
          <p className="text-muted-foreground mt-0.5 text-[13px]">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, React.ReactNode, boolean?][];
  onChange: (v: T) => void;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
    >
      {options.map(([v, text, disabled]) => (
        <label
          key={v}
          className={cn(
            "flex items-center gap-2 text-sm",
            disabled && "text-muted-foreground",
          )}
        >
          <RadioGroupItem value={v} disabled={disabled} />
          {text}
        </label>
      ))}
    </RadioGroup>
  );
}

export function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <FoundationChip
      pressed={on}
      disabled={disabled}
      onClick={onClick}
      className="h-auto min-h-8 max-w-full gap-1.5 text-left text-[13px] whitespace-normal"
    >
      {children}
    </FoundationChip>
  );
}

/** A single bounded value shared by buttons and direct keyboard input. */
export function Stepper({
  label,
  inputLabel = label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  inputLabel?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const parsed = Number(draft);
    onChange(
      Math.min(
        max,
        Math.max(min, Number.isFinite(parsed) ? Math.round(parsed) : min),
      ),
    );
    setDraft(null);
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm font-medium">
        {label}
        <span className="text-muted-foreground block text-xs font-normal">
          {min}–{max}
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <Input
          id={id}
          aria-label={inputLabel}
          type="number"
          min={min}
          max={max}
          step={1}
          className="w-16 text-center tabular-nums"
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <span className="sr-only" aria-live="polite">
          {label}: {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
