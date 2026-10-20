"use client";
import { ActiveNavProvider, useActiveNav } from "@/components/claro/active-nav";
import { AskClaro } from "@/components/claro/ask-claro";
import { CommandPalette } from "@/components/claro/command-palette";
import {
  ExamCountdown,
  SubjectSwitcher,
  TopBar,
} from "@/components/claro/layout";
import { ThemeToggle, setTheme } from "./theme-toggle";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  History,
  Cards,
  Book,
  Dashboard,
  Message,
  SignOut,
  Pen,
  Target,
  User,
  Users,
  Wallet,
  Sprint,
  QuestionFile,
  type Icon,
} from "@/components/icons";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
import { useFeedback } from "@/components/feedback-widget";
import { HSC_EXAM } from "@/lib/hsc-exam";
import { PortalIcon } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = { label: string; href: string; icon: Icon };
export const nav: Record<
  "student" | "admin",
  { label: string; items: NavItem[] }[]
> = {
  student: [
    {
      label: "Practise",
      items: [
        { label: "Home", href: "/student", icon: Dashboard },
        { label: "Topic Sprint", href: "/student/sprint", icon: Sprint },
        { label: "Flashcards", href: "/student/flashcards", icon: Cards },
        { label: "Mark my answer", href: "/student/mark", icon: Pen },
      ],
    },
    {
      label: "Track",
      items: [
        { label: "Activity", href: "/student/activity", icon: History },
        { label: "Progress", href: "/student/progress", icon: Target },
      ],
    },
  ],
  admin: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", href: "/admin", icon: Dashboard }],
    },
    {
      label: "Students",
      items: [{ label: "All students", href: "/admin/students", icon: Users }],
    },
    {
      label: "Content",
      items: [
        {
          label: "Questions",
          href: "/admin/content/questions",
          icon: QuestionFile,
        },
        { label: "Flashcards", href: "/admin/content/flashcards", icon: Cards },
      ],
    },
    {
      label: "Marking",
      items: [
        { label: "Review queue", href: "/admin/marking/review", icon: Pen },
        { label: "Accuracy", href: "/admin/marking/accuracy", icon: Target },
        { label: "Engine", href: "/admin/marking/engine", icon: Book },
      ],
    },
    {
      label: "Feedback",
      items: [{ label: "Inbox", href: "/admin/feedback", icon: Message }],
    },
    {
      label: "Spend",
      items: [{ label: "AI spend", href: "/admin/spend", icon: Wallet }],
    },
  ],
};

/** The nav item a path belongs to: exact for section roots, prefix otherwise. */
export function activeItem(kind: keyof typeof nav, path: string) {
  const items = nav[kind].flatMap((g) => g.items);
  const root = items[0].href;
  return items.find((i) =>
    i.href === root
      ? path === root
      : path === i.href || path.startsWith(`${i.href}/`),
  );
}

const studentIcons: Record<
  string,
  React.ComponentProps<typeof PortalIcon>["name"]
> = {
  Home: "layout-grid",
  "Topic Sprint": "zap",
  Flashcards: "copy",
  "Mark my answer": "pen-line",
  Activity: "history",
  Progress: "target",
};

const initials = (name: string | null) =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export function AppShell(props: React.ComponentProps<typeof AppShellContent>) {
  return (
    <ActiveNavProvider>
      <AppShellContent {...props} />
    </ActiveNavProvider>
  );
}

