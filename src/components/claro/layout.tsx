import type { ComponentProps, ReactNode } from "react";
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
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      data-component="PageHeader"
      className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-muted-foreground mb-1.5 text-sm">{eyebrow}</p>
        )}
        <h1>{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2 max-w-[62ch] text-sm leading-relaxed">
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
  return (
    <header
      data-component="FocusBar"
      className={cn(
        "bg-card/90 sticky top-0 z-30 border-b backdrop-blur-md",
        className,
      )}
      {...props}
    >
      {children}
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
        "bg-background/90 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-8",
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
      className="bg-card mx-3 flex items-center gap-3 rounded-xl border p-2 shadow-xs group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0"
    >
      <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <PortalIcon name="graduation-cap" size={18} />
      </span>
      <span className="grid flex-1 text-[13px] group-data-[collapsible=icon]:hidden">
        <span className="font-semibold">Economics</span>
        <span className="text-muted-foreground text-xs">HSC · Year 12</span>
      </span>
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
      className="relative overflow-hidden rounded-xl bg-[#1B1F34] p-4 text-white ring-1 ring-white/5"
    >
      <svg
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[72px]"
        viewBox="0 0 72 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon points="30,0 44,0 24,100 10,100" fill="#752C30" />
        <polygon points="52,0 72,0 72,100 32,100" fill="#E73C2B" />
      </svg>
      <div className="relative">
        <p className="text-xs font-medium text-white/65">{name}</p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[30px] leading-none font-bold tracking-[-0.03em]">
            {days}
          </span>
          <span className="text-[13px] text-white/80">days to go</span>
        </p>
        <p className="mt-1.5 text-xs text-white/55">{when}</p>
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
