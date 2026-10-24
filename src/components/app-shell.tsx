"use client";
import { ActiveNavProvider, useActiveNav } from "@/components/claro/active-nav";
import { CommandPalette } from "@/components/claro/command-palette";
import { ExamCountdown, TopBar } from "@/components/claro/layout";
import { ThemeToggle, setTheme } from "./theme-toggle";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useRef } from "react";
import {
  History,
  Cards,
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
import { useFeedback } from "@/components/feedback-widget";
import { cn } from "@/lib/utils";
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

type NavItem = {
  label: string;
  href: string;
  icon: Icon;
  /** Other routes this item owns (pages kept by URL but no longer in the nav). */
  also?: string[];
};
export const nav: Record<
  "student" | "admin",
  { label: string; items: NavItem[] }[]
> = {
  student: [
    {
      label: "",
      items: [{ label: "Home", href: "/student", icon: Dashboard }],
    },
    {
      label: "Practice",
      items: [
        { label: "Topic Sprint", href: "/student/sprint", icon: Sprint },
        { label: "Flashcards", href: "/student/flashcards", icon: Cards },
        { label: "Mark my answer", href: "/student/mark", icon: Pen },
      ],
    },
    {
      label: "Review",
      items: [
        { label: "Activity", href: "/student/activity", icon: History },
        { label: "Progress", href: "/student/progress", icon: Target },
      ],
    },
  ],
  // Three groups, eight links. Accuracy and Engine read as one "Marking quality";
  // every admin page stays reachable by URL.
  admin: [
    {
      label: "",
      items: [{ label: "Dashboard", href: "/admin", icon: Dashboard }],
    },
    {
      label: "People",
      items: [
        { label: "Students", href: "/admin/students", icon: Users },
        { label: "Feedback", href: "/admin/feedback", icon: Message },
      ],
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
        {
          label: "Marking quality",
          href: "/admin/marking/accuracy",
          icon: Target,
          also: ["/admin/marking/engine"],
        },
        { label: "AI spend", href: "/admin/spend", icon: Wallet },
      ],
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
      : [i.href, ...(i.also ?? [])].some(
          (href) => path === href || path.startsWith(`${href}/`),
        ),
  );
}

const navButtonClassName = "shell-nav-button";

const navIcons: Record<
  string,
  React.ComponentProps<typeof PortalIcon>["name"]
> = {
  Home: "layout-grid",
  "Topic Sprint": "zap",
  Flashcards: "copy",
  "Mark my answer": "pen-line",
  Activity: "history",
  Progress: "target",
  Dashboard: "layout-grid",
  Students: "users",
  Questions: "file-question",
  "Review queue": "pen-line",
  "Marking quality": "target",
  Feedback: "inbox",
  "AI spend": "tag",
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
    <SidebarProvider defaultOpen={defaultOpen} className="shell-frame">
      <a
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        href="#main"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon" className="shell-sidebar">
        <SidebarHeader className="h-16 flex-row items-center justify-between gap-2 pr-3 pl-5 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:gap-3 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:pt-4 group-data-[collapsible=icon]:pb-2">
          <Link
            href={home}
            aria-label={kind === "admin" ? "Claro admin" : "Claro home"}
            className="ring-sidebar-ring flex justify-start rounded-md outline-hidden group-data-[collapsible=icon]:justify-center focus-visible:ring-2"
          >
            <ShellLogo />
          </Link>
          <SidebarHeaderToggle />
        </SidebarHeader>
        <SidebarContent className="pt-3 pb-2">
          <nav
            aria-label={
              kind === "admin" ? "Admin navigation" : "Main navigation"
            }
          >
            {nav[kind].map((group) => (
              <SidebarGroup key={group.label} className="mb-2">
                {group.label && (
                  <SidebarGroupLabel className="mt-0 tracking-[0.01em]">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item === active;
                    const badge = badges[item.href];
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          className={navButtonClassName}
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
                          <PortalIcon
                            size={20}
                            strokeWidth={1.5}
                            name={navIcons[item.label]}
                          />
                          <span className="nav-label">
                            {item.label}
                            {isActive && <NavUnderline />}
                          </span>
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
            {kind === "student" && <FeedbackNavItem />}
          </nav>
        </SidebarContent>
        <SidebarFooter className="gap-3 px-4 pt-3 pb-4">
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
                  className={navButtonClassName}
                  tooltip="Open student app"
                  render={
                    <Link href="/student" aria-label="Open student app" />
                  }
                >
                  <PortalIcon
                    size={20}
                    strokeWidth={1.5}
                    name="arrow-up-right"
                  />
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
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
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
                  <PortalIcon size={20} strokeWidth={1.5} name="more" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-48">
                  <DropdownMenuItem render={<Link href="/student/profile" />}>
                    <PortalIcon size={20} name="user" strokeWidth={1.5} />
                    Profile
                  </DropdownMenuItem>
                  {kind === "student" && (
                    <DropdownMenuItem onClick={() => feedback()}>
                      <PortalIcon
                        size={20}
                        name="message-circle"
                        strokeWidth={1.5}
                      />
                      Send feedback
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
                    <PortalIcon size={20} strokeWidth={1.5} name="moon" />
                    Toggle theme
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("system")}>
                    Use system theme
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => signOutForm.current?.requestSubmit()}
                  >
                    <SignOut strokeWidth={1.5} />
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
        <TopBar
          className={cn(
            "bg-background h-16 gap-3 backdrop-blur-none md:px-10",
            kind === "student" && "md:pl-4",
          )}
        >
          <SidebarTrigger className="size-9 md:hidden" />
          <Link
            href={home}
            aria-label={kind === "admin" ? "Claro admin" : "Claro home"}
            className="mr-auto md:hidden"
          >
            <ShellLogo mobile />
          </Link>
          <CommandPalette routes={commands} />
          <div className="flex shrink-0 items-center gap-1 sm:ml-auto">
            <ThemeToggle />
            <form ref={signOutForm} action={signOut} className="hidden" />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="shell-account-menu ml-auto rounded-full md:hidden"
                aria-label="Account menu"
              >
                <Avatar className="size-8 after:border-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {kind === "student" && (
                  <DropdownMenuItem onClick={() => feedback()}>
                    <PortalIcon
                      size={20}
                      name="message-circle"
                      strokeWidth={1.5}
                    />
                    Send feedback
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  Use system theme
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/student/profile" />}>
                  <PortalIcon size={20} name="user" strokeWidth={1.5} />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOutForm.current?.requestSubmit()}
                >
                  <SignOut strokeWidth={1.5} />
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
              ? "mx-auto w-full max-w-[1088px] min-w-0 flex-1 px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-10 md:pb-10"
              : "mx-auto w-full max-w-[calc(1464px+var(--shell-reclaim,0px))] min-w-0 flex-1 px-4 pt-6 pb-10 transition-[max-width] duration-200 ease-linear md:px-10"
          }
        >
          {children}
        </div>
      </SidebarInset>
      {kind === "student" && (
        <Suspense
          fallback={<MobileTabs activeHref={studentTab(override ?? path)} />}
        >
          <StudentTabs path={override ?? path} />
        </Suspense>
      )}
    </SidebarProvider>
  );
}

function FeedbackNavItem() {
  const feedback = useFeedback();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type="button"
            className={navButtonClassName}
            tooltip="Send feedback"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              feedback();
            }}
          >
            <PortalIcon size={20} strokeWidth={1.5} name="message-circle" />
            <span>Send feedback</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/**
 * Desktop sidebar toggle in the sidebar header. Expanded: sits right of the logo.
 * Collapsed: stacked, always visible, directly under the Claro tile.
 * The mobile drawer keeps the top-bar menu button.
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
            className="text-muted-foreground hover:text-foreground shrink-0"
          />
        }
      />
      <TooltipContent side="right" align="center">
        {open ? "Collapse sidebar" : "Expand sidebar"} (⌘B)
      </TooltipContent>
    </Tooltip>
  );
}

/** Approved logo lockup, with the icon alone in the collapsed rail. */
function ShellLogo({ mobile = false }: { mobile?: boolean }) {
  return (
    <span role="img" aria-label="Claro" className="inline-flex shrink-0">
      {/* eslint-disable @next/next/no-img-element -- approved static brand assets */}
      <img
        src="/logos/claro-icon-orange.svg"
        alt=""
        width={28}
        height={28}
        className="hidden shrink-0 group-data-[collapsible=icon]:block"
      />
      <img
        src="/logos/claro-logo-primary-on-light.svg"
        alt=""
        width={mobile ? 96 : 110}
        height={(mobile ? 96 : 110) * (135.8 / 489.61)}
        className="group-data-[collapsible=icon]:hidden dark:hidden"
      />
      <img
        src="/logos/claro-logo-primary-on-dark.svg"
        alt=""
        width={mobile ? 96 : 110}
        height={(mobile ? 96 : 110) * (135.8 / 489.61)}
        className="hidden group-data-[collapsible=icon]:hidden dark:block"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}

function NavUnderline() {
  return (
    <svg
      className="nav-pen pen"
      viewBox="0 0 240 14"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M3 9.5C42 5.2 90 10.8 138 7.2S212 9.6 237 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const FEEDBACK_TAB = "/student/activity?status=finished";

/** Phone tab for a route: Activity lives under More; marked results and the finished view are Feedback. */
export function studentTab(path: string, status?: string | null) {
  if (path === "/student/activity")
    return status === "finished" ? FEEDBACK_TAB : path;
  if (path.startsWith("/student/activity/")) return FEEDBACK_TAB;
  return activeItem("student", path)?.href ?? path;
}

function StudentTabs({ path }: { path: string }) {
  return (
    <MobileTabs
      activeHref={studentTab(path, useSearchParams().get("status"))}
    />
  );
}

export function MobileTabs({ activeHref }: { activeHref?: string }) {
  const { setOpenMobile, openMobile } = useSidebar();
  const items = [
    ...["Home", "Topic Sprint", "Progress"].map((label) => {
      const item = nav.student
        .flatMap((g) => g.items)
        .find((i) => i.label === label)!;
      return {
        label: label === "Topic Sprint" ? "Sprint" : label,
        href: item.href,
        icon: navIcons[label],
      };
    }),
    { label: "Feedback", href: FEEDBACK_TAB, icon: "list-checks" as const },
  ];
  const moreActive = !!activeHref && !items.some((i) => i.href === activeHref);
  return (
    <nav className="student-tabbar" aria-label="Phone navigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={activeHref === item.href ? "page" : undefined}
        >
          <PortalIcon size={20} strokeWidth={1.5} name={item.icon} />
          <span className="nav-label">
            {item.label}
            {activeHref === item.href && <NavUnderline />}
          </span>
        </Link>
      ))}
      <button
        type="button"
        aria-label="More navigation"
        aria-current={moreActive ? "page" : undefined}
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <PortalIcon size={20} strokeWidth={1.5} name="more" />
        <span className="nav-label">More{moreActive && <NavUnderline />}</span>
      </button>
    </nav>
  );
}
