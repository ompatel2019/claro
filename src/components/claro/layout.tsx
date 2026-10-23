import { Children, type ComponentProps, type ReactNode } from "react";
import { MobileFocusFeedback } from "./shell-s/focus-feedback";
import { cn } from "@/lib/utils";
import { PortalIcon } from "@/components/icons";
export {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-component="PageHeader"
      className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-muted-foreground mb-1 text-[13px] leading-[18px]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[30px] leading-9 font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 max-w-[68ch] text-[15px]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
export function FocusBar({
  children,
  className,
  ...props
}: ComponentProps<"header">) {
  const items = Children.toArray(children);
  return (
    <header
      data-component="FocusBar"
      className={cn(
        "bg-card/90 sticky top-0 z-30 border-b backdrop-blur-md",
        className,
      )}
      {...props}
    >
      {items.slice(0, -1)}
      <MobileFocusFeedback />
      {items.at(-1)}
    </header>
  );
}
export function TopBar({
  children,
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      data-component="TopBar"
      className={cn(
        "bg-background sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 md:px-10",
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}
export function TermProgress({
  term,
  week,
  weeks = 10,
}: {
  term: number;
  week: number;
  weeks?: number;
}) {
  return (
    <div
      data-component="TermProgress"
      className="bg-card flex h-9 items-center gap-3 rounded-full border px-3.5 text-[13px] font-medium shadow-xs"
      title={`Term ${term}, week ${week} of ${weeks}`}
    >
      <span>
        Term {term} · Week {week}
      </span>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: weeks }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full",
              i + 1 < week
                ? "bg-foreground/35 w-1.5"
                : i + 1 === week
                  ? "bg-brand w-4"
                  : "bg-foreground/12 w-1.5",
            )}
          />
        ))}
      </span>
    </div>
  );
}
export function SubjectSwitcher() {
  return (
    <div
      data-component="SubjectSwitcher"
      className="bg-card mx-4 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5"
    >
      <span className="text-muted-foreground grid shrink-0 place-items-center">
        <PortalIcon size={20} strokeWidth={1.5} name="book-open" />
      </span>
      <span className="grid flex-1 text-sm">
        <span className="font-semibold">Economics</span>
        <span className="text-muted-foreground text-xs">HSC · Year 12</span>
      </span>
      <PortalIcon
        size={20}
        strokeWidth={1.5}
        name="chevron-down"
        className="text-muted-foreground mr-0.5 size-4"
      />
    </div>
  );
}
export function ExamCountdown({
  name,
  days,
  when,
}: {
  name: string;
  days: number;
  when: string;
}) {
  return (
    <div
      data-component="ExamCountdown"
      className="bg-navy-deep relative overflow-hidden rounded-2xl border border-white/5 px-4 py-3.5 text-white"
    >
      <div className="relative">
        <p className="text-xs leading-4 font-semibold text-white/78">{name}</p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[28px] leading-8 font-bold tracking-[-0.02em] tabular-nums">
            {days}
          </span>
          <span className="text-sm font-semibold text-white/86">
            days to go
          </span>
        </p>
        <p className="mt-1 text-xs leading-4 text-white/78">{when}</p>
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div data-slot="empty">
      <span data-slot="empty-media">
        <PortalIcon name="layers" />
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-[13px]">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Kbd(props: ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" {...props} />;
}
export function Separator({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      data-slot="separator"
      data-orientation={vertical ? "vertical" : "horizontal"}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
    />
  );
}