function AppShellContent({
  kind,
  name,
  badges = {},
  defaultOpen,
  examDays = null,
  children,
}: {
  kind: keyof typeof nav;
  name: string | null;
  badges?: Record<string, number>;
  defaultOpen: boolean;
  examDays?: number | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const feedback = useFeedback();
  const override = useActiveNav(path);
  const active = activeItem(
    kind,
    kind === "student" ? (override ?? path) : path,
  );
  const signOutForm = useRef<HTMLFormElement>(null);
  const home = nav[kind][0].items[0].href;
  const commands = [
    ...nav.student.flatMap((g) => g.items),
    { label: "Profile", href: "/student/profile", icon: User },
    ...(kind === "admin" ? nav.admin.flatMap((g) => g.items) : []),
  ];
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#main"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="group/header relative h-16 flex-row items-center justify-between gap-2 pr-3 pl-5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            href={home}
            aria-label={kind === "admin" ? "Claro admin" : "Claro home"}
            className="ring-sidebar-ring flex justify-start rounded-md outline-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:group-hover/header:opacity-0 group-data-[collapsible=icon]:group-has-[[data-sidebar=trigger]:focus-visible]/header:opacity-0 focus-visible:ring-2"
          >
            {kind === "student" ? <ShellLogo /> : <Logo collapsible />}
          </Link>
          <SidebarHeaderToggle />
        </SidebarHeader>
        {kind === "student" && <SubjectSwitcher />}
        <SidebarContent className="pt-3 pb-2">
          <nav
            aria-label={
              kind === "admin" ? "Admin navigation" : "Main navigation"
            }
          >
            {nav[kind].map((group) => (
              <SidebarGroup key={group.label} className="mb-2">
                <SidebarGroupLabel className="mt-0">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item === active;
                    const badge = badges[item.href];
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          className="data-active:before:bg-brand h-9 overflow-visible rounded-xl font-medium data-active:font-semibold data-active:before:absolute data-active:before:-left-3 data-active:before:h-5 data-active:before:w-[3px] data-active:before:rounded-r"
                          isActive={isActive}
                          tooltip={item.label}
                          render={
                            <Link
                              href={item.href}
                              aria-label={item.label}
                              aria-current={isActive ? "page" : undefined}
                            />
                          }
                        >
                          {kind === "student" ? (
                            <PortalIcon name={studentIcons[item.label]} />
                          ) : (
                            <item.icon strokeWidth={1.75} />
                          )}
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {!!badge && (
                          <SidebarMenuBadge
                            aria-label={`${badge} ${kind === "admin" ? "open" : "due"}`}
                          >
                            {badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-sidebar-border gap-2 border-t px-3 pt-3 pb-4">
          {kind === "student" && examDays !== null && (
            <div className="group-data-[collapsible=icon]:hidden">
              <ExamCountdown
                name={HSC_EXAM.name}
                days={examDays}
                when={HSC_EXAM.when}
              />
            </div>
          )}
          {kind === "admin" && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Open student app"
                  render={
                    <Link href="/student" aria-label="Open student app" />
                  }
                >
                  <Sprint />
                  <span>Open student app</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center">
              <SidebarMenuButton
                className="min-w-0 flex-1 gap-3 px-2"
                size="lg"
                tooltip={name ?? "Profile"}
                render={<Link href="/student/profile" aria-label="Profile" />}
              >
                <Avatar className="after:border-0">
                  <AvatarFallback className="bg-brand-soft text-brand-text text-xs font-medium">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 leading-tight">
                  <span className="text-foreground truncate font-semibold">
                    {name ?? "Your account"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {kind === "admin" ? "Admin" : "Student"}
                  </span>
                </span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="User menu"
                  className="text-muted-foreground hover:bg-muted grid size-7 shrink-0 place-items-center rounded-full group-data-[collapsible=icon]:hidden"
                >
                  <span aria-hidden className="text-lg leading-none">
                    ⋯
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-48">
                  <DropdownMenuItem render={<Link href="/student/profile" />}>
                    <User />
                    Profile
                  </DropdownMenuItem>
                  {kind === "student" && (
                    <DropdownMenuItem onClick={() => feedback()}>
                      <Message />
                      Feedback
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      setTheme(
                        document.documentElement.classList.contains("dark")
                          ? "light"
                          : "dark",
                      )
                    }
                  >
                    <PortalIcon name="moon" />
                    Toggle theme
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => signOutForm.current?.requestSubmit()}
                  >
                    <SignOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* Collapsing hands the rail's freed width to the content column. */}
      <SidebarInset className="min-w-0 md:peer-data-[state=collapsed]:[--shell-reclaim:calc(var(--sidebar-width)-var(--sidebar-width-icon))]">
        <TopBar>
          <SidebarTrigger className="max-sm:size-9 md:hidden" />
          <Link
            href={home}
            aria-label={kind === "admin" ? "Claro admin" : "Claro home"}
            className="mr-auto md:hidden"
          >
            {kind === "student" ? <ShellLogo mobile /> : <Logo height={22} />}
          </Link>
          <CommandPalette routes={commands} />
          <div className="flex shrink-0 items-center gap-1 sm:ml-auto">
            <span className="relative grid place-items-center [&_button>svg]:hidden">
              <ThemeToggle />
              <PortalIcon
                name="moon"
                className="pointer-events-none absolute size-4 dark:hidden"
              />
              <PortalIcon
                name="sun"
                className="pointer-events-none absolute hidden size-4 dark:block"
              />
            </span>
            <form ref={signOutForm} action={signOut} className="hidden" />
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`ml-auto rounded-full ${kind === "student" ? "max-lg:ml-0" : ""}`}
                aria-label="Account menu"
              >
                <Avatar className="size-8 after:border-0">
                  <AvatarFallback className="bg-brand-soft text-brand-text text-xs font-medium">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {kind === "student" && (
                  <DropdownMenuItem onClick={() => feedback()}>
                    <Message />
                    Feedback
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  Use system theme
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/student/profile" />}>
                  <User />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOutForm.current?.requestSubmit()}
                >
                  <SignOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TopBar>
        <div
          id="main"
          className={
            kind === "student"
              ? "mx-auto w-full max-w-[calc(1400px+var(--shell-reclaim,0px))] min-w-0 flex-1 px-4 pt-6 pb-24 transition-[max-width] duration-200 ease-linear sm:px-8 sm:pt-8"
              : "mx-auto w-full max-w-[calc(1464px+var(--shell-reclaim,0px))] min-w-0 flex-1 px-4 py-6 transition-[max-width] duration-200 ease-linear sm:px-8 sm:py-8"
          }
        >
          {children}
        </div>
      </SidebarInset>
      {kind === "student" && <AskClaro />}
    </SidebarProvider>
  );
}

/**
 * Desktop sidebar toggle in the sidebar header. Expanded: sits right of the logo.
 * Collapsed: overlays the Claro tile and appears on header hover or keyboard focus
 * (ChatGPT/Claude rail pattern). The mobile drawer keeps the top-bar menu button.
 */
function SidebarHeaderToggle() {
  const { isMobile, open } = useSidebar();
  if (isMobile) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            aria-expanded={open}
            className="text-muted-foreground hover:text-foreground shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1/2 group-data-[collapsible=icon]:left-1/2 group-data-[collapsible=icon]:-translate-1/2 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:group-hover/header:opacity-100 group-data-[collapsible=icon]:focus-visible:opacity-100"
          />
        }
      />
      <TooltipContent side="right" align="center">
        {open ? "Collapse sidebar" : "Expand sidebar"} (⌘B)
      </TooltipContent>
    </Tooltip>
  );
}

/** Reuse the approved wordmark without the marketing tile in the portal chrome. */
function ShellLogo({ mobile = false }: { mobile?: boolean }) {
  return (
    <span role="img" aria-label="Claro" className="inline-flex shrink-0">
      {/* eslint-disable @next/next/no-img-element -- approved static brand assets */}
      <img
        src="/logos/claro-tile.svg"
        alt=""
        width={28}
        height={28}
        className="hidden shrink-0 rounded-[22%] group-data-[collapsible=icon]:block"
      />
      <img
        src="/logos/claro-lockup.svg"
        alt=""
        width={mobile ? 64 : 70}
        height={mobile ? 20 : 24}
        className="group-data-[collapsible=icon]:hidden dark:hidden"
      />
      <img
        src="/logos/claro-lockup-white.svg"
        alt=""
        width={mobile ? 64 : 70}
        height={mobile ? 20 : 24}
        className="hidden group-data-[collapsible=icon]:hidden dark:block"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
