import { cn } from "@/lib/utils";
import { Chip as FoundationChip } from "../claro/controls";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export function Section({
  title,
  children,
  hint,
  compact = false,
}: {
  title: string;
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("space-y-3.5", !compact && "px-5 py-5 sm:px-6")}
      aria-label={title}
    >
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
