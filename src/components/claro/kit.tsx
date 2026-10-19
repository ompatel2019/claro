"use client";
import { useState, type ReactNode } from "react";
import { PortalIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Button,
  Badge,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  Checkbox,
  Chip,
  OptionCard,
  RadioGroup,
  ToggleGroup,
  ToggleGroupItem,
  Skeleton,
  Toast,
} from "./controls";
import {
  BarList,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  DeltaPill,
  Meter,
  Progress,
  Ring,
  ScoreRing,
  StatCard,
  StatusBadge,
  TargetGauge,
} from "./data-display";
import { EmptyState, PageHeader, TermProgress, ExamCountdown } from "./layout";
import {
  PenCircle,
  PenTick,
  PenCross,
  PenCaret,
  PenWave,
  MarkupAnswer,
} from "./markup-answer";
function Block({
  title,
  description,
  children,
  wide,
}: {
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card className={wide ? "lg:col-span-2" : ""}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function Kit() {
  const [dialog, setDialog] = useState(false);
  const groups = [
    ["background", "card", "foreground", "muted", "muted-foreground", "border"],
    ["primary", "brand", "brand-soft", "brand-text", "success", "warning"],
  ];
  return (
    <>
      <PageHeader
        title="UI kit"
        description="Every primitive and Claro component used in the portal. Foundation reference; not part of the student navigation."
      />
      <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
        <Block
          title="Colour"
          description="Switch the theme to see the dark steps. Coral is reserved for active, the one highlight and the pen."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            {groups.map((group, i) => (
              <div key={i}>
                <p className="text-muted-foreground mb-3 text-xs">
                  {i ? "Brand and status" : "Surfaces and ink"}
                </p>
                <ul className="grid gap-3">
                  {group.map((n) => (
                    <li key={n} className="flex items-center gap-3">
                      <span
                        className="size-10 shrink-0 rounded-lg border"
                        style={{ background: `var(--${n})` }}
                      />
                      <span className="text-xs">--{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              "chart-1",
              "chart-2",
              "chart-3",
              "chart-track",
              "heat-0",
              "heat-1",
              "heat-2",
              "heat-3",
              "heat-4",
            ].map((n) => (
              <span
                key={n}
                title={n}
                className="h-8 w-10 rounded-md"
                style={{ background: `var(--${n})` }}
              />
            ))}
          </div>
        </Block>
        <Block
          title="Type"
          description="Claro Sans 4.1 for everything, including big numbers. Timers use tabular numerals."
        >
          <div className="grid gap-4">
            {[
              [
                "58%",
                "text-[48px] leading-none font-bold tracking-[-0.045em]",
                "Hero figure · 48/700",
              ],
              [
                "Page title",
                "text-[28px] font-bold tracking-[-0.025em]",
                "28/700",
              ],
              [
                "3h 9m",
                "text-[30px] font-bold tracking-[-0.035em]",
                "Stat value · 30/700",
              ],
              ["Card title", "text-[15px] font-semibold", "15/600"],
              ["Body text for reading", "text-sm", "14/400"],
              [
                "Description and labels",
                "text-[13px] text-muted-foreground",
                "13/400 muted",
              ],
              ["24:18", "text-[13px] tabular-nums", "Timer · Claro Sans"],
            ].map(([t, c, n]) => (
              <div
                key={t}
                className="flex items-baseline justify-between gap-4 border-b pb-3 last:border-0"
              >
                <span className={c}>{t}</span>
                <span className="text-muted-foreground text-right text-xs">
                  {n}
                </span>
              </div>
            ))}
          </div>
        </Block>
        <Block
          title="Buttons"
          description="Button variant and size. Pills everywhere; one primary per area."
        >
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "default",
                  "outline",
                  "secondary",
                  "ghost",
                  "brand",
                  "link",
                ] as const
              ).map((v) => (
                <Button key={v} variant={v}>
                  {v === "brand" && <PortalIcon name="flag" />}
                  {v[0].toUpperCase() + v.slice(1)}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button>
                <PortalIcon name="zap" />
                Default
              </Button>
              <Button size="lg">
                Large
                <PortalIcon name="arrow-right" />
              </Button>
              <Button size="icon" variant="outline" aria-label="Example search">
                <PortalIcon name="search" />
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Block>
        <Block
          title="Badges and deltas"
          description="Badge variants, DeltaPill and status badges. Status never relies on colour alone."
        >
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "default",
                  "secondary",
                  "outline",
                  "muted",
                  "brand",
                  "success",
                  "warning",
                ] as const
              ).map((v) => (
                <Badge key={v} variant={v}>
                  {v === "success" && <PortalIcon name="check" />}
                  {v === "warning" && <PortalIcon name="circle-alert" />}
                  {v === "brand"
                    ? "Focus"
                    : v === "success"
                      ? "Correct"
                      : v === "warning"
                        ? "Not marked"
                        : v}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <DeltaPill delta={4} unit=" pts" />
              <DeltaPill delta={-10} unit=" pts" />
              <DeltaPill delta={0} unit=" pts" />
              <DeltaPill delta={-3} unit=" min" neutral />
              <StatusBadge status="in-progress" />
              <StatusBadge status="provisional" />
            </div>
          </div>
        </Block>
        <Block
          title="Form controls"
          description="Input, Select, Textarea, ToggleGroup, Chip, Switch, Checkbox, option cards."
        >
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div data-slot="input-group">
                <PortalIcon name="search" />
                <Input
                  aria-label="Example search"
                  className="pl-9"
                  placeholder="Search with an icon"
                />
              </div>
              <Select
                defaultValue="a"
                items={{ a: "Select", b: "Another option" }}
              >
                <SelectTrigger aria-label="Example select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Select</SelectItem>
                  <SelectItem value="b">Another option</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              aria-label="Example answer"
              placeholder="Textarea grows with its content"
            />
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup defaultValue={["study"]} aria-label="Mode">
                <ToggleGroupItem value="study">Study</ToggleGroupItem>
                <ToggleGroupItem value="test">Test</ToggleGroupItem>
              </ToggleGroup>
              <Chip defaultPressed>20</Chip>
              <Chip>
                All <span className="chip-count">120</span>
              </Chip>
              <Switch defaultChecked aria-label="Example switch" />
              <Checkbox defaultChecked aria-label="Checked example" />
              <Checkbox indeterminate aria-label="Partly checked example" />
              <Checkbox aria-label="Unchecked example" />
            </div>
            <RadioGroup
              defaultValue="selected"
              aria-label="Example options"
              className="sm:grid-cols-2"
            >
              <OptionCard
                value="selected"
                title="Option card, selected"
                description="Coral ring, blush wash."
              />
              <OptionCard
                value="other"
                title="Option card"
                description="Hairline until chosen."
              />
            </RadioGroup>
          </div>
        </Block>
        <Block
          title="Data display"
          description="StatCard, Meter, Ring, ScoreRing, Sparkline, BarList, TargetGauge."
        >
          <div className="grid gap-5">
            <StatCard
              title="Marks earned"
              value="76"
              delta={15}
              description="vs previous 7 days"
              values={[3, 7, 6, 4, 7, 9, 10]}
              icon={<PortalIcon name="target" className="size-4" />}
            />
            <div className="flex items-center gap-5">
              <div className="grid flex-1 gap-3">
                <Meter value={62} label="Mastery" />
                <Meter value={48} tone="brand" label="Focus topic" />
                <Progress value={40} label="Session progress" />
              </div>
              <Ring value={1} max={3} size={32} />
              <ScoreRing score={15} of={25} size={80} />
            </div>
            <div className="grid items-center gap-5 sm:grid-cols-2">
              <BarList
                unit="marks"
                rows={[
                  { label: "Fiscal policy", value: 18 },
                  { label: "Exchange rates", value: 14 },
                  { label: "Inflation", value: 8 },
                ]}
              />
              <TargetGauge value={57} />
            </div>
          </div>
        </Block>
        <Block
          title="Examiner’s pen"
          description="Red-pen marks drawn over real content. Use it for feedback, never for decoration."
          wide
        >
          <div className="mb-5 flex flex-wrap items-center gap-8">
            <span className="text-[22px] font-bold">
              <PenCircle>48%</PenCircle>
            </span>
            <span className="flex gap-2">
              <PenTick />
              Tick
            </span>
            <span className="flex gap-2">
              <PenCross />
              Cross
            </span>
            <span className="flex gap-2">
              <PenCaret />
              Caret
            </span>
            <span className="flex gap-2">
              <PenWave />
              Wave
            </span>
          </div>
          <MarkupAnswer
            segments={[
              { text: "During a downturn, unemployment rises, so " },
              {
                text: "the government pays more unemployment benefits",
                kind: "credit",
                note: 1,
              },
              {
                text: ". Tax revenue also falls because people earn less",
                kind: "credit",
                note: 2,
              },
              {
                text: ". This makes the budget deficit bigger.",
                kind: "improve",
              },
            ]}
            notes={[
              {
                n: 1,
                kind: "credit",
                title: "Mark earned",
                text: "Correct spending-side effect.",
              },
              {
                n: 2,
                kind: "credit",
                title: "Mark earned",
                text: "Correct revenue-side effect.",
              },
            ]}
          />
        </Block>
        <Block title="Feedback" description="Empty, Skeleton, Toast, Dialog.">
          <div className="grid gap-5 sm:grid-cols-2">
            <EmptyState
              title="Nothing here yet"
              description="Say what to do next, never just “no data”."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => Toast("Ready to get started")}
                >
                  Do the thing
                </Button>
              }
            />
            <div className="grid content-start gap-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    Toast("Saved", {
                      description: "Toasts confirm, they never ask.",
                    })
                  }
                >
                  Show a toast
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog(true)}
                >
                  Open a dialog
                </Button>
              </div>
            </div>
          </div>
          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogContent>
              <DialogTitle>Foundation preview</DialogTitle>
              <DialogDescription>
                Dialogs keep focus inside and return it when closed.
              </DialogDescription>
              <Button onClick={() => setDialog(false)}>Done</Button>
            </DialogContent>
          </Dialog>
        </Block>
        <Block
          title="Layout rules"
          description="The grid every page is built on."
        >
          <ul className="grid gap-2.5 text-[13px] leading-snug">
            {[
              "12-column grid, 16px gaps (20px from 1280px). Content max 1400px, left aligned with the page title.",
              "Cards: white, 1px hairline, 16px radius, 20px padding, header → content → footer.",
              "Inner tiles 12px radius, inputs 10px, buttons and chips are pills.",
              "One PageHeader on every page: optional eyebrow, title, description, actions on the right.",
              "Builders: options left (8 cols), sticky live summary right (4 cols).",
              "Sessions run in focus mode: exit, progress, timer and Finish.",
              "Empty and low-data states say what to do next. ‘Not started’ beats 0%.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <PortalIcon
                  name="check"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Block>
        <Block
          title="Shell details"
          description="Term progress and the exam countdown take real values from their caller."
        >
          <div className="grid gap-4">
            <TermProgress term={4} week={2} />
            <ExamCountdown
              name="HSC Economics exam"
              days={8}
              when="Example · Tue 27 Oct, 1:55pm"
            />
          </div>
        </Block>
      </div>
    </>
  );
}
