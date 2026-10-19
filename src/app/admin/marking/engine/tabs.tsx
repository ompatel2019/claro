import { LinkTabs } from "@/components/link-tabs";

export function EngineTabs({ tab }: { tab: "docs" | "runs" }) {
  return (
    <LinkTabs
      label="Marking engine"
      active={tab}
      tabs={[
        {
          value: "docs",
          label: "Docs",
          href: "/admin/marking/engine?tab=docs",
        },
        {
          value: "runs",
          label: "Eval runs",
          href: "/admin/marking/engine?tab=runs",
        },
      ]}
    />
  );
}
