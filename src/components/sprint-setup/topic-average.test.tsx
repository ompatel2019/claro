import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({ startSprint: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
afterEach(cleanup);

it("shows a topic's real average, clamped and rounded, or Not practised", async () => {
  const { TopicAverage } = await import("../sprint-setup");
  const { rerender, container } = render(<TopicAverage pct={64.6} />);
  expect(screen.getByText("65%")).toBeInTheDocument();
  expect(
    (container.querySelector("[aria-hidden] > span") as HTMLElement).style
      .width,
  ).toBe("65%");
  rerender(<TopicAverage pct={140} />);
  expect(screen.getByText("100%")).toBeInTheDocument();
  rerender(<TopicAverage pct={null} />);
  expect(screen.getByText("Not practised")).toBeInTheDocument();
  expect(screen.queryByText(/%/)).toBeNull();
});
