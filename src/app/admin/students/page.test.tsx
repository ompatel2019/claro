import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/students",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/admin-data", () => ({ loadStudentRows: vi.fn() }));

import { loadStudentRows } from "@/lib/admin-data";
import StudentsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps year beside search and moves secondary filters into the mobile sheet", async () => {
  vi.mocked(loadStudentRows).mockResolvedValue([
    {
      id: "student",
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      year_level: 12,
      school: "Claro College",
      joined: "2026-01-01T00:00:00.000Z",
      last_active: "2026-10-19T00:00:00.000Z",
      sessions_7d: 2,
      sessions_total: 9,
      answered: 31,
      avg_30: 76,
      streak: 4,
      open_disputes: 0,
      ai_spend: 1.25,
      blocked: false,
    },
  ]);

  render(await StudentsPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getAllByRole("combobox", { name: "Year" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Filters" })).toBeVisible();
  expect(screen.getByRole("table", { name: "Students" })).toBeVisible();
});
