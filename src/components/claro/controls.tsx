"use client";
import type { ComponentProps, ReactNode } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Toggle } from "@base-ui/react/toggle";
import { Radio } from "@base-ui/react/radio";
import { cn } from "@/lib/utils";
import { Check, Minus } from "@/components/icons";

export { Button } from "@/components/ui/button";
export { Badge } from "@/components/ui/badge";
export { Input } from "@/components/ui/input";
export { Textarea } from "@/components/ui/textarea";
export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
export { Switch } from "@/components/ui/switch";
export { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
export { RadioGroup } from "@/components/ui/radio-group";
export { Skeleton } from "@/components/ui/skeleton";
export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
export { toast as Toast } from "sonner";
export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "data-checked:bg-primary data-checked:border-primary data-indeterminate:bg-primary data-indeterminate:border-primary text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {props.indeterminate ? <Minus /> : <Check />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export function Chip({
  className,
  children,
  ...props
}: ComponentProps<typeof Toggle>) {
  return (
    <Toggle
      data-slot="chip"
      className={cn(
        "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary",
        className,
      )}
      {...props}
    >
      {children}
    </Toggle>
  );
}
export function OptionCard({
  title,
  description,
  className,
  ...props
}: ComponentProps<typeof Radio.Root> & {
  title: string;
  description?: ReactNode;
}) {
  return (
    <Radio.Root
      data-slot="option-card"
      className={cn(
        "data-checked:border-brand data-checked:bg-brand-soft/60 data-checked:ring-brand/10 data-checked:ring-[3px]",
        className,
      )}
      {...props}
    >
      <span className="option-dot">
        <Radio.Indicator className="bg-brand size-2 rounded-full" />
      </span>
      <span className="pr-6 text-sm font-semibold">{title}</span>
      {description && (
        <span className="text-muted-foreground text-[13px]">{description}</span>
      )}
    </Radio.Root>
  );
}
